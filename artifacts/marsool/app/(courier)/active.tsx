import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useCourier } from "@/context/CourierContext";

const STATUS_COLORS: Record<string, string> = {
  accepted: "#FF6B00",
  on_way: "#2196F3",
  delivered: "#4CAF50",
};

export default function ActiveOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { activeOrders, updateDeliveryStatus, refreshActiveOrders } = useCourier();
  const [updating, setUpdating] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const order = activeOrders[0] ?? null;

  const handleStatusUpdate = async (status: "on_way" | "delivered") => {
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

  const openChat = () => {
    if (!order) return;
    router.push(`/chat/${order.id}`);
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
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + "20" }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[order.status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
              {t(`courier.active.status.${order.status}`)}
            </Text>
          </View>

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

          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>
              {t("courier.active.statusTitle")}
            </Text>

            {order.status === "accepted" && (
              <TouchableOpacity
                style={[styles.statusBtn, { backgroundColor: "#2196F3" }]}
                onPress={() => handleStatusUpdate("on_way")}
                disabled={updating}
                activeOpacity={0.8}
              >
                <Text style={styles.statusBtnText}>
                  {updating ? t("courier.active.updating") : t("courier.active.markOnWay")}
                </Text>
              </TouchableOpacity>
            )}

            {order.status === "on_way" && (
              <TouchableOpacity
                style={[styles.statusBtn, { backgroundColor: "#4CAF50" }]}
                onPress={() => handleStatusUpdate("delivered")}
                disabled={updating}
                activeOpacity={0.8}
              >
                <Text style={styles.statusBtnText}>
                  {updating ? t("courier.active.updating") : t("courier.active.markDelivered")}
                </Text>
              </TouchableOpacity>
            )}

            {order.status === "delivered" && (
              <View style={[styles.deliveredBanner, { backgroundColor: "#4CAF5020" }]}>
                <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                <Text style={[styles.deliveredText, { color: "#4CAF50" }]}>
                  {t("courier.active.status.delivered")} ✅
                </Text>
              </View>
            )}
          </View>
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
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: "700" },
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
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  chatBtnText: { fontSize: 15, fontWeight: "700" },
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
    paddingVertical: 14,
    borderRadius: 12,
  },
  deliveredText: { fontSize: 16, fontWeight: "700" },
});
