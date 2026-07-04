import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type Order } from "@/lib/api";
import { MapPin, Phone, Bike, Clock, ReceiptText, PackageCheck, Ban, Search, CheckCircle2 } from "lucide-react";

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_MAP: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  searching: { label: "يبحث عن سائق", color: "text-amber-600 bg-amber-50 border-amber-200", Icon: Search },
  accepted:  { label: "مقبول — الكابتن في الطريق للمطعم", color: "text-blue-600 bg-blue-50 border-blue-200", Icon: CheckCircle2 },
  on_way:    { label: "في الطريق للعميل", color: "text-purple-600 bg-purple-50 border-purple-200", Icon: Bike },
  delivered: { label: "تم التوصيل", color: "text-green-600 bg-green-50 border-green-200", Icon: PackageCheck },
  cancelled: { label: "ملغى", color: "text-red-600 bg-red-50 border-red-200", Icon: Ban },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function OrderDetailSheet({ order, open, onOpenChange }: Props) {
  if (!order) return null;
  const status = STATUS_MAP[order.status] ?? { label: order.status, color: "text-gray-600 bg-gray-50 border-gray-200", Icon: ReceiptText };
  const StatusIcon = status.Icon;

  const subtotal = order.totalAmount != null && order.deliveryFee != null
    ? order.totalAmount - order.deliveryFee
    : order.totalAmount;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ReceiptText size={18} className="text-muted-foreground" />
            تفاصيل الطلب #{order.id.slice(-6).toUpperCase()}
          </SheetTitle>
        </SheetHeader>

        <div className="py-5 space-y-5">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium ${status.color}`}>
            <StatusIcon size={16} />
            {status.label}
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">محتوى الطلب</p>
            {order.items && order.items.length > 0 ? (
              <div className="border border-border rounded-lg overflow-hidden">
                {order.items.map((item, idx) => (
                  <div key={item.id} className={`px-3 py-2.5 ${idx < order.items.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-foreground">{item.nameAr} × {item.qty}</span>
                      <span className="font-bold text-primary shrink-0">{item.lineTotal.toLocaleString()} ل.س</span>
                    </div>
                    {item.options.map((opt, i) => (
                      <p key={i} className="text-xs text-muted-foreground mt-0.5 mr-3">
                        ↳ {opt.nameAr}{opt.extraPrice > 0 ? ` (+${opt.extraPrice.toLocaleString()} ل.س)` : ""}
                      </p>
                    ))}
                    {item.note && (
                      <p className="text-xs text-muted-foreground mt-0.5 mr-3">📝 {item.note}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/50 rounded-lg p-3 leading-7 text-foreground whitespace-pre-wrap break-words">
                {order.orderText}
              </div>
            )}
            {order.restaurantNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <span className="font-semibold text-amber-700 text-xs">ملاحظة للمطعم: </span>
                <span className="text-amber-900">{order.restaurantNote}</span>
              </div>
            )}
          </div>

          <div className="grid gap-3">
            {order.address && (
              <InfoRow icon={<MapPin size={15} className="text-muted-foreground shrink-0 mt-0.5" />} label="عنوان التوصيل">
                {order.address}
              </InfoRow>
            )}
            {order.courierName && (
              <InfoRow icon={<Bike size={15} className="text-muted-foreground shrink-0" />} label="الكابتن">
                {order.courierName}
                {order.courierPhone && (
                  <a
                    href={`tel:${order.courierPhone}`}
                    className="inline-flex items-center gap-1 mr-2 text-primary text-xs underline-offset-2 hover:underline"
                  >
                    <Phone size={12} />
                    {order.courierPhone}
                  </a>
                )}
              </InfoRow>
            )}
            {order.estimatedMinutes && (
              <InfoRow icon={<Clock size={15} className="text-muted-foreground shrink-0" />} label="الوقت المتوقع">
                {order.estimatedMinutes} دقيقة
              </InfoRow>
            )}
            <InfoRow icon={<Clock size={15} className="text-muted-foreground shrink-0" />} label="وقت الطلب">
              {formatTime(order.createdAt)}
            </InfoRow>
          </div>

          {(order.totalAmount != null || order.deliveryFee != null) && (
            <div className="border border-border rounded-lg overflow-hidden">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide px-4 py-2.5 bg-muted/40 border-b border-border">
                ملخص الفاتورة
              </p>
              <div className="p-4 space-y-2 text-sm">
                {subtotal != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">قيمة الطلب</span>
                    <span>{subtotal.toLocaleString()} ل.س</span>
                  </div>
                )}
                {order.deliveryFee != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">رسوم التوصيل</span>
                    <span>{order.deliveryFee.toLocaleString()} ل.س</span>
                  </div>
                )}
                {order.totalAmount != null && (
                  <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
                    <span>الإجمالي</span>
                    <span className="text-primary">{order.totalAmount.toLocaleString()} ل.س</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="pt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium mb-0.5">{label}</p>
        <p className="text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}
