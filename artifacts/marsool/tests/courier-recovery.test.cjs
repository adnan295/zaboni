const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// Exercise the provider's real refresh callback with a minimal hook host.
// Effects are suppressed so these tests cannot open sockets, send GPS or push.
function harness() {
  let cursor = 0,
    data = [],
    failure = false;
  const slots = [];
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    createElement: (type, props) => ({ type, props }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === "function" ? next(slots[i]) : next;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initial });
    },
    useCallback: (fn) => fn,
    useEffect() {},
  };
  const exports = {};
  const mocks = {
    react,
    "react-native": { Platform: { OS: "web" } },
    "expo-location": {},
    "socket.io-client": {},
    "@/lib/pushRegistration": {},
    "@/lib/apiConfig": {},
    "@/context/AuthContext": {
      useAuth: () => ({
        user: { id: "test-courier" },
        isCourier: true,
        token: "fixture",
      }),
    },
    "@workspace/api-client-react": {
      customFetch: async () => {
        if (failure) throw new Error("offline");
        return data;
      },
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../context/CourierContext.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    console,
  });
  return {
    render() {
      cursor = 0;
      return exports.CourierProvider({ children: null }).props.value;
    },
    respond(value) {
      data = value;
      failure = false;
    },
    fail() {
      failure = true;
    },
  };
}

test("an offline refresh preserves the active delivery and recovers on retry", async () => {
  const h = harness();
  const order = { id: "order-1", status: "accepted" };
  h.respond([order]);
  await h.render().refreshActiveOrders();
  assert.deepEqual(h.render().activeOrders, [order]);
  h.fail();
  await h.render().refreshActiveOrders();
  assert.deepEqual(h.render().activeOrders, [order]);
  assert.equal(h.render().activeOrdersError, true);
  assert.equal(h.render().isLoadingActive, false);
  h.respond([]);
  await h.render().refreshActiveOrders();
  assert.deepEqual(h.render().activeOrders, []);
  assert.equal(h.render().activeOrdersError, false);
});

test("a malformed response is an error, not an empty delivery list", async () => {
  const h = harness();
  h.respond([{ id: "order-2" }]);
  await h.render().refreshActiveOrders();
  h.respond({ error: "unexpected" });
  await h.render().refreshActiveOrders();
  assert.equal(h.render().activeOrdersError, true);
  assert.equal(h.render().activeOrders[0].id, "order-2");
});
