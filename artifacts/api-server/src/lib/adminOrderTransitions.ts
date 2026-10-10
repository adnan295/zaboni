// Admin corrections must keep assignment and delivery progress consistent.
const nextStatuses: Record<string, string[]> = {
  searching: ["cancelled"],
  accepted: ["searching", "picked_up", "cancelled"],
  picked_up: ["on_way", "cancelled"],
  on_way: ["delivered", "cancelled"],
};
export function adminOrderTransitionError(order: { status: string; courierId: string }, next: string): string | null {
  if (order.status === next) return null;
  if (!(nextStatuses[order.status] ?? []).includes(next)) return "لا يمكن تغيير الطلب إلى هذه الحالة من مرحلته الحالية";
  if (["picked_up", "on_way", "delivered"].includes(next) && !order.courierId) return "لا يمكن تقدم الطلب دون مندوب معيّن";
  return null;
}
