import { useAuth } from "@/context/AuthContext";
import { useCourier } from "@/context/CourierContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

function CourierPushSetup() {
  const { refreshAvailableOrders } = useCourier();
  usePushNotifications(refreshAvailableOrders);
  return null;
}

function DefaultPushSetup() {
  usePushNotifications();
  return null;
}

export default function PushNotificationSetup() {
  const { isCourier, isCourierMode } = useAuth();
  if (isCourier && isCourierMode) {
    return <CourierPushSetup />;
  }
  return <DefaultPushSetup />;
}
