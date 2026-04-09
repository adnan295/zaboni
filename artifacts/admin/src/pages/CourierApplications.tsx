import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CourierApplicationItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: "دراجة نارية 🏍️",
  car: "سيارة 🚗",
  bicycle: "دراجة هوائية 🚲",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export default function CourierApplications() {
  const qc = useQueryClient();
  const [rejectDialog, setRejectDialog] = useState<{ id: string; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["admin", "courier-applications"],
    queryFn: api.getCourierApplications,
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveCourierApplication(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "courier-applications"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.rejectCourierApplication(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "courier-applications"] });
      setRejectDialog(null);
      setRejectNote("");
    },
  });

  const filtered = applications.filter(
    (a) => filterStatus === "all" || a.status === filterStatus
  );

  const pending = applications.filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">طلبات انضمام السائقين</h1>
          <p className="text-muted-foreground text-sm mt-1">مراجعة طلبات الانضمام للعمل كمندوب توصيل</p>
        </div>
        {pending > 0 && (
          <span className="flex items-center gap-1.5 text-sm font-bold bg-orange-500 text-white rounded-full px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            {pending} طلب جديد
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <div key={s} className="bg-card border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {applications.filter((a) => a.status === s).length}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{STATUS_LABELS[s]}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {s === "all" ? "الكل" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-lg">
          لا توجد طلبات
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-foreground">المتقدم</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">المركبة</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">رقم الهوية</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">تاريخ التقديم</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">الحالة</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((app) => (
                <ApplicationRow
                  key={app.id}
                  app={app}
                  onApprove={() => approveMutation.mutate(app.id)}
                  onReject={() => setRejectDialog({ id: app.id, name: app.fullName })}
                  approving={approveMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب {rejectDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-foreground block mb-2">
              سبب الرفض (اختياري)
            </label>
            <textarea
              className="w-full border border-border rounded-lg p-3 text-sm resize-none bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              rows={3}
              placeholder="اكتب سبب الرفض ليتمكن المتقدم من تصحيح طلبه..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() =>
                rejectDialog && rejectMutation.mutate({ id: rejectDialog.id, note: rejectNote })
              }
            >
              {rejectMutation.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApplicationRow({
  app,
  onApprove,
  onReject,
  approving,
}: {
  app: CourierApplicationItem;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="font-medium text-foreground">{app.fullName}</div>
          <div className="text-xs text-muted-foreground font-mono">{app.phone ?? "—"}</div>
        </td>
        <td className="px-4 py-3">
          <div>{VEHICLE_LABELS[app.vehicleType] ?? app.vehicleType}</div>
          {app.vehiclePlate && (
            <div className="text-xs text-muted-foreground font-mono">{app.vehiclePlate}</div>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-xs">{app.idNumber || "—"}</td>
        <td className="px-4 py-3 text-muted-foreground text-xs">
          {new Date(app.createdAt).toLocaleDateString("ar-SY", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[app.status]}`}
          >
            {STATUS_LABELS[app.status]}
          </span>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {app.status === "pending" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
                disabled={approving}
                onClick={onApprove}
              >
                قبول ✓
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 px-3 text-xs"
                onClick={onReject}
              >
                رفض ✕
              </Button>
            </div>
          )}
          {app.status !== "pending" && (
            <span className="text-xs text-muted-foreground">تمت المراجعة</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {app.notes && (
                <div>
                  <span className="font-medium text-foreground">ملاحظات المتقدم: </span>
                  <span className="text-muted-foreground">{app.notes}</span>
                </div>
              )}
              {app.adminNote && (
                <div>
                  <span className="font-medium text-foreground">ملاحظة الإدارة: </span>
                  <span className="text-muted-foreground">{app.adminNote}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
