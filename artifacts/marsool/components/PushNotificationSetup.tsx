import { useCallback } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { useAuth } from "@/context/AuthContext";
import { useCourier } from "@/context/CourierContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotifications } from "@/context/NotificationsContext";
import { useAppNotificationSocket } from "@/hooks/useAppNotificationSocket";

function CourierPushSetup() {
  const { refreshAvailableOrders, updateLocation } = useCourier();
  const { addNotification } = useNotifications();
  const { token } = useAuth();

  const onNewOrder = useCallback(async () => {
    if (Platform.OS !== "web") {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await updateLocation(loc.coords.latitude, loc.coords.longitude);
        }
      } catch {
      }
    }
    await refreshAvailableOrders();
  }, [refreshAvailableOrders, updateLocation]);

  usePushNotifications(onNewOrder, addNotification);
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
