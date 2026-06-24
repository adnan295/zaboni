import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAdminToken } from "@/lib/api";
import type { CourierSubscriptionRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const VEHICLE_LABELS: Record<string, string> = {
  bicycle: "دراجة هوائية",
  motorcycle: "دراجة نارية",
  car: "سيارة",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "معلق", variant: "default" },
  approved: { label: "موافَق", variant: "secondary" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function openReceiptInTab(objectPath: string) {
  const token = getAdminToken();
  const url = `${API_BASE}/api/storage/objects/${objectPath}`;
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!res.ok) {
    alert("تعذّر فتح الوصل. تحقق من الرابط.");
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubscriptionRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});

  const handleOpenReceipt = useCallback((objectPath: string) => {
    openReceiptInTab(objectPath).catch(() => {
      toast({ title: "خطأ", description: "تعذّر فتح الوصل", variant: "destructive" });
    });
  }, [toast]);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin", "subscription-requests"],
    queryFn: api.getSubscriptionRequests,
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveSubscriptionRequest(id),
    onSuccess: () => {
      toast({ title: "تمت الموافقة", description: "تم تفعيل الاشتراك للسائق" });
      queryClient.invalidateQueries({ queryKey: ["admin", "subscription-requests"] });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, adminNote }: { id: string; adminNote: string }) =>
      api.rejectSubscriptionRequest(id, adminNote),
    onSuccess: () => {
      toast({ title: "تم الرفض" });
      queryClient.invalidateQueries({ queryKey: ["admin", "subscription-requests"] });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">طلبات الاشتراك</h1>
          <p className="text-muted-foreground text-sm mt-1">
            طلبات الاشتراك الشهري من السائقين الجدد
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {pendingCount} معلق
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "all" ? "الكل" : f === "pending" ? "معلقة" : f === "approved" ? "موافَق عليها" : "مرفوضة"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">✅</div>
          <p className="font-medium">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">السائق</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">المركبة</TableHead>
                <TableHead className="text-right">المبلغ المطلوب</TableHead>
                <TableHead className="text-right">المبلغ المدفوع</TableHead>
                <TableHead className="text-right">وصل الدفع</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((req) => {
                const statusInfo = STATUS_LABELS[req.status] ?? { label: req.status, variant: "secondary" as const };
                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-semibold">{req.courierName || "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right">{req.courierPhone || "—"}</TableCell>
                    <TableCell>{VEHICLE_LABELS[req.vehicleType] ?? req.vehicleType}</TableCell>
                    <TableCell>
                      <span className="font-mono font-bold text-blue-600">
                        {req.planAmount.toLocaleString("ar-SY")} ل.س
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-bold text-green-600">
                        {req.paidAmount.toLocaleString("ar-SY")} ل.س
                      </span>
                    </TableCell>
                    <TableCell>
                      {req.receiptUrl ? (
                        <button
                          onClick={() => handleOpenReceipt(req.receiptUrl!)}
                          className="text-primary underline text-sm hover:opacity-80 transition-opacity"
                        >
                          عرض الوصل
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(req.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" ? (
                        <div className="flex flex-col gap-2 min-w-[180px]">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                if (!confirm(`موافقة على اشتراك ${req.courierName}؟`)) return;
                                approveMutation.mutate(req.id);
                              }}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                              موافقة ✓
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const note = rejectNote[req.id] ?? "";
                                rejectMutation.mutate({ id: req.id, adminNote: note });
                              }}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                              رفض ✗
                            </Button>
                          </div>
                          <input
                            className="text-sm border rounded px-2 py-1 bg-background text-foreground"
                            placeholder="سبب الرفض (اختياري)"
                            value={rejectNote[req.id] ?? ""}
                            onChange={(e) => setRejectNote((p) => ({ ...p, [req.id]: e.target.value }))}
                          />
                        </div>
                      ) : req.status === "approved" ? (
                        <span className="text-green-600 text-sm font-medium">✓ تم الاشتراك</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">{req.adminNote || "—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
