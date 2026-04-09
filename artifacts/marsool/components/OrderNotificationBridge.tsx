import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useOrders, Order, OrderStatus } from "@/context/OrderContext";
import { useNotifications } from "@/context/NotificationsContext";

export default function OrderNotificationBridge() {
  const { setStatusChangeHandler } = useOrders();
  const { addNotification } = useNotifications();
  const { t } = useTranslation();

  useEffect(() => {
    setStatusChangeHandler((order: Order, newStatus: OrderStatus) => {
      const labels: Record<OrderStatus, string> = {
        searching: t("orderNotification.searching.title"),
        accepted: t("orderNotification.accepted.title"),
        picked_up: t("orderNotification.picked_up.title"),
        on_way: t("orderNotification.on_way.title"),
        delivered: t("orderNotification.delivered.title"),
        cancelled: t("orderNotification.cancelled.title"),
      };
      const bodies: Record<OrderStatus, string> = {
        searching: t("orderNotification.searching.body"),
        accepted: t("orderNotification.accepted.body"),
        picked_up: t("orderNotification.picked_up.body"),
        on_way: t("orderNotification.on_way.body"),
        delivered: t("orderNotification.delivered.body"),
        cancelled: t("orderNotification.cancelled.body"),
      };
      addNotification({
        type: newStatus === "delivered" ? "rating_request" : "order_status",
        title: labels[newStatus],
        body: `${order.restaurantName} · ${bodies[newStatus]}`,
        orderId: order.id,
      });
    });
  }, [setStatusChangeHandler, addNotification, t]);

  return null;
}
