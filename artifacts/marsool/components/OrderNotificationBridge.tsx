import { useEffect } from "react";
import { useOrders, Order, OrderStatus } from "@/context/OrderContext";
import { useNotifications } from "@/context/NotificationsContext";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "في الانتظار",
  confirmed: "تم تأكيد طلبك",
  preparing: "يتم تحضير طلبك",
  on_way: "طلبك في الطريق إليك",
  delivered: "تم التوصيل بنجاح",
};

const STATUS_BODIES: Record<OrderStatus, string> = {
  pending: "جاري معالجة طلبك...",
  confirmed: "المطعم تلقى طلبك وبدأ التحضير",
  preparing: "الشيف يعمل على طلبك بكل اهتمام",
  on_way: "المندوب في الطريق إليك، استعد لاستقبال طلبك!",
  delivered: "وصل طلبك. بالعافية! لا تنس تقييم تجربتك",
};

export default function OrderNotificationBridge() {
  const { setStatusChangeHandler } = useOrders();
  const { addNotification } = useNotifications();

  useEffect(() => {
    setStatusChangeHandler((order: Order, newStatus: OrderStatus) => {
      addNotification({
        type: newStatus === "delivered" ? "rating_request" : "order_status",
        title: STATUS_LABELS[newStatus],
        body: `${order.restaurantName} · ${STATUS_BODIES[newStatus]}`,
        orderId: order.id,
      });
    });
  }, [setStatusChangeHandler, addNotification]);

  return null;
}
