import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useCourier, CourierOrderStatus, CourierDeliveryStatus } from "@/context/CourierContext";

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  searching: "#9E9E9E",
  accepted: "#FF6B00",
  picked_up: "#9C27B0",
  on_way: "#2196F3",
  delivered: "#4CAF50",
};

type StepDef = {
  status: CourierOrderStatus;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  nextStatus?: CourierDeliveryStatus;
  nextLabel?: string;
};

const STEPS: StepDef[] = [
  {
    status: "accepted",
    label: "courier.active.status.accepted",
    icon: "check-circle",
    nextStatus: "picked_up",
    nextLabel: "courier.active.markPickedUp",
  },
  {
    status: "picked_up",
    label: "courier.active.status.picked_up",
    icon: "inventory",
    nextStatus: "on_way",
    nextLabel: "courier.active.markOnWay",
  },
  {
    status: "on_way",
    label: "courier.active.status.on_way",
    icon: "delivery-dining",
    nextStatus: "delivered",
    nextLabel: "courier.active.markDelivered",
  },
  {
    status: "delivered",
    label: "courier.active.status.delivered",
    icon: "done-all",
  },
];

export default function ActiveOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { activeOrders, updateDeliveryStatus } = useCourier();
  const [updating, setUpdating] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const order = activeOrders[0] ?? null;

  const currentStepIndex = STEPS.findIndex((s) => s.status === order?.status);
  const currentStep = STEPS[currentStepIndex];

  const doStatusUpdate = async (status: CourierDeliveryStatus) => {
    if (!order) return;
    setUpdating(true);
    try {
      await updateDeliveryStatus(order.id, status);
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusUpdate = (status: CourierDeliveryStatus) => {
    if (status === "delivered") {
      Alert.alert(
        t("courier.active.deliverConfirm.title"),
        t("courier.active.deliverConfirm.body"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("courier.active.deliverConfirm.confirm"),
            style: "default",
            onPress: () => doStatusUpdate(status),
          },
        ]
      );
    } else {
      doStatusUpdate(status);
    }
  };

  const openChat = () => {
    if (!order) return;
    router.push(`/chat/${order.id}`);
  };

  const openNavigation = () => {
    if (!order) return;
    const lat = order.destinationLat;
    const lon = order.destinationLon;
    const label = encodeURIComponent(order.address || "وجهة التوصيل");

    if (Platform.OS === "ios") {
      const appleUrl = lat && lon
        ? `maps://maps.apple.com/?daddr=${lat},${lon}&q=${label}&dirflg=d`
        : `maps://maps.apple.com/?daddr=${encodeURIComponent(order.address || "Damascus, Syria")}&dirflg=d`;
      const webFallback = lat && lon
        ? `https://maps.google.com/maps?daddr=${lat},${lon}`
        : `https://maps.google.com/maps?daddr=${encodeURIComponent(order.address || "Damascus, Syria")}`;
      Linking.canOpenURL("maps://").then((ok) => {
        Linking.openURL(ok ? appleUrl : webFallback);
      });
    } else {
      const deepLink = lat && lon
        ? `google.navigation:q=${lat},${lon}&mode=d`
        : null;
      const webFallback = lat && lon
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address || "Damascus, Syria")}&travelmode=driving`;

      if (deepLink) {
        Linking.canOpenURL(deepLink).then((ok) => {
          Linking.openURL(ok ? deepLink : webFallback);
        }).catch(() => Linking.openURL(webFallback));
      } else {
        Linking.openURL(webFallback);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="local-shipping" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.active.title")}</Text>
      </View>

      {!order ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="check-circle-outline" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {t("courier.active.noActive.title")}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {t("courier.active.noActive.body")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stepper */}
          <View style={[styles.stepperCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              const stepColor = isActive
                ? STATUS_COLORS[step.status]
                : isCompleted
                ? "#4CAF50"
                : colors.border;
              return (
                <View key={step.status} style={styles.stepRow}>
                  <View style={styles.stepLeft}>
                    <View
                      style={[
                        styles.stepCircle,
                        {
                          backgroundColor: isActive
                            ? STATUS_COLORS[step.status] + "20"
                            : isCompleted
                            ? "#4CAF5020"
                            : colors.secondary,
                          borderColor: stepColor,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={isCompleted ? "check" : step.icon}
                        size={18}
                        color={stepColor}
                      />
                    </View>
                    {idx < STEPS.length - 1 && (
                      <View
                        style={[
                          styles.stepLine,
                          { backgroundColor: idx < currentStepIndex ? "#4CAF50" : colors.border },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      {
                        color: isActive
                          ? STATUS_COLORS[step.status]
                          : isCompleted
                          ? "#4CAF50"
                          : colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {t(step.label)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Order details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {order.restaurantName ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="restaurant" size={18} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                    {t("courier.available.restaurant")}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>
                    {order.restaurantName}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <MaterialIcons name="notes" size={18} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.active.orderText")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {order.orderText}
                </Text>
              </View>
            </View>

            {order.address ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="location-on" size={18} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                      {t("courier.active.address")}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {order.address}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.chatBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={openChat}
              activeOpacity={0.8}
            >
              <MaterialIcons name="chat" size={20} color={colors.primary} />
              <Text style={[styles.chatBtnText, { color: colors.primary }]}>
                {t("courier.active.openChat")}
              </Text>
            </TouchableOpacity>

            {(order.destinationLat && order.destinationLon) || order.address ? (
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: "#1a73e8" }]}
                onPress={openNavigation}
                activeOpacity={0.8}
              >
                <MaterialIcons name="navigation" size={20} color="#fff" />
                <Text style={styles.navBtnText}>{t("courier.active.navigate")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Action button */}
          {currentStep?.nextStatus && order.status !== "delivered" ? (
            <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>
                {t("courier.active.statusTitle")}
              </Text>
              <TouchableOpacity
                style={[
                  styles.statusBtn,
                  { backgroundColor: STATUS_COLORS[currentStep.nextStatus] },
                ]}
                onPress={() => handleStatusUpdate(currentStep.nextStatus!)}
                disabled={updating}
                activeOpacity={0.8}
              >
                <Text style={styles.statusBtnText}>
                  {updating
                    ? t("courier.active.updating")
                    : t(currentStep.nextLabel ?? "courier.active.updateStatus")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : order.status === "delivered" ? (
            <View style={[styles.deliveredBanner, { backgroundColor: "#4CAF5020" }]}>
              <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
              <Text style={[styles.deliveredText, { color: "#4CAF50" }]}>
                {t("courier.active.status.delivered")} ✅
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center" },
  stepperCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 48 },
  stepLeft: { alignItems: "center", width: 36 },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: { width: 2, flex: 1, minHeight: 12 },
  stepLabel: { flex: 1, fontSize: 15, paddingTop: 8 },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, lineHeight: 22 },
  divider: { height: 1, marginHorizontal: 16 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
  },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  chatBtnText: { fontSize: 15, fontWeight: "700" },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  statusCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  statusTitle: { fontSize: 16, fontWeight: "700" },
  statusBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  statusBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  deliveredBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  deliveredText: { fontSize: 16, fontWeight: "700" },
});
