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
  return o.courierId ? "customer_after_courier" : "customer";
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
