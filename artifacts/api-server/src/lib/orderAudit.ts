// Order audit: isolates orders and accounts that can distort the platform's
// numbers (repeat cancellers, late-night cancellations, cancelled errands,
// suspected fake accounts) so the admin can review them before deciding to
// delete or block. Pure functions over plain rows — the route does the SQL.

export interface AuditOrderRow {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  userCreatedAt: Date | null;
  userBlocked: boolean | null;
  status: string;
  orderType: string;
  orderText: string;
  restaurantName: string;
  placeName: string | null;
  totalPrice: number | null;
  deliveryFee: number;
  courierId: string;
  destinationLat: number | null;
  destinationLon: number | null;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelNote: string | null;
  /** First time a courier accepted the order (null if none ever did). */
  acceptedAt: Date | null;
  /** Courier-dispatch diagnostics (null = order never entered the dispatch queue). */
  dispatch?: {
    maxEligible: number | null; // null = recorded before eligibility tracking existed
    maxAccepted: number;
    lastError: string | null;
  } | null;
}

export type OrderFlag =
  | "repeat_cancel" // account cancelled 2+ times in the period
  | "reorder_cancel" // cancelled and the same account ordered again within the hour
  | "late_night" // cancelled inside the late-night window (Damascus time)
  | "errand_cancel" // cancelled free-text errand order
  | "after_courier" // customer cancelled after a courier had already accepted
  | "suspect_account"; // belongs to a medium/high-risk account

export type CancelBy = "customer" | "customer_after_courier" | "admin" | "system" | null;

export interface AuditOrder {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  status: string;
  orderType: string;
  summary: string;
  totalPrice: number | null;
  userId: string;
  userName: string;
  userPhone: string;
  cancelBy: CancelBy;
  /** Minutes spent searching for a courier (until accept, or until cancel if none accepted). */
  searchMinutes: number | null;
  flags: OrderFlag[];
}

export interface AuditAccount {
  userId: string;
  name: string;
  phone: string;
  createdAt: string | null;
  blocked: boolean;
  totalOrders: number;
  delivered: number;
  cancelled: number;
  cancelRate: number;
  reorderCancels: number;
  lateNightCancels: number;
  afterCourierCancels: number;
  errandCancels: number;
  sharedAddressWith: number;
  score: number;
  risk: "high" | "medium" | "low";
  reasons: string[];
  firstOrderAt: string;
  lastOrderAt: string;
}

export interface AuditOptions {
  lateFrom: number; // inclusive hour, Damascus
  lateTo: number; // exclusive hour, Damascus (may wrap past midnight)
}

const REORDER_WINDOW_MS = 60 * 60 * 1000;
// Orders with no real coordinates default to the old Damascus center — never
// treat that placeholder as a "shared address".
const PLACEHOLDER_COORDS = new Set(["33.5138,36.2765"]);

export function damascusHour(d: Date): number {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Damascus", hour: "numeric", hourCycle: "h23" }).format(d),
  );
  return Number.isFinite(h) ? h : (d.getUTCHours() + 3) % 24;
}

export function inLateWindow(hour: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

function cancelBy(o: AuditOrderRow): CancelBy {
  if (o.status !== "cancelled") return null;
  if (o.cancelNote === "admin_cancelled") return "admin";
  if (o.cancelNote === "auto_expired") return "system";
  // Customers can only cancel while searching, so a courier who accepted and
  // then released the order back to searching is visible only via acceptedAt.
  return o.courierId || o.acceptedAt ? "customer_after_courier" : "customer";
}

const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round(((b.getTime() - a.getTime()) / 60000) * 10) / 10);

/** Time the order spent waiting for a courier: until accepted, or until cancelled if nobody accepted. */
export function searchMinutes(o: AuditOrderRow): number | null {
  if (o.acceptedAt) return minutesBetween(o.createdAt, o.acceptedAt);
  if (o.status === "cancelled" && o.cancelledAt) return minutesBetween(o.createdAt, o.cancelledAt);
  return null;
}

