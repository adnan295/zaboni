import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User, type UserDetail } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SortKey = "createdAt" | "orderCount" | "loyaltyPoints";
type SortDir = "asc" | "desc";
type SubscriptionFilter = "all" | "subscribed" | "not_subscribed";
type StatusFilter = "all" | "active" | "blocked";
type DetailTab = "orders" | "points" | "badges";

const STATUS_LABELS: Record<string, string> = {
  searching: "بحث عن مندوب",
  accepted: "مقبول",
  picked_up: "تم الاستلام",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغى",
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "delivered": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    case "searching": return "bg-yellow-100 text-yellow-700";
    case "on_way": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function txTypeBadge(type: string, points: number) {
  if (type === "earn") return "bg-green-100 text-green-700";
  if (type === "redeem") return "bg-red-100 text-red-700";
  if (type === "admin_adjust") return points >= 0 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-600";
}

function txTypeLabel(type: string, points: number) {
  if (type === "earn") return "كسب";
  if (type === "redeem") return "صرف";
  if (type === "admin_adjust") return points >= 0 ? "تعويض إداري" : "خصم إداري";
  return type;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-muted-foreground/40 mr-1">↕</span>;
  return <span className="mr-1">{dir === "desc" ? "↓" : "↑"}</span>;
}

export default function Users() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("orders");
  const [adjustDelta, setAdjustDelta] = useState<string>("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [blockConfirm, setBlockConfirm] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: api.getUsers,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<UserDetail>({
    queryKey: ["admin", "user-detail", selectedUser?.id],
    queryFn: () => api.getUserDetail(selectedUser!.id),
    enabled: !!selectedUser,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ delta, note }: { delta: number; note: string }) =>
      api.adjustUserPoints(selectedUser!.id, delta, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user-detail", selectedUser?.id] });
      setAdjustDelta("");
      setAdjustNote("");
      setAdjustError("");
    },
    onError: (e: Error) => setAdjustError(e.message),
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) => api.blockUser(selectedUser!.id, block),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setSelectedUser((u) => u ? { ...u, isBlocked: data.isBlocked } : u);
      setBlockConfirm(false);
    },
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = users
    .filter((u) => {
      if (u.role !== "customer") return false;
      const matchSearch =
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search);
      const matchSub =
        subscriptionFilter === "all" ||
        (subscriptionFilter === "subscribed" && u.isSubscribed) ||
        (subscriptionFilter === "not_subscribed" && !u.isSubscribed);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !u.isBlocked) ||
        (statusFilter === "blocked" && u.isBlocked);
      return matchSearch && matchSub && matchStatus;
    })
    .sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "createdAt") {
        va = a.createdAt;
        vb = b.createdAt;
      } else {
        va = a[sortKey] as number;
        vb = b[sortKey] as number;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalCustomers = users.filter((u) => u.role === "customer").length;
  const totalCouriers = users.filter((u) => u.role === "courier").length;
  const totalSubscribed = users.filter((u) => u.role === "customer" && u.isSubscribed).length;
  const totalBlocked = users.filter((u) => u.role === "customer" && u.isBlocked).length;

  function openUser(user: User) {
    setSelectedUser(user);
    setDetailTab("orders");
    setAdjustDelta("");
    setAdjustNote("");
    setAdjustError("");
    setBlockConfirm(false);
  }

  function handleAdjustSubmit() {
    const delta = parseInt(adjustDelta, 10);
    if (!adjustDelta || isNaN(delta) || delta === 0) {
      setAdjustError("أدخل عدد النقاط (موجب للإضافة، سالب للخصم)");
      return;
    }
    if (!adjustNote.trim()) {
      setAdjustError("أدخل ملاحظة للتعديل");
      return;
    }
    setAdjustError("");
    adjustMutation.mutate({ delta, note: adjustNote.trim() });
  }

  const thClass = "text-right px-4 py-3 font-medium select-none";
  const sortableTh = (key: SortKey, label: string) => (
    <th
      className={`${thClass} cursor-pointer hover:bg-muted/70 transition-colors`}
      onClick={() => handleSort(key)}
    >
      {label}
      <SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">إدارة العملاء</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-blue-600">{totalCustomers}</p>
          <p className="text-xs text-blue-600/70 font-medium">العملاء</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-orange-600">{totalCouriers}</p>
          <p className="text-xs text-orange-600/70 font-medium">المندوبون</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-emerald-600">{totalSubscribed}</p>
          <p className="text-xs text-emerald-600/70 font-medium">مشتركون</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-red-600">{totalBlocked}</p>
          <p className="text-xs text-red-600/70 font-medium">موقوفون</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <Input
          type="search"
          placeholder="ابحث بالاسم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={subscriptionFilter}
          onValueChange={(v) => setSubscriptionFilter(v as SubscriptionFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الاشتراك" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الاشتراكات</SelectItem>
            <SelectItem value="subscribed">مشترك ✅</SelectItem>
            <SelectItem value="not_subscribed">غير مشترك</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="blocked">موقوف 🚫</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} عميل</span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">لا يوجد عملاء.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className={thClass}>العميل</th>
                <th className={thClass}>الهاتف</th>
                {sortableTh("orderCount", "الطلبات")}
                {sortableTh("loyaltyPoints", "النقاط")}
                <th className={thClass}>الاشتراك</th>
                {sortableTh("createdAt", "الانضمام")}
                <th className={thClass}>الحالة</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl.startsWith("/") ? `/api${user.avatarUrl}` : user.avatarUrl}
                          alt={user.name}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.name ? user.name.charAt(0).toUpperCase() : "?"}
                        </div>
                      )}
                      <span className="font-medium">
                        {user.name || <span className="text-muted-foreground italic">بدون اسم</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{user.phone}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{user.orderCount}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    <span className="text-amber-600 font-medium">{user.loyaltyPoints} ⭐</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.isSubscribed ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">مشترك ✅</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ar-SY")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.isBlocked ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">موقوف 🚫</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">نشط</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => openUser(user)}>
                      عرض مفصل
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-right">
                  {selectedUser.avatarUrl ? (
                    <img
                      src={selectedUser.avatarUrl.startsWith("/") ? `/api${selectedUser.avatarUrl}` : selectedUser.avatarUrl}
                      alt={selectedUser.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : "?"}
                    </div>
                  )}
                  <div>
                    <div>{selectedUser.name || "بدون اسم"}</div>
                    <div className="text-sm font-normal text-muted-foreground font-mono">{selectedUser.phone}</div>
                  </div>
                  {selectedUser.isBlocked && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700 mr-auto">موقوف 🚫</span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="flex gap-3 flex-wrap text-sm mt-1">
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-center">
                  <div className="font-bold text-lg">{selectedUser.orderCount}</div>
                  <div className="text-muted-foreground text-xs">طلب</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-center">
                  <div className="font-bold text-lg text-amber-600">{detail?.currentPoints ?? selectedUser.loyaltyPoints} ⭐</div>
                  <div className="text-muted-foreground text-xs">نقطة ولاء</div>
                </div>
                {selectedUser.isSubscribed && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-center">
                    <div className="font-bold text-lg text-emerald-600">✅</div>
                    <div className="text-muted-foreground text-xs">مشترك</div>
                  </div>
                )}
                {selectedUser.lastOrderAt && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2 text-center">
                    <div className="font-bold text-xs">{new Date(selectedUser.lastOrderAt).toLocaleDateString("ar-SY")}</div>
                    <div className="text-muted-foreground text-xs">آخر طلب</div>
                  </div>
                )}
              </div>

              {detail?.subscription && (
                <div className="border rounded-lg p-3 bg-emerald-50/50">
                  <p className="text-sm font-medium text-emerald-800 mb-1">الاشتراك الشهري</p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>من: {new Date(detail.subscription.startsAt).toLocaleDateString("ar-SY")}</div>
                    <div>حتى: {new Date(detail.subscription.endsAt).toLocaleDateString("ar-SY")}</div>
                    <div>المدفوع: {detail.subscription.pricePaid.toLocaleString()} ل.س</div>
                  </div>
                </div>
              )}

              <div className="flex border-b gap-0 mt-2">
                {(["orders", "points", "badges"] as DetailTab[]).map((tab) => {
                  const labels: Record<DetailTab, string> = { orders: "الطلبات", points: "النقاط", badges: "الشارات" };
                  return (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        detailTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>

              {detailLoading ? (
                <p className="text-center text-muted-foreground py-6">جاري التحميل...</p>
              ) : (
                <>
                  {detailTab === "orders" && (
                    <div className="space-y-2">
                      {(detail?.orders ?? []).length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">لا يوجد طلبات بعد.</p>
                      ) : (
                        (detail?.orders ?? []).map((order) => (
                          <div key={order.id} className="border rounded-lg p-3 text-sm space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{order.restaurantName || "—"}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(order.status)}`}>
                                {STATUS_LABELS[order.status] ?? order.status}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{order.orderText}</div>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{new Date(order.createdAt).toLocaleDateString("ar-SY")}</span>
                              {order.totalPrice != null && (
                                <span>المبلغ: {order.totalPrice.toLocaleString()} ل.س</span>
                              )}
                              {order.deliveryFee != null && order.deliveryFee > 0 && (
                                <span>التوصيل: {order.deliveryFee.toLocaleString()} ل.س</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {detailTab === "points" && (
                    <div className="space-y-3">
                      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                        <p className="text-sm font-medium">تعديل النقاط يدوياً</p>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="النقاط (+/-)"
                            value={adjustDelta}
                            onChange={(e) => setAdjustDelta(e.target.value)}
                            className="w-32"
                          />
                          <Input
                            placeholder="ملاحظة (تعويض، هدية، تصحيح...)"
                            value={adjustNote}
                            onChange={(e) => setAdjustNote(e.target.value)}
                          />
                        </div>
                        {adjustError && <p className="text-xs text-red-500">{adjustError}</p>}
                        <Button
                          size="sm"
                          onClick={handleAdjustSubmit}
                          disabled={adjustMutation.isPending}
                        >
                          {adjustMutation.isPending ? "جاري الحفظ..." : "تطبيق التعديل"}
                        </Button>
                        {adjustMutation.isSuccess && (
                          <p className="text-xs text-green-600">تم تعديل النقاط بنجاح ✓</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        {(detail?.loyaltyTransactions ?? []).length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">لا يوجد معاملات نقاط بعد.</p>
                        ) : (
                          (detail?.loyaltyTransactions ?? []).map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                              <div className="space-y-0.5">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${txTypeBadge(tx.type, tx.points)}`}>
                                  {txTypeLabel(tx.type, tx.points)}
                                </span>
                                <p className="text-xs text-muted-foreground">{tx.description}</p>
                              </div>
                              <div className="text-left">
                                <div className={`font-bold ${tx.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {tx.points >= 0 ? "+" : ""}{tx.points} ⭐
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(tx.createdAt).toLocaleDateString("ar-SY")}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {detailTab === "badges" && (
                    <div className="space-y-2">
                      {(detail?.achievements ?? []).length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">لم يحصل على شارات بعد.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {(detail?.achievements ?? []).map((a) => (
                            <div key={a.achievementKey} className="border rounded-lg p-3 flex items-center gap-3">
                              <span className="text-2xl">{a.icon ?? "🏆"}</span>
                              <div>
                                <div className="font-medium text-sm">{a.titleAr ?? a.achievementKey}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(a.earnedAt).toLocaleDateString("ar-SY")}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="border-t pt-3 mt-2">
                {!blockConfirm ? (
                  <Button
                    variant={selectedUser.isBlocked ? "outline" : "destructive"}
                    size="sm"
                    onClick={() => setBlockConfirm(true)}
                    disabled={blockMutation.isPending}
                  >
                    {selectedUser.isBlocked ? "إعادة تفعيل الحساب" : "تعطيل الحساب 🚫"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 flex-1">
                      {selectedUser.isBlocked
                        ? "هل تريد إعادة تفعيل هذا الحساب؟"
                        : "هل تريد تعطيل هذا الحساب؟ لن يستطيع المستخدم تسجيل الدخول."}
                    </p>
                    <Button
                      size="sm"
                      variant={selectedUser.isBlocked ? "default" : "destructive"}
                      onClick={() => blockMutation.mutate(!selectedUser.isBlocked)}
                      disabled={blockMutation.isPending}
                    >
                      {blockMutation.isPending ? "جاري..." : "تأكيد"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBlockConfirm(false)}>
                      إلغاء
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
