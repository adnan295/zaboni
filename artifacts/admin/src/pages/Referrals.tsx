import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ReferralRow {
  id: string;
  referrerId: string;
  referrerName: string;
  referrerPhone: string;
  referredUserId: string;
  referredName: string;
  referredPhone: string;
  commissionAmount: number;
  status: "pending" | "paid";
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  paidReferrals: number;
  totalCommissions: number;
  topReferrers: { userId: string; name: string; phone: string; count: number; earned: number }[];
  referrals: ReferralRow[];
}

export default function Referrals() {
  const { data, isLoading } = useQuery<ReferralStats>({
    queryKey: ["admin", "referral-stats"],
    queryFn: () => api.get("/admin/referral-stats"),
    refetchInterval: 30_000,
  });

  const statusColor = (s: string) =>
    s === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700";
  const statusLabel = (s: string) => (s === "paid" ? "مُكتملة" : "معلّقة");

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold">الإحالات ومحافظ العملاء</h1>

      {isLoading ? (
        <div className="text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border rounded-xl p-4">
              <div className="text-2xl font-bold">{data?.totalReferrals ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي الإحالات</div>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="text-2xl font-bold text-green-600">{data?.paidReferrals ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">إحالات مكتملة</div>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="text-2xl font-bold text-primary">
                {(data?.totalCommissions ?? 0).toLocaleString("ar-SY")} نقطة
              </div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي النقاط الممنوحة</div>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="text-2xl font-bold">{data?.topReferrers?.length ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">مُحيلون نشطون</div>
            </div>
          </div>

          {(data?.topReferrers?.length ?? 0) > 0 && (
            <div className="bg-card border rounded-xl p-4">
              <h2 className="font-semibold mb-3">أكثر المحيلين نشاطاً</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 px-2">الاسم</th>
                    <th className="text-right py-2 px-2">الهاتف</th>
                    <th className="text-right py-2 px-2">عدد الإحالات</th>
                    <th className="text-right py-2 px-2">إجمالي النقاط</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topReferrers?.map((r) => (
                    <tr key={r.userId} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-2 px-2 font-medium">{r.name || "—"}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.phone}</td>
                      <td className="py-2 px-2">{r.count}</td>
                      <td className="py-2 px-2 text-green-600 font-semibold">{r.earned.toLocaleString("ar-SY")} نقطة</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-card border rounded-xl p-4">
            <h2 className="font-semibold mb-3">سجل الإحالات</h2>
            {(data?.referrals?.length ?? 0) === 0 ? (
              <div className="text-muted-foreground text-sm py-4 text-center">لا توجد إحالات بعد</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-2">المُحيل</th>
                      <th className="text-right py-2 px-2">المُحال</th>
                      <th className="text-right py-2 px-2">النقاط</th>
                      <th className="text-right py-2 px-2">الحالة</th>
                      <th className="text-right py-2 px-2">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.referrals?.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="py-2 px-2">
                          <div className="font-medium">{r.referrerName || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.referrerPhone}</div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-medium">{r.referredName || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.referredPhone}</div>
                        </td>
                        <td className="py-2 px-2 font-semibold">
                          {r.commissionAmount > 0 ? `${r.commissionAmount.toLocaleString("ar-SY")} نقطة` : "—"}
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(r.status)}`}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground text-xs">
                          {new Date(r.createdAt).toLocaleDateString("ar-SY")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
