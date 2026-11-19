import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import Text from "@/components/AppText";
import { useBackIcon } from "@/hooks/useTypography";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders, type Order } from "@/context/OrderContext";
import { K } from "@/constants/kitchenTheme";
import { kitchenErrorMessage, weekdayOf, shortDate, windowLabel, money } from "@/lib/kitchenApi";

/**
 * A pre-ordered meal waiting for its delivery day. Shown in place of live tracking:
 * there is no courier yet, only a booking the customer can still cancel until the cutoff.
 */
export default function ScheduledOrderView({ order }: { order: Order }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const ar = useLanguage().language === "ar";
  const backIcon = useBackIcon();
  const qc = useQueryClient();
  const { refreshOrders } = useOrders();
  const [cancelling, setCancelling] = useState(false);

  const day = order.scheduledDay;
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  const cancel = () => {
    Alert.alert(t("kitchen.booking.cancelTitle"), t("kitchen.booking.cancelBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("kitchen.booking.cancelConfirm"),
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await customFetch(`/api/orders/${order.id}`, { method: "DELETE", body: JSON.stringify({}) });
            await Promise.all([refreshOrders(), qc.invalidateQueries({ queryKey: ["kitchen-menu"] }), qc.invalidateQueries({ queryKey: ["kitchen-subscriptions"] })]);
            leave();
          } catch (err) {
            Alert.alert(t("common.error"), kitchenErrorMessage(err, t("common.retry")));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.back} onPress={leave} hitSlop={8}>
          <MaterialIcons name={backIcon} size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="calendar-check" size={30} color={K.green} />
        </View>
        <Text weight="extrabold" style={styles.title}>{t("kitchen.booking.title")}</Text>
        {!!day && (
          <Text weight="bold" style={styles.when}>
            {weekdayOf(day, ar)} {shortDate(day)}
            {order.scheduledWindow ? `  ·  ${t("kitchen.booking.between", { window: windowLabel(order.scheduledWindow) })}` : ""}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.card}>
          <Text weight="bold" style={styles.kitchen}>{order.restaurantName}</Text>
          <Text style={styles.text}>{order.orderText}</Text>
          {order.totalPrice != null && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("kitchen.meal.items")}</Text>
              <Text weight="bold" style={styles.value}>{money(order.totalPrice)}</Text>
            </View>
          )}
          {order.deliveryFee != null && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("kitchen.meal.delivery")}</Text>
              <Text weight="bold" style={styles.value}>{money(order.deliveryFee)}</Text>
            </View>
          )}
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: K.border, paddingTop: 10, marginTop: 10 }]}>
            <MaterialIcons name="place" size={15} color={K.greenSoft} />
            <Text style={[styles.label, { flex: 1 }]} numberOfLines={2}>{order.address}</Text>
          </View>
        </View>

        <View style={styles.steps}>
          {(["cook", "courier", "pay"] as const).map((k, i) => (
            <View key={k} style={styles.stepRow}>
              <View style={styles.stepDot}><Text weight="bold" style={styles.stepNum}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{t(`kitchen.booking.steps.${k}`)}</Text>
            </View>
          ))}
        </View>

        {!!order.mealSubscriptionId && <Text style={styles.subNote}>{t("kitchen.booking.partOfSub")}</Text>}

        <TouchableOpacity style={styles.cancel} onPress={cancel} disabled={cancelling}>
          {cancelling ? <ActivityIndicator color={K.danger} /> : <Text weight="bold" style={styles.cancelText}>{t("kitchen.booking.cancel")}</Text>}
        </TouchableOpacity>
        <Text style={styles.cancelNote}>{t("kitchen.booking.cancelNote")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  header: { backgroundColor: K.green, paddingHorizontal: 18, paddingBottom: 24, alignItems: "center", borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: K.sage, alignItems: "center", justifyContent: "center", marginTop: 4 },
  title: { color: "#fff", fontSize: 22, marginTop: 12 },
  when: { color: "#CFE0D2", fontSize: 14.5, marginTop: 6 },
  card: { backgroundColor: K.card, borderRadius: 18, borderWidth: 1, borderColor: K.border, padding: 16 },
  kitchen: { color: K.green, fontSize: 15, textAlign: "left" },
  text: { color: K.ink, fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 8, textAlign: "left" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4 },
  label: { color: K.muted, fontSize: 12.5, textAlign: "left" },
  value: { color: K.ink, fontSize: 13 },
  steps: { marginTop: 16, gap: 10, paddingHorizontal: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: K.sage, alignItems: "center", justifyContent: "center" },
  stepNum: { color: K.green, fontSize: 12 },
  stepText: { color: K.ink, fontSize: 13, flex: 1, lineHeight: 20, textAlign: "left" },
  subNote: { color: K.greenSoft, fontSize: 12.5, marginTop: 16, textAlign: "center" },
  cancel: { marginTop: 22, borderWidth: 1, borderColor: K.danger, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: K.danger, fontSize: 14 },
  cancelNote: { color: K.muted, fontSize: 11.5, textAlign: "center", marginTop: 8 },
});
