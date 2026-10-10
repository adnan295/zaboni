const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "../../..");
const noop = () => {};
const logger = { info: noop, warn: noop, error: noop, debug: noop };
function load(file, mocks, extra = "", globals = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8") + "\n" + extra;
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const c = {
    exports: {},
    require: (id) => {
      if (!(id in mocks)) throw new Error("Unmocked import " + id);
      return mocks[id];
    },
    process: { env: {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Error,
    Date,
    AbortController,
    Buffer,
    ...globals,
  };
  vm.runInNewContext(js, c, { filename: file });
  return c.exports;
}
const workerFile = "artifacts/api-server/src/lib/orderDispatch.ts";
const pushFile = "artifacts/api-server/src/lib/push.ts";
const mobileFile = "artifacts/marsool/lib/pushRegistration.ts";
function worker(pool) {
  return load(
    workerFile,
    {
      "node:crypto": require("node:crypto"),
      "@workspace/db": { pool },
      "./logger": { logger },
    },
    "exports.setSend = fn => { dispatch = fn; };",
  );
}

// Real PostgreSQL SQL execution in an isolated, in-memory PGlite database.
// No production database, tokens, network requests, or phones are involved.
test("durable dispatch SQL recovers crashes, fences leases, retries, and never auto-cancels", async (t) => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY,status TEXT NOT NULL,courier_id TEXT DEFAULT '',
    restaurant_id TEXT,restaurant_name TEXT DEFAULT '',delivery_fee INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`);
  const pool = {
    query: async (sql, args) => {
      if (sql.includes("CREATE TABLE")) {
        await pg.exec(sql);
        return { rows: [], rowCount: 0 };
      }
      const r = await pg.query(sql, args);
      return { ...r, rowCount: r.rows.length };
    },
  };
  const w = worker(pool);
  await w.ensureDispatchSchema();
  await w.ensureDispatchSchema();
  let sends = 0,
    broaden;
  w.setSend(async (id, r, n, f, b) => {
    sends++;
    broaden = b;
    return { accepted: 0, failed: 1 };
  });
  await t.test(
    "committed order is recovered even when immediate enqueue never happened",
    async () => {
      await pg.exec(
        "INSERT INTO orders(id,status,created_at,updated_at) VALUES('o1','searching',NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day')",
      );
      await w.runDispatchCycle();
      assert.equal(sends, 1);
      assert.equal(broaden, true);
      const {
        rows: [r],
      } = await pg.query("SELECT * FROM order_dispatch WHERE order_id='o1'");
      assert.equal(r.attempts, 1);
      assert.equal(r.last_failed, 1);
      assert.equal(r.last_error, "push_rejected");
      assert.equal(r.lease_id, null);
      assert.ok(new Date(r.next_attempt_at) > new Date(r.last_attempt_at));
      assert.equal(
        (await pg.query("SELECT status FROM orders WHERE id='o1'")).rows[0]
          .status,
        "searching",
      );
    },
  );
  await t.test(
    "retry respects due time and provider acceptance still does not stop follow-up",
    async () => {
      await w.runDispatchCycle();
      assert.equal(sends, 1);
      await pg.exec(
        "UPDATE order_dispatch SET next_attempt_at=NOW()-INTERVAL '1 second'",
      );
      w.setSend(async () => {
        sends++;
        return { accepted: 1, failed: 0 };
      });
      await w.runDispatchCycle();
      assert.equal(sends, 2);
      assert.equal(
        (await pg.query("SELECT last_accepted FROM order_dispatch")).rows[0]
          .last_accepted,
        1,
      );
    },
  );
  await t.test("accepted and cancelled orders are never claimed", async () => {
    await pg.exec(
      "UPDATE orders SET status='accepted'; UPDATE order_dispatch SET next_attempt_at=NOW()-INTERVAL '1 second'",
    );
    await w.runDispatchCycle();
    assert.equal(sends, 2);
    await pg.exec("UPDATE orders SET status='cancelled'");
    await w.runDispatchCycle();
    assert.equal(sends, 2);
  });
  await t.test("reopened order is dispatched immediately", async () => {
    await pg.exec("UPDATE orders SET status='searching',updated_at=NOW()");
    await w.dispatchOrderNow("o1");
    assert.equal(sends, 3);
  });
  await t.test(
    "a fresh worker recovers an expired lease after a process crash",
    async () => {
      await pg.exec(
        "UPDATE order_dispatch SET lease_id='dead',lease_until=NOW()-INTERVAL '1 second',next_attempt_at=NOW()-INTERVAL '1 second'",
      );
      const restarted = worker(pool);
      restarted.setSend(async () => {
        sends++;
        return { accepted: 1, failed: 0 };
      });
      await restarted.runDispatchCycle();
      assert.equal(sends, 4);
    },
  );
  await t.test(
    "active lease is skipped and stale completion cannot overwrite a new owner",
    async () => {
      await pg.exec(
        "UPDATE order_dispatch SET lease_id='new-owner',lease_until=NOW()+INTERVAL '1 minute',next_attempt_at=NOW()-INTERVAL '1 second'",
      );
      await w.runDispatchCycle();
      assert.equal(sends, 4);
      await pg.query(
        "UPDATE order_dispatch SET last_error='stale' WHERE order_id=$1 AND lease_id=$2",
        ["o1", "old-owner"],
      );
      assert.notEqual(
        (await pg.query("SELECT last_error FROM order_dispatch")).rows[0]
          .last_error,
        "stale",
      );
    },
  );
  await t.test("two claim calls cannot own the same active order", async () => {
    await pg.exec("UPDATE order_dispatch SET lease_until=NULL");
    const a = await pg.query(w.CLAIM_DISPATCH_SQL, ["a", null]);
    const b = await pg.query(w.CLAIM_DISPATCH_SQL, ["b", null]);
    assert.equal(a.rows.length, 1);
    assert.equal(b.rows.length, 0);
  });
  await pg.close();
});

function pushHarness({ nativeOK = true, configured = true } = {}) {
  const sent = [],
    writes = [],
    warnings = [];
  class Expo {
    static isExpoPushToken() {
      return true;
    }
    chunkPushNotifications(m) {
      return [m];
    }
    async sendPushNotificationsAsync(m) {
      sent.push(...m);
      return m.map(() => ({ status: "ok", id: "receipt1" }));
    }
    async getPushNotificationReceiptsAsync() {
      return {
        receipt1: {
          status: "error",
          details: { error: "DeviceNotRegistered" },
        },
      };
    }
  }
  const pool = {
    query: async (sql, args) => {
      writes.push({ sql, args });
      return {
        rows: sql.startsWith("SELECT")
          ? [
              {
                id: "receipt1",
                token: "expo-token",
                order_id: "o1",
                created_at: new Date(),
              },
            ]
          : [],
      };
    },
  };
  const update = { set: () => ({ where: async () => {} }) };
  const push = load(pushFile, {
    "expo-server-sdk": { Expo },
    "@workspace/db": { pool, db: { update: () => update }, usersTable: {} },
    "drizzle-orm": { inArray: noop },
    "./logger": { logger: { ...logger, warn: (...x) => warnings.push(x) } },
    "./firebase": {
      isFcmConfigured: () => configured,
      sendFcmNotification: async () => ({
        success: nativeOK ? 1 : 0,
        failure: nativeOK ? 0 : 1,
        invalidTokens: [],
        errors: nativeOK ? [] : ["mock rejected"],
      }),
    },
    "./apns": {
      isApnsConfigured: () => false,
      sendApnsNotifications: async () => ({
        success: 0,
        failure: 1,
        invalidTokens: [],
      }),
    },
  });
  return { push, sent, writes, warnings };
}
test("native success avoids duplicate Expo alert", async () => {
  const h = pushHarness();
  const r = await h.push.sendCourierPush(
    [{ fcmToken: "native", pushToken: "expo", apnToken: null }],
    "title",
    "body",
    { type: "new_order", orderId: "o1" },
  );
  assert.equal(r.accepted, 1);
  assert.equal(h.sent.length, 0);
});
test("native failure falls back to urgent Expo alert and saves a receipt", async () => {
  const h = pushHarness({ nativeOK: false });
  const r = await h.push.sendCourierPush(
    [{ fcmToken: "native", pushToken: "expo", apnToken: null }],
    "title",
    "body",
    { type: "new_order", orderId: "o1" },
  );
  assert.equal(r.accepted, 1);
  assert.equal(h.sent[0].priority, "high");
  assert.equal(h.sent[0].ttl, 60);
  assert.equal(h.sent[0].channelId, "default");
  assert.equal(h.sent[0].data.orderId, "o1");
  assert.equal(h.sent[0].tag, "o1");
  assert.ok(h.writes.some((w) => w.sql.includes("INSERT INTO push_receipts")));
  assert.ok(h.warnings.length);
});
test("missing native provider is a visible failed courier submission", async () => {
  const h = pushHarness({ configured: false });
  const r = await h.push.sendCourierPush(
    [{ fcmToken: "native", pushToken: null, apnToken: null }],
    "title",
    "body",
    { type: "new_order", orderId: "o1" },
  );
  assert.equal(r.failed, 1);
  assert.equal(r.accepted, 0);
  assert.ok(h.warnings.length);
});
test("Expo receipt rejection wakes durable dispatch", async () => {
  const h = pushHarness();
  await h.push.checkPushReceipts();
  assert.ok(h.writes.some((w) => w.sql.includes("UPDATE order_dispatch")));
  assert.ok(h.writes.some((w) => w.sql.includes("DELETE FROM push_receipts")));
});

function mobileHarness(
  os = "android",
  fetchImpl = async () => ({ ok: true, status: 200 }),
  overrides = {},
) {
  const calls = [];
  const notices = {
    AndroidImportance: { MAX: 5, HIGH: 4, NONE: 0 },
    setNotificationChannelAsync: async () => {},
    getNotificationChannelAsync: async () => ({ importance: 5 }),
    getPermissionsAsync: async () => ({ status: "granted" }),
    requestPermissionsAsync: async () => ({ status: "granted" }),
    getDevicePushTokenAsync: async () => ({ data: "native-token" }),
    getExpoPushTokenAsync: async () => ({ data: "expo-token" }),
    ...overrides,
  };
  const m = load(
    mobileFile,
    {
      "react-native": { Platform: { OS: os } },
      "expo-notifications": notices,
      "expo-constants": {
        __esModule: true,
        default: {
          executionEnvironment: "standalone",
          easConfig: { projectId: "project" },
        },
        ExecutionEnvironment: { StoreClient: "store" },
      },
      "@/lib/apiConfig": { getApiBaseUrl: () => "https://test.invalid" },
    },
    "",
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return fetchImpl(url, options);
      },
      console: { warn: noop },
      setTimeout: (fn, ms) => setTimeout(fn, ms >= 5000 ? ms : 0),
    },
  );
  return { m, calls };
}
for (const os of ["android", "ios"])
  test(
    os + ": HTTP registration failures retry and never report ready",
    async () => {
      const h = mobileHarness(os, async () => ({ ok: false, status: 500 }));
      const r = await h.m.registerForPush("auth");
      assert.equal(r.ready, false);
      assert.equal(h.calls.length, 6);
      assert.ok(
        h.calls.some(
          (c) =>
            JSON.parse(c.options.body)[
              os === "android" ? "fcmToken" : "apnToken"
            ],
        ),
      );
    },
  );
test("one successfully registered path preserves fallback availability", async () => {
  const h = mobileHarness("ios", async (url) => ({
    ok: url.endsWith("/push-token"),
    status: url.endsWith("/push-token") ? 200 : 500,
  }));
  assert.equal((await h.m.registerForPush("auth")).ready, true);
});
test("denied permissions and blocked Android channel cannot report ready", async () => {
  const h = mobileHarness("android", undefined, {
    getPermissionsAsync: async () => ({ status: "denied" }),
    requestPermissionsAsync: async () => ({ status: "denied" }),
  });
  assert.equal((await h.m.registerForPush("auth")).ready, false);
  assert.equal(h.calls.length, 0);
  const b = mobileHarness("android", undefined, {
    getNotificationChannelAsync: async () => ({ importance: 0 }),
  });
  assert.equal((await b.m.registerForPush("auth")).ready, false);
  assert.equal(b.calls.length, 0);
});
test("expired auth is not retried three times per path", async () => {
  const h = mobileHarness("android", async () => ({ ok: false, status: 401 }));
  assert.equal((await h.m.registerForPush("auth")).ready, false);
  assert.equal(h.calls.length, 2);
});
test("courier dispatch eligibility matches stacking and visibility constraints", () => {
  const policy = load("artifacts/api-server/src/lib/courierDispatchPolicy.ts", {
    "./deliveryZones": { haversineKm: () => 16 },
  });
  assert.equal(policy.canReceiveNewOrder([]), true);
  assert.equal(policy.canReceiveNewOrder(["on_way"]), true);
  assert.equal(policy.canReceiveNewOrder(["accepted"]), false);
  assert.equal(policy.canReceiveNewOrder(["on_way", "picked_up"]), false);
  assert.equal(policy.isWithinOrderRadius(1, 1, 2, 2), false);
  assert.equal(policy.isWithinOrderRadius(null, null, 2, 2), true);
});
test("notification tap refreshes orders before GPS resolves", async () => {
  let callback,
    refreshes = 0,
    resolveGps;
  const gps = new Promise((r) => (resolveGps = r));
  const setup = load(
    "artifacts/marsool/components/PushNotificationSetup.tsx",
    {
      react: { useCallback: (fn) => fn },
      "react-native": { Platform: { OS: "android" } },
      "expo-location": {
        Accuracy: { Balanced: 3 },
        getForegroundPermissionsAsync: async () => ({ status: "granted" }),
        getCurrentPositionAsync: () => gps,
      },
      "@/context/AuthContext": { useAuth: () => ({ token: "auth" }) },
      "@/context/CourierContext": {
        useCourier: () => ({
          refreshAvailableOrders: async () => {
            refreshes++;
          },
          updateLocation: async () => {},
        }),
      },
      "@/hooks/usePushNotifications": {
        usePushNotifications: (fn) => {
          callback = fn;
        },
      },
      "@/context/NotificationsContext": {
        useNotifications: () => ({ addNotification: noop }),
      },
      "@/hooks/useAppNotificationSocket": { useAppNotificationSocket: noop },
    },
    "exports.setup = CourierPushSetup;",
  );
  setup.setup();
  const pending = callback();
  await new Promise((r) => setImmediate(r));
  assert.equal(refreshes, 1);
  resolveGps({ coords: { latitude: 1, longitude: 2 } });
  await pending;
});

test("direct FCM uses an urgent visible alert with short expiry and order identity", async () => {
  let payload;
  const f = load("artifacts/api-server/src/lib/firebase.ts", {
    "firebase-admin": {
      apps: [{}],
      messaging: () => ({
        sendEachForMulticast: async (p) => {
          payload = p;
          return {
            successCount: 1,
            failureCount: 0,
            responses: [{ success: true }],
          };
        },
      }),
    },
    "./logger": { logger },
  });
  await f.sendFcmNotification(["long-native-device-token"], "title", "body", {
    type: "new_order",
    orderId: "o1",
  });
  assert.equal(payload.android.priority, "high");
  assert.equal(payload.android.ttl, 60000);
  assert.equal(payload.notification.title, "title");
  assert.equal(payload.android.notification.channelId, "default");
  assert.equal(payload.data.orderId, "o1");
});
test("APNs alert is production priority 10, expires in one minute and counts each request once", async () => {
  const { EventEmitter } = require("node:events");
  let headers, body;
  const session = new EventEmitter();
  session.close = noop;
  session.destroy = noop;
  session.request = (h) => {
    headers = h;
    const req = new EventEmitter();
    req.destroy = noop;
    req.end = (b) => {
      body = JSON.parse(b);
      setImmediate(() => {
        req.emit("response", { ":status": 200 });
        req.emit("end");
        req.emit("error", new Error("late close"));
      });
    };
    return req;
  };
  const a = load(
    "artifacts/api-server/src/lib/apns.ts",
    {
      http2: {
        connect: (url, opts, cb) => {
          assert.equal(url, "https://api.push.apple.com");
          setImmediate(cb);
          return session;
        },
      },
      jsonwebtoken: { sign: () => "mock-jwt" },
      "./logger": { logger },
    },
    "",
    {
      process: {
        env: {
          APN_KEY:
            "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
          APN_KEY_ID: "mock",
          APPLE_TEAM_ID: "mock",
        },
      },
    },
  );
  const r = await a.sendApnsNotifications(
    ["long-enough-native-device-token"],
    "title",
    "body",
    { type: "new_order", orderId: "o1" },
  );
  assert.equal(r.success, 1);
  assert.equal(r.failure, 0);
  assert.equal(headers["apns-push-type"], "alert");
  assert.equal(headers["apns-priority"], "10");
  assert.equal(headers["apns-collapse-id"], "o1");
  assert.ok(Number(headers["apns-expiration"]) - Date.now() / 1000 <= 60);
  assert.equal(body.aps.sound, "default");
  assert.equal(body.orderId, "o1");
});
test("remaining courier batches stop after the order is accepted", async () => {
  const h = pushHarness();
  let batches = 0;
  const r = await h.push.sendCourierPush(
    Array.from({ length: 25 }, () => ({
      fcmToken: "native",
      apnToken: null,
      pushToken: null,
    })),
    "title",
    "body",
    { type: "new_order", orderId: "o1" },
    async () => ++batches === 1,
  );
  assert.equal(r.accepted, 20);
  assert.equal(batches, 2);
});
test("all zone submissions failing immediately broadens to other eligible couriers", async () => {
  const usersTable = {},
    ordersTable = {},
    restaurantsTable = {};
  let userOrderReads = 0;
  const calls = [];
  function query() {
    let table;
    const q = {
      from: (t) => ((table = t), q),
      where: () => q,
      limit: () => q,
      then: (yes, no) => {
        let rows;
        if (table === usersTable)
          rows = [
            {
              id: "zone-driver",
              zoneId: "z1",
              lat: null,
              lon: null,
              pushToken: null,
              fcmToken: "stale",
              apnToken: null,
            },
            {
              id: "near-driver",
              zoneId: "z2",
              lat: null,
              lon: null,
              pushToken: null,
              fcmToken: "fresh",
              apnToken: null,
            },
          ];
        else if (table === restaurantsTable)
          rows = [{ zoneId: "z1", lat: 1, lon: 1 }];
        else {
          userOrderReads++;
          rows =
            userOrderReads === 2
              ? []
              : [{ userId: "customer", status: "searching" }];
        }
        return Promise.resolve(rows).then(yes, no);
      },
    };
    return q;
  }
  const s = load("artifacts/api-server/src/orders/server.ts", {
    "../lib/courierDispatchPolicy": {
      canReceiveNewOrder: () => true,
      isWithinOrderRadius: () => true,
    },
    "socket.io": {},
    jsonwebtoken: {},
    "@workspace/db": {
      db: { select: () => query() },
      usersTable,
      ordersTable,
      restaurantsTable,
    },
    "drizzle-orm": { and: noop, eq: noop, ne: noop, notInArray: noop },
    "../lib/logger": { logger },
    "../lib/push": {
      sendCourierPush: async (devices) => {
        calls.push(devices.map((d) => d.id));
        return calls.length === 1
          ? { accepted: 0, failed: 1 }
          : { accepted: 1, failed: 0 };
      },
    },
    "../lib/webPush": {},
    "../middleware/adminAuth": {},
  });
  const r = await s.notifyNearbyCouriers("o1", "r1", "Restaurant", 100, false);
  assert.deepEqual(
    calls.map((x) => Array.from(x)),
    [["zone-driver"], ["near-driver"]],
  );
  assert.equal(r.accepted, 1);
});