function addressKey(o: AuditOrderRow): string | null {
  if (o.destinationLat == null || o.destinationLon == null) return null;
  const key = `${o.destinationLat.toFixed(4)},${o.destinationLon.toFixed(4)}`;
  return PLACEHOLDER_COORDS.has(key) ? null : key;
}

export function computeOrderAudit(rows: AuditOrderRow[], opts: AuditOptions) {
  const real = rows.filter((r) => r.userId && r.userId !== "guest");

  const byUser = new Map<string, AuditOrderRow[]>();
  for (const r of real) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  // Which distinct accounts ordered to each (rounded) delivery point.
  const usersByAddress = new Map<string, Set<string>>();
  for (const r of real) {
    const k = addressKey(r);
    if (!k) continue;
    const s = usersByAddress.get(k) ?? new Set<string>();
    s.add(r.userId);
    usersByAddress.set(k, s);
  }

  const orderFlags = new Map<string, Set<OrderFlag>>();
  const flag = (id: string, f: OrderFlag) => {
    const s = orderFlags.get(id) ?? new Set<OrderFlag>();
    s.add(f);
    orderFlags.set(id, s);
  };

  const accounts: AuditAccount[] = [];

  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const cancelled = list.filter((o) => o.status === "cancelled");
    const delivered = list.filter((o) => o.status === "delivered").length;

    let reorderCancels = 0;
    let lateNightCancels = 0;
    let afterCourierCancels = 0;
    let errandCancels = 0;

    for (const o of cancelled) {
      if (cancelled.length >= 2) flag(o.id, "repeat_cancel");

      const t = o.createdAt.getTime();
      const reordered = list.some(
        (x) => x.id !== o.id && Math.abs(x.createdAt.getTime() - t) <= REORDER_WINDOW_MS,
      );
      if (reordered) {
        reorderCancels++;
        flag(o.id, "reorder_cancel");
      }

      const when = o.cancelledAt ?? o.createdAt;
      if (inLateWindow(damascusHour(when), opts.lateFrom, opts.lateTo)) {
        lateNightCancels++;
        flag(o.id, "late_night");
      }

      if (o.orderType === "errand") {
        errandCancels++;
        flag(o.id, "errand_cancel");
      }

      if (cancelBy(o) === "customer_after_courier") {
        afterCourierCancels++;
        flag(o.id, "after_courier");
      }
    }

    const sharedWith = new Set<string>();
    for (const o of list) {
      const k = addressKey(o);
      if (!k) continue;
      for (const other of usersByAddress.get(k) ?? []) if (other !== userId) sharedWith.add(other);
    }

    const first = list[0]!;
    const last = list[list.length - 1]!;
    const cancelRate = list.length > 0 ? cancelled.length / list.length : 0;

    // Risk score — each signal adds weight and a human-readable reason.
    let score = 0;
    const reasons: string[] = [];
    if (delivered === 0 && cancelled.length >= 2) {
      score += 3;
      reasons.push(`ولا طلب واصل، و${cancelled.length} طلبات ملغاة`);
    }
    if (list.length >= 3 && cancelRate >= 0.6) {
      score += 2;
      reasons.push(`نسبة إلغاء ${Math.round(cancelRate * 100)}٪ من ${list.length} طلبات`);
    }
    if (reorderCancels >= 2) {
      score += 2;
      reasons.push(`كرّر الطلب وألغاه ${reorderCancels} مرات`);
    }
    if (afterCourierCancels >= 2) {
      score += 2;
      reasons.push(`ألغى ${afterCourierCancels} مرات بعد ما قبل المندوب`);
    }
    if (lateNightCancels >= 2) {
      score += 1;
      reasons.push(`${lateNightCancels} إلغاءات بساعات الليل المتأخرة`);
    }
    if (errandCancels >= 2) {
      score += 1;
      reasons.push(`${errandCancels} طلبات حرّة ملغاة`);
    }
    if (sharedWith.size > 0) {
      score += 1;
      reasons.push(`نفس عنوان التوصيل مع ${sharedWith.size} حساب تاني`);
    }
    const name = (first.userName ?? "").trim();
    if (name.length < 2) {
      score += 1;
      reasons.push("بدون اسم حقيقي");
    }
    if (
      cancelled.length > 0 &&
      first.userCreatedAt &&
      first.createdAt.getTime() - first.userCreatedAt.getTime() < 24 * 60 * 60 * 1000 &&
      delivered === 0
    ) {
      score += 1;
      reasons.push("حساب جديد طلب وألغى بأول يوم");
    }

    const risk: AuditAccount["risk"] = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
    if (risk !== "low") for (const o of list) flag(o.id, "suspect_account");

    if (score > 0 || cancelled.length > 0) {
      accounts.push({
        userId,
        name: name || "—",
        phone: first.userPhone ?? "",
        createdAt: first.userCreatedAt ? first.userCreatedAt.toISOString() : null,
        blocked: !!first.userBlocked,
        totalOrders: list.length,
        delivered,
        cancelled: cancelled.length,
        cancelRate: Math.round(cancelRate * 100),
        reorderCancels,
        lateNightCancels,
        afterCourierCancels,
        errandCancels,
        sharedAddressWith: sharedWith.size,
        score,
        risk,
        reasons,
        firstOrderAt: first.createdAt.toISOString(),
        lastOrderAt: last.createdAt.toISOString(),
      });
    }
  }

  accounts.sort((a, b) => b.score - a.score || b.cancelled - a.cancelled);

  const toAuditOrder = (o: AuditOrderRow): AuditOrder => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
    status: o.status,
    orderType: o.orderType,
    summary: (o.orderType === "errand" ? o.placeName || o.orderText : o.restaurantName || o.orderText).slice(0, 80),
    totalPrice: o.totalPrice,
    userId: o.userId,
    userName: (o.userName ?? "").trim() || "—",
    userPhone: o.userPhone ?? "",
    cancelBy: cancelBy(o),
    searchMinutes: searchMinutes(o),
    flags: [...(orderFlags.get(o.id) ?? [])],
  });

  const flagged = real
    .filter((o) => orderFlags.has(o.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(toAuditOrder);

  // Impact: how the headline numbers move if suspect accounts are excluded.
  const suspectIds = new Set(accounts.filter((a) => a.risk !== "low").map((a) => a.userId));
  const clean = real.filter((o) => !suspectIds.has(o.userId));
  const rate = (list: AuditOrderRow[]) =>
    list.length ? Math.round((list.filter((o) => o.status === "cancelled").length / list.length) * 1000) / 10 : 0;

  const countFlag = (f: OrderFlag) => flagged.filter((o) => o.flags.includes(f)).length;

  return {
    summary: {
      totalOrders: real.length,
      cancelled: real.filter((o) => o.status === "cancelled").length,
      cancelRate: rate(real),
      flaggedOrders: flagged.length,
      suspectAccounts: suspectIds.size,
      highRiskAccounts: accounts.filter((a) => a.risk === "high").length,
      suspectOrders: real.length - clean.length,
      suspectDelivered: real.filter((o) => suspectIds.has(o.userId) && o.status === "delivered").length,
      cleanTotalOrders: clean.length,
      cleanCancelRate: rate(clean),
      byFlag: {
        repeat_cancel: countFlag("repeat_cancel"),
        reorder_cancel: countFlag("reorder_cancel"),
        late_night: countFlag("late_night"),
        errand_cancel: countFlag("errand_cancel"),
        after_courier: countFlag("after_courier"),
        suspect_account: countFlag("suspect_account"),
      } satisfies Record<OrderFlag, number>,
    },
    accounts,
    orders: flagged,
  };
}

// ─── Search wait: where customers give up waiting for a courier ──────────

export const WAIT_BUCKETS = [
  { label: "أقل من دقيقة", max: 1 },
  { label: "١–٣ د", max: 3 },
  { label: "٣–٥ د", max: 5 },
  { label: "٥–١٠ د", max: 10 },
  { label: "١٠–٢٠ د", max: 20 },
  { label: "٢٠–٤٠ د", max: 40 },
  { label: "أكتر من ٤٠ د", max: Infinity },
] as const;

function bucketIndex(min: number): number {
  const i = WAIT_BUCKETS.findIndex((b) => min < b.max);
  return i === -1 ? WAIT_BUCKETS.length - 1 : i;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
}

export interface GaveUpOrder {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  waitMinutes: number;
  hour: number;
  orderType: string;
  summary: string;
  userId: string;
  userName: string;
  userPhone: string;
  cancelBy: "customer" | "admin";
  /** The customer placed another order later that got delivered. */
  cameBack: boolean;
  /** Why no courier took it — see lostReason(). */
  lostReason: LostReason;
  /** Most couriers that were available at any dispatch attempt (null = unknown). */
  availableCouriers: number | null;
  /** Most devices the new-order push was accepted for. */
  notifiedDevices: number;
}

/**
 * no_couriers  — nobody online and free at any attempt (supply problem)
 * push_failed  — couriers were available but no push could be delivered (tech problem)
 * not_accepted — couriers were notified and none took it (price/distance/attention problem)
 * unknown      — order never reached the dispatcher, or recorded before tracking
 */
export type LostReason = "no_couriers" | "push_failed" | "not_accepted" | "unknown";

export function lostReason(o: AuditOrderRow): LostReason {
  const d = o.dispatch;
  if (!d) return "unknown";
  if (d.maxEligible === 0) return "no_couriers";
  if (d.maxAccepted > 0) return "not_accepted";
  if (d.lastError === "no_reachable_couriers") return "no_couriers";
  if (d.lastError === "push_rejected") return "push_failed";
  return "unknown";
}

export interface SearchWaitCustomer {
  userId: string;
  name: string;
  phone: string;
  gaveUp: number;
  avgWaitMinutes: number;
  maxWaitMinutes: number;
  totalOrders: number;
  delivered: number;
  lastGaveUpAt: string;
  /** lost = never got a delivery after giving up; returned = came back and got served. */
  status: "lost" | "returned";
}

/**
 * Measures how long orders waited for a courier, and how long customers who
 * cancelled before any courier accepted had waited. Rows from accounts in
 * `excludeUserIds` (e.g. likely fake accounts) are ignored.
 */
export function computeSearchWait(rows: AuditOrderRow[], excludeUserIds: Set<string> = new Set()) {
  const real = rows.filter((r) => r.userId && r.userId !== "guest" && !excludeUserIds.has(r.userId));

  const gaveUpRows = real.filter((o) => o.status === "cancelled" && !o.acceptedAt && o.cancelledAt);
  const acceptedRows = real.filter((o) => o.acceptedAt);

  const deliveredByUser = new Map<string, Date[]>();
  const ordersByUser = new Map<string, number>();
  for (const o of real) {
    ordersByUser.set(o.userId, (ordersByUser.get(o.userId) ?? 0) + 1);
    if (o.status === "delivered") {
      const l = deliveredByUser.get(o.userId) ?? [];
      l.push(o.createdAt);
      deliveredByUser.set(o.userId, l);
    }
  }

  const gaveUp: GaveUpOrder[] = gaveUpRows
    .map((o) => ({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
      waitMinutes: minutesBetween(o.createdAt, o.cancelledAt!),
      hour: damascusHour(o.createdAt),
      orderType: o.orderType,
      summary: (o.orderType === "errand" ? o.placeName || o.orderText : o.restaurantName || o.orderText).slice(0, 80),
      userId: o.userId,
      userName: (o.userName ?? "").trim() || "—",
      userPhone: o.userPhone ?? "",
      cancelBy: (o.cancelNote === "admin_cancelled" ? "admin" : "customer") as GaveUpOrder["cancelBy"],
      cameBack: (deliveredByUser.get(o.userId) ?? []).some((d) => d.getTime() > o.createdAt.getTime()),
      lostReason: lostReason(o),
      availableCouriers: o.dispatch?.maxEligible ?? null,
      notifiedDevices: o.dispatch?.maxAccepted ?? 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const giveUpWaits = gaveUp.filter((g) => g.cancelBy === "customer").map((g) => g.waitMinutes);
  const acceptWaits = acceptedRows.map((o) => minutesBetween(o.createdAt, o.acceptedAt!));

  const buckets = WAIT_BUCKETS.map((b) => ({ label: b.label, gaveUp: 0, accepted: 0 }));
  for (const w of giveUpWaits) buckets[bucketIndex(w)]!.gaveUp++;
  for (const w of acceptWaits) buckets[bucketIndex(w)]!.accepted++;

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    gaveUp: 0,
    gaveUpRate: 0,
    medianAcceptMinutes: null as number | null,
  }));
  const acceptByHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const o of real) {
    const h = damascusHour(o.createdAt);
    byHour[h]!.orders++;
    if (o.acceptedAt) acceptByHour[h]!.push(minutesBetween(o.createdAt, o.acceptedAt));
  }
  for (const g of gaveUp) if (g.cancelBy === "customer") byHour[g.hour]!.gaveUp++;
  for (const h of byHour) {
    h.gaveUpRate = h.orders ? Math.round((h.gaveUp / h.orders) * 1000) / 10 : 0;
    h.medianAcceptMinutes = percentile(acceptByHour[h.hour]!, 50);
  }

  const customersMap = new Map<string, GaveUpOrder[]>();
  for (const g of gaveUp) {
    if (g.cancelBy !== "customer") continue;
    const l = customersMap.get(g.userId) ?? [];
    l.push(g);
    customersMap.set(g.userId, l);
  }
  const customers: SearchWaitCustomer[] = [...customersMap.entries()]
    .map(([userId, list]) => {
      const waits = list.map((g) => g.waitMinutes);
      const latest = list[0]!; // gaveUp is sorted newest first
      return {
        userId,
        name: latest.userName,
        phone: latest.userPhone,
        gaveUp: list.length,
        avgWaitMinutes: Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10,
        maxWaitMinutes: Math.max(...waits),
        totalOrders: ordersByUser.get(userId) ?? list.length,
        delivered: deliveredByUser.get(userId)?.length ?? 0,
        lastGaveUpAt: latest.createdAt,
        status: (latest.cameBack ? "returned" : "lost") as SearchWaitCustomer["status"],
      };
    })
    .sort((a, b) => (a.status === b.status ? b.gaveUp - a.gaveUp : a.status === "lost" ? -1 : 1));

  const customerGaveUp = gaveUp.filter((g) => g.cancelBy === "customer");
  return {
    summary: {
      totalOrders: real.length,
      acceptedOrders: acceptedRows.length,
      gaveUpOrders: customerGaveUp.length,
      adminCancelledWhileSearching: gaveUp.length - customerGaveUp.length,
      gaveUpRate: real.length ? Math.round((customerGaveUp.length / real.length) * 1000) / 10 : 0,
      medianGiveUpMinutes: percentile(giveUpWaits, 50),
      medianAcceptMinutes: percentile(acceptWaits, 50),
      p90AcceptMinutes: percentile(acceptWaits, 90),
      lostCustomers: customers.filter((c) => c.status === "lost").length,
      returnedCustomers: customers.filter((c) => c.status === "returned").length,
      neverServedCustomers: customers.filter((c) => c.delivered === 0).length,
      byLostReason: {
        no_couriers: customerGaveUp.filter((g) => g.lostReason === "no_couriers").length,
        push_failed: customerGaveUp.filter((g) => g.lostReason === "push_failed").length,
        not_accepted: customerGaveUp.filter((g) => g.lostReason === "not_accepted").length,
        unknown: customerGaveUp.filter((g) => g.lostReason === "unknown").length,
      } satisfies Record<LostReason, number>,
    },
    buckets,
    byHour,
    customers,
    orders: gaveUp,
  };
}
