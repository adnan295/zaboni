import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Text from "@/components/AppText";
import { useBackIcon } from "@/hooks/useTypography";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders } from "@/context/OrderContext";
import { useKitchenDelivery } from "@/hooks/useKitchenDelivery";
import { buildImageUrl } from "@/lib/apiConfig";
import { K } from "@/constants/kitchenTheme";
import {
  fetchKitchenMeal, fetchKitchenFees, placeKitchenOrder, kitchenErrorMessage,
  weekdayOf, shortDate, windowLabel, money,
} from "@/lib/kitchenApi";

function Macro({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null;
  return (
    <View style={styles.macro}>
      <Text weight="extrabold" style={styles.macroValue}>{value}<Text style={styles.macroUnit}> {unit}</Text></Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

export default function KitchenMealScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const ar = useLanguage().language === "ar";
  const backIcon = useBackIcon();
  const qc = useQueryClient();
  const { refreshOrders } = useOrders();
  const { target, label: addressLabel, askForAddress } = useKitchenDelivery();

  const [qty, setQty] = useState(1);
  const [window, setWindow] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const q = useQuery({ queryKey: ["kitchen-meal", id, day], queryFn: () => fetchKitchenMeal(id!, day!), enabled: !!id && !!day });
  const meal = q.data?.meal;
  const windows = q.data?.windows ?? [];
  useEffect(() => {
    if (!window && windows.length > 0) setWindow(windows[0]!);
  }, [windows, window]);

  const fees = useQuery({
    queryKey: ["kitchen-fee", meal?.kitchenId, target?.lat, target?.lon],
    queryFn: () => fetchKitchenFees([meal!.kitchenId], target!.lat, target!.lon),
    enabled: !!meal && !!target,
    retry: false,
  });
  const fee = meal ? fees.data?.fees[meal.kitchenId] : undefined;

  if (q.isLoading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={K.green} /></View>;
  }
  if (!meal || !q.data) {
    return (
      <View style={[styles.container, styles.center, { padding: 32 }]}>
        <Text style={{ color: K.muted, textAlign: "center" }}>{kitchenErrorMessage(q.error, t("kitchen.meal.notFound"))}</Text>
        <TouchableOpacity style={[styles.cta, { marginTop: 18, paddingHorizontal: 28 }]} onPress={() => router.back()}>
          <Text weight="bold" style={styles.ctaText}>{t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const open = q.data.open;
  const soldOut = meal.left <= 0;
  const maxQty = Math.max(1, Math.min(10, meal.left));
  const itemsTotal = meal.price * qty;
  const canOrder = open && !soldOut && !!window && !submitting;
  const dayText = `${weekdayOf(q.data.day, ar)} ${shortDate(q.data.day)}`;
  const image = buildImageUrl(meal.image);

  const submit = async () => {
    if (!target) return askForAddress();
    if (!window) return;
    setSubmitting(true);
    try {
      const { orders } = await placeKitchenOrder({ ...target, day: q.data!.day, window, items: [{ mealId: meal.id, qty }] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([refreshOrders(), qc.invalidateQueries({ queryKey: ["kitchen-menu"] }), qc.invalidateQueries({ queryKey: ["kitchen-meal"] })]);
      const first = orders[0];
      Alert.alert(
        t("kitchen.meal.bookedTitle"),
        t("kitchen.meal.bookedBody", { day: dayText, window: windowLabel(window) }),
        [{ text: t("common.ok"), onPress: () => (first ? router.replace({ pathname: "/order-tracking/[id]", params: { id: first.id } }) : router.back()) }],
      );
    } catch (err) {
      Alert.alert(t("common.error"), kitchenErrorMessage(err, t("common.retry")));
      q.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 150 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {image ? (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: K.greenSoft }]}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={54} color={K.sage} />
            </View>
          )}
          <TouchableOpacity style={[styles.back, { top: insets.top + 10 }]} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={backIcon} size={20} color={K.green} />
          </TouchableOpacity>
        </View>

        <View style={styles.sheet}>
          <Text weight="extrabold" style={styles.name}>{meal.nameAr}</Text>
          <Text style={styles.kitchen}>
            {t("kitchen.meal.by", { name: meal.kitchenName })}{meal.kitchenReviewCount > 0 ? `  ★ ${meal.kitchenRating.toFixed(1)}` : ""}
          </Text>
          {!!meal.descriptionAr && <Text style={styles.desc}>{meal.descriptionAr}</Text>}

          {meal.calories != null && (
            <View style={styles.macros}>
              <Macro label={t("kitchen.calories")} value={meal.calories} unit={t("kitchen.kcal")} />
              <Macro label={t("kitchen.protein")} value={meal.proteinG} unit={t("kitchen.gram")} />
              <Macro label={t("kitchen.carbs")} value={meal.carbsG} unit={t("kitchen.gram")} />
              <Macro label={t("kitchen.fat")} value={meal.fatG} unit={t("kitchen.gram")} />
            </View>
          )}

          {meal.tags.length > 0 && (
            <View style={styles.tags}>
              {meal.tags.map((tag) => (
                <View key={tag} style={styles.tag}><Text weight="medium" style={styles.tagText}>{tag}</Text></View>
              ))}
            </View>
          )}

          <View style={styles.block}>
            <View style={styles.rowBetween}>
              <Text weight="bold" style={styles.blockTitle}>{t("kitchen.meal.deliveryDay")}</Text>
              <Text weight="bold" style={{ color: K.green, fontSize: 14 }}>{dayText}</Text>
            </View>
            <Text weight="bold" style={[styles.blockTitle, { marginTop: 14 }]}>{t("kitchen.meal.window")}</Text>
            <View style={styles.windows}>
              {windows.map((w) => {
                const on = w === window;
                return (
                  <TouchableOpacity key={w} style={[styles.window, on && styles.windowOn]} onPress={() => setWindow(w)}>
                    <Text weight="bold" style={[styles.windowText, on && { color: "#fff" }]}>{windowLabel(w)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.addressRow} onPress={() => router.push("/addresses")}>
              <MaterialIcons name="place" size={16} color={K.greenSoft} />
              <Text style={styles.addressText} numberOfLines={1}>
                {target ? t("kitchen.meal.deliverTo", { label: addressLabel }) : t("kitchen.meal.pickAddress")}
              </Text>
              <Text weight="bold" style={{ color: K.terracotta, fontSize: 12 }}>{t("kitchen.meal.change")}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.block}>
            <View style={styles.rowBetween}>
              <Text weight="bold" style={styles.blockTitle}>{t("kitchen.meal.qty")}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setQty((n) => Math.max(1, n - 1))}>
                  <MaterialIcons name="remove" size={18} color={K.green} />
                </TouchableOpacity>
                <Text weight="extrabold" style={styles.qty}>{qty}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setQty((n) => Math.min(maxQty, n + 1))}>
                  <MaterialIcons name="add" size={18} color={K.green} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.leftNote}>{soldOut ? t("kitchen.soldOut") : t("kitchen.meal.leftNote", { n: meal.left, total: meal.portions })}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.rowBetween}>
          <Text style={styles.sumLabel}>{t("kitchen.meal.items")}</Text>
          <Text weight="bold" style={styles.sumValue}>{money(itemsTotal)}</Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 2 }]}>
          <Text style={styles.sumLabel}>{t("kitchen.meal.delivery")}</Text>
          <Text weight="bold" style={styles.sumValue}>
            {fee != null ? money(fee) : fees.isError ? kitchenErrorMessage(fees.error, "—") : target ? "…" : "—"}
          </Text>
        </View>
        <TouchableOpacity style={[styles.cta, !canOrder && { opacity: 0.5 }]} disabled={!canOrder} onPress={submit}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text weight="extrabold" style={styles.ctaText}>
              {!open ? t("kitchen.meal.closed") : soldOut ? t("kitchen.soldOut")
                : `${t("kitchen.meal.book", { day: weekdayOf(q.data.day, ar) })} · ${money(itemsTotal + (fee ?? 0))}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  center: { alignItems: "center", justifyContent: "center" },
  hero: { height: 280, backgroundColor: K.green },
  back: { position: "absolute", start: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: K.bg, alignItems: "center", justifyContent: "center" },
  sheet: { marginTop: -24, backgroundColor: K.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18 },
  name: { color: K.ink, fontSize: 23, textAlign: "left" },
  kitchen: { color: K.greenSoft, fontSize: 13, marginTop: 4, textAlign: "left" },
  desc: { color: K.muted, fontSize: 14, lineHeight: 22, marginTop: 10, textAlign: "left" },
  macros: { flexDirection: "row", gap: 8, marginTop: 16 },
  macro: { flex: 1, backgroundColor: K.sage, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  macroValue: { color: K.green, fontSize: 17 },
  macroUnit: { fontSize: 10.5, color: K.greenSoft },
  macroLabel: { color: K.greenSoft, fontSize: 11.5, marginTop: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { backgroundColor: K.cream, borderWidth: 1, borderColor: K.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: K.ink, fontSize: 11.5 },
  block: { marginTop: 16, backgroundColor: K.card, borderRadius: 18, borderWidth: 1, borderColor: K.border, padding: 14 },
  blockTitle: { color: K.ink, fontSize: 14, textAlign: "left" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  windows: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  window: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: K.border, backgroundColor: K.bg },
  windowOn: { backgroundColor: K.green, borderColor: K.green },
  windowText: { color: K.ink, fontSize: 13 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: K.border },
  addressText: { flex: 1, color: K.muted, fontSize: 12.5, textAlign: "left" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: K.sage, alignItems: "center", justifyContent: "center" },
  qty: { color: K.ink, fontSize: 17, minWidth: 18, textAlign: "center" },
  leftNote: { color: K.terracottaInk, fontSize: 12, marginTop: 8, textAlign: "left" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: K.card, borderTopWidth: 1, borderTopColor: K.border, paddingHorizontal: 18, paddingTop: 12 },
  sumLabel: { color: K.muted, fontSize: 12.5 },
  sumValue: { color: K.ink, fontSize: 13 },
  cta: { marginTop: 10, backgroundColor: K.green, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  ctaText: { color: "#fff", fontSize: 15.5 },
});
