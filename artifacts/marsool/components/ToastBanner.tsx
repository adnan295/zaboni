import React, { useEffect, useRef } from "react";
import {
  Animated,
  TouchableOpacity,
  StyleSheet,
  Platform,
  View,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useNotifications, NotifType } from "@/context/NotificationsContext";
import { useColors } from "@/hooks/useColors";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

const ICON_MAP: Record<NotifType, keyof typeof MaterialIcons.glyphMap> = {
  order_status: "delivery-dining",
  promo: "local-offer",
  rating_request: "star",
  system: "notifications",
};

const BG_MAP: Record<NotifType, string> = {
  order_status: "#1e293b",
  promo: "#92400e",
  rating_request: "#78350f",
  system: "#1e293b",
};

const ICON_COLOR_MAP: Record<NotifType, string> = {
  order_status: "#38bdf8",
  promo: "#fbbf24",
  rating_request: "#f59e0b",
  system: "#94a3b8",
};

export default function ToastBanner() {
  const { toast, dismissToast } = useNotifications();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const currentToastId = useRef<string | null>(null);

  const topOffset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (toast && toast.id !== currentToastId.current) {
      currentToastId.current = toast.id;
      if (toast.type === "rating_request") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (toast.type === "order_status") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: topOffset + 12,
          useNativeDriver: USE_NATIVE_DRIVER,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    } else if (!toast) {
      currentToastId.current = null;
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: -120,
          duration: 300,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [toast, topOffset, slideY, opacity]);

  if (!toast) return null;

  const bg = BG_MAP[toast.type] ?? "#1e293b";
  const iconColor = ICON_COLOR_MAP[toast.type] ?? "#94a3b8";
  const icon = ICON_MAP[toast.type] ?? "notifications";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideY }],
          opacity,
          backgroundColor: bg,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={dismissToast}
        activeOpacity={0.85}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconColor + "22" }]}>
          <MaterialIcons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>
        </View>
        <TouchableOpacity onPress={dismissToast} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 0,
    zIndex: 9999,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  body: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 17,
  },
});
