import { useAuth } from "@/context/AuthContext";
import { useCourier } from "@/context/CourierContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotifications } from "@/context/NotificationsContext";
import { useAppNotificationSocket } from "@/hooks/useAppNotificationSocket";

function CourierPushSetup() {
  const { refreshAvailableOrders } = useCourier();
  const { addNotification } = useNotifications();
  const { token } = useAuth();
  usePushNotifications(refreshAvailableOrders, addNotification);
  useAppNotificationSocket(token, addNotification);
  return null;
}

function DefaultPushSetup() {
  const { addNotification } = useNotifications();
  const { token } = useAuth();
  usePushNotifications(undefined, addNotification);
  useAppNotificationSocket(token, addNotification);
  return null;
}

export default function PushNotificationSetup() {
  const { isCourier, isCourierMode } = useAuth();
  if (isCourier && isCourierMode) {
    return <CourierPushSetup />;
  }
  return <DefaultPushSetup />;
}
