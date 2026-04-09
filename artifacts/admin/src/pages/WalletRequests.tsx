import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { WalletDepositRequest } from "@/lib/api";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin", "wallet", "deposit-requests"],
    queryFn: api.getWalletDepositRequests,
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveDepositRequest(id),
    onSuccess: (data) => {
      toast({
        title: "تمت الموافقة",
        description: `الرصيد الجديد: ${(data.newBalance as number).toLocaleString("ar-SY")} ل.س`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "wallet"] });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectDepositRequest(id),
    onSuccess: () => {
      toast({ title: "تم الرفض" });
      queryClient.invalidateQueries({ queryKey: ["admin", "wallet"] });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleApprove = (req: WalletDepositRequest) => {
    if (!confirm(`موافقة على إيداع ${req.amount.toLocaleString("ar-SY")} ل.س للسائق ${req.courierName}؟`)) return;
    approveMutation.mutate(req.id);
  };

  const handleReject = (req: WalletDepositRequest) => {
    if (!confirm(`رفض طلب إيداع ${req.amount.toLocaleString("ar-SY")} ل.س للسائق ${req.courierName}؟`)) return;
    rejectMutation.mutate(req.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">طلبات الإيداع</h1>
          <p className="text-muted-foreground text-sm mt-1">
            طلبات إيداع رصيد المحفظة المعلقة من السائقين
          </p>
        </div>
        <Badge variant={requests.length > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
          {requests.length} معلق
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">✅</div>
          <p className="font-medium">لا توجد طلبات إيداع معلقة</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">السائق</TableHead>
                <TableHead className="text-right">رقم الهاتف</TableHead>
                <TableHead className="text-right">رصيده الحالي</TableHead>
                <TableHead className="text-right">المبلغ المطلوب</TableHead>
                <TableHead className="text-right">الإيصال / الملاحظة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الإجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-semibold">{req.courierName || "—"}</TableCell>
                  <TableCell dir="ltr" className="text-right">{req.courierPhone}</TableCell>
                  <TableCell>
                    <span className="font-mono font-bold text-blue-600">
                      {req.walletBalance.toLocaleString("ar-SY")} ل.س
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold text-green-600 text-base">
                      +{req.amount.toLocaleString("ar-SY")} ل.س
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[160px] truncate">
                    {req.note || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(req.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(req)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        موافقة ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(req)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        رفض ✗
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
