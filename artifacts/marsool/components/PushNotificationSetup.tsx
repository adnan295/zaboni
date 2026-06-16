import { useAuth } from "@/context/AuthContext";
import { useCourier } from "@/context/CourierContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotifications } from "@/context/NotificationsContext";

function CourierPushSetup() {
  const { refreshAvailableOrders } = useCourier();
  const { addNotification } = useNotifications();
  usePushNotifications(refreshAvailableOrders, addNotification);
  return null;
}

function DefaultPushSetup() {
  const { addNotification } = useNotifications();
  usePushNotifications(undefined, addNotification);
  return null;
}

export default function PushNotificationSetup() {
  const { isCourier, isCourierMode } = useAuth();
  if (isCourier && isCourierMode) {
    return <CourierPushSetup />;
  }
  return <DefaultPushSetup />;
}
