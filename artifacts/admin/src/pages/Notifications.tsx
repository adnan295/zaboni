import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type UserLookupResult } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type LookupUser = UserLookupResult[number];

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    body: "",
    target: "all" as "all" | "customers" | "couriers",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<LookupUser | null>(null);
  const [noTokenAlert, setNoTokenAlert] = useState(false);
  const [targetedForm, setTargetedForm] = useState({ title: "", body: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.length >= 3) {
      debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    } else {
      setDebouncedQuery("");
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const { data: lookupResults = [], isFetching: lookupLoading } = useQuery({
    queryKey: ["admin", "notifications", "lookup", debouncedQuery],
    queryFn: () => api.lookupUser(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["admin", "notifications", "history"],
    queryFn: api.getNotificationHistory,
    refetchInterval: 15_000,
  });

  const broadcastMutation = useMutation({
    mutationFn: api.broadcastNotification,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "history"] });
      toast({
        title: "تم الإرسال!",
        description: `${data.sentCount} أُرسل، ${data.failedCount} فشل`,
      });
      setBroadcastForm((f) => ({ ...f, title: "", body: "" }));
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const targetedMutation = useMutation({
    mutationFn: api.sendNotificationToUser,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "history"] });
      if (data.success) {
        toast({
          title: "تم الإرسال!",
          description: `وصل الإشعار إلى ${data.userName || "المستخدم"} بنجاح`,
        });
        setTargetedForm({ title: "", body: "" });
      } else {
        toast({ title: "فشل الإرسال", description: "المستخدم موجود لكن تعذر إرسال الإشعار", variant: "destructive" });
      }
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.body.trim()) return;
    broadcastMutation.mutate(broadcastForm);
  };

  const handleTargeted = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !targetedForm.title.trim() || !targetedForm.body.trim()) return;
    if (!selectedUser.hasPushToken) {
      setNoTokenAlert(true);
      return;
    }
    setNoTokenAlert(false);
    targetedMutation.mutate({ phone: selectedUser.phone, title: targetedForm.title, body: targetedForm.body });
  };

  const handleSelectUser = (user: LookupUser) => {
    setSelectedUser(user);
    setSearchQuery("");
    setDebouncedQuery("");
    // Show warning immediately if user has no push token
    setNoTokenAlert(!user.hasPushToken);
  };

  const handleClearUser = () => {
    setSelectedUser(null);
    setNoTokenAlert(false);
    setTargetedForm({ title: "", body: "" });
  };

  const showDropdown = debouncedQuery.length >= 3 && !selectedUser;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإشعارات</h1>
        <p className="text-sm text-muted-foreground mt-1">إرسال إشعارات فورية لمستخدم محدد أو لجميع المستخدمين</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">إشعار لمستخدم محدد</CardTitle>
            <p className="text-xs text-muted-foreground">ابحث باسم المستخدم أو رقم هاتفه، ثم أرسل إشعاراً مباشراً</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTargeted} className="space-y-3">
              {!selectedUser ? (
                <div className="space-y-1 relative">
                  <Label className="text-xs">البحث عن مستخدم</Label>
                  <Input
                    dir="rtl"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو رقم الهاتف..."
                    autoComplete="off"
                  />
                  {showDropdown && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-card border rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {lookupLoading ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">جاري البحث...</p>
                      ) : lookupResults.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</p>
                      ) : (
                        lookupResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleSelectUser(u)}
                            className="w-full text-right px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-2 text-sm"
                          >
                            <div>
                              <p className="font-medium">{u.name || "—"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{u.phone}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.role === "courier" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                                {u.role === "courier" ? "مندوب" : "عميل"}
                              </span>
                              {!u.hasPushToken && (
                                <span className="text-xs text-amber-600">بدون إشعارات</span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {searchQuery.length > 0 && searchQuery.length < 3 && (
                    <p className="text-xs text-muted-foreground">ادخل 3 أحرف على الأقل للبحث</p>
                  )}
                </div>
              ) : (
                <div className={`rounded-md border p-3 flex items-start justify-between gap-3 ${!selectedUser.hasPushToken ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-muted/30"}`}>
                  <div>
                    <p className="font-semibold text-sm">{selectedUser.name || "—"}</p>
                    <p className="text-xs font-mono text-muted-foreground">{selectedUser.phone}</p>
                    <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full ${selectedUser.role === "courier" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {selectedUser.role === "courier" ? "مندوب" : "عميل"}
                    </span>
                  </div>
                  <button type="button" onClick={handleClearUser} className="text-muted-foreground hover:text-foreground text-xs mt-0.5">✕</button>
                </div>
              )}

              {noTokenAlert && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-400 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                  ⚠️ هذا المستخدم لا يمتلك رمز push نشط — لا يمكن إرسال إشعار إليه. يجب أن يفتح التطبيق أولاً.
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input
                  value={targetedForm.title}
                  onChange={(e) => setTargetedForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="رسالة من المرسول"
                  maxLength={200}
                  disabled={!selectedUser || noTokenAlert}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص الإشعار</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  rows={3}
                  value={targetedForm.body}
                  onChange={(e) => setTargetedForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="نص الرسالة..."
                  maxLength={1000}
                  disabled={!selectedUser || noTokenAlert}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={
                  targetedMutation.isPending ||
                  !selectedUser ||
                  noTokenAlert ||
                  !targetedForm.title.trim() ||
                  !targetedForm.body.trim()
                }
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {targetedMutation.isPending ? "جاري الإرسال..." : "إرسال لهذا المستخدم 🎯"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">إشعار جماعي</CardTitle>
            <p className="text-xs text-muted-foreground">إرسال إشعارات لجميع المستخدمين أو مجموعة محددة</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBroadcast} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="عرض خاص اليوم!"
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص الإشعار</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={broadcastForm.body}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="نص الإشعار..."
                  maxLength={1000}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الجمهور المستهدف</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={broadcastForm.target}
                  onChange={(e) =>
                    setBroadcastForm((f) => ({ ...f, target: e.target.value as "all" | "customers" | "couriers" }))
                  }
                >
                  <option value="all">الجميع</option>
                  <option value="customers">العملاء فقط</option>
                  <option value="couriers">المندوبون فقط</option>
                </select>
              </div>
              <Button
                type="submit"
                disabled={broadcastMutation.isPending || !broadcastForm.title.trim() || !broadcastForm.body.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {broadcastMutation.isPending ? "جاري الإرسال..." : "إرسال للجميع 🔔"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">سجل الإشعارات</h2>
        <Card>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <span className="text-3xl">🔔</span>
                <span className="text-sm">لم يُرسَل أي إشعار بعد</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">العنوان</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">النص</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">النوع</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">أُرسل</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">فشل</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((n) => (
                      <tr key={n.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[160px] truncate">{n.title}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{n.body}</td>
                        <td className="px-4 py-3">
                          <TargetBadge target={n.target} />
                        </td>
                        <td className="px-4 py-3 text-green-600 font-semibold">{n.sentCount}</td>
                        <td className="px-4 py-3 text-red-500 font-semibold">{n.failedCount}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(n.createdAt).toLocaleString("ar-SY", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TargetBadge({ target }: { target: string }) {
  if (target === "targeted") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
        🎯 فردي
      </span>
    );
  }
  if (target === "couriers") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        المندوبون
      </span>
    );
  }
  if (target === "customers") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        العملاء
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
      الجميع
    </span>
  );
}
