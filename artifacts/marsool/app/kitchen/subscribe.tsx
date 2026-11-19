import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
  fetchKitchenConfig, fetchKitchenMenu, fetchKitchenFees, placeKitchenSubscription, kitchenErrorMessage,
  weekdayOf, shortDate, windowLabel, money, discounted, type KitchenMeal, type SubscriptionGoal,
} from "@/lib/kitchenApi";

const GOALS: { key: SubscriptionGoal; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "cut", icon: "fire" },
  { key: "balanced", icon: "scale-balance" },
  { key: "home", icon: "pot-steam" },
];

/** Meals that fit a goal. Falls back to every main dish so a day is never empty just because of the filter. */
function mealsForGoal(meals: KitchenMeal[], goal: SubscriptionGoal): KitchenMeal[] {
  const mains = meals.filter((m) => m.section !== "dessert" && m.left > 0);
  let fit: KitchenMeal[];
  if (goal === "home") fit = mains.filter((m) => m.section === "home");
  else if (goal === "cut") fit = mains.filter((m) => m.section === "healthy").sort((a, b) => (a.calories ?? 9999) - (b.calories ?? 9999));
  else fit = mains.filter((m) => m.section === "healthy");
  return fit.length > 0 ? fit : mains;
}

export default function KitchenSubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const ar = useLanguage().language === "ar";
  const backIcon = useBackIcon();
  const qc = useQueryClient();
  const { refreshOrders } = useOrders();
  const { target, label: addressLabel, askForAddress } = useKitchenDelivery();

  const [goal, setGoal] = useState<SubscriptionGoal>("balanced");
  const [picked, setPicked] = useState<Record<string, string>>({}); // day → mealId
  const [window, setWindow] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const config = useQuery({ queryKey: ["kitchen-config"], queryFn: fetchKitchenConfig, staleTime: 5 * 60 * 1000 });
  const cfg = config.data;
  const openDays = useMemo(() => (cfg?.days ?? []).filter((d) => d.open).map((d) => d.day), [cfg]);
  const menus = useQueries({
    queries: openDays.map((day) => ({ queryKey: ["kitchen-menu", day], queryFn: () => fetchKitchenMenu(day) })),
  });
  const loading = config.isLoading || menus.some((m) => m.isLoading);

  const pct = cfg?.subscriptionDiscountPct ?? 0;
  const minDays = cfg?.minSubscriptionDays ?? 3;
  const windows = cfg?.windows ?? [];
  useEffect(() => {
    if (!window && windows.length > 0) setWindow(windows[0]!);
  }, [windows, window]);

  const dayMeals = useMemo(
    () => openDays.map((day, i) => ({ day, meals: mealsForGoal(menus[i]?.data?.meals ?? [], goal) })).filter((d) => d.meals.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openDays, goal, menus.map((m) => m.dataUpdatedAt).join(",")],
  );

  // Changing the goal changes which meals are on offer: drop picks that are no longer shown.
  useEffect(() => {
    setPicked((prev) => {
      const next: Record<string, string> = {};
      for (const d of dayMeals) if (prev[d.day] && d.meals.some((m) => m.id === prev[d.day])) next[d.day] = prev[d.day]!;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [dayMeals]);

  const chosen = dayMeals
    .map((d) => ({ day: d.day, meal: d.meals.find((m) => m.id === picked[d.day]) }))
    .filter((x): x is { day: string; meal: KitchenMeal } => !!x.meal);
  const kitchenIds = [...new Set(chosen.map((c) => c.meal.kitchenId))].sort();

  const fees = useQuery({
    queryKey: ["kitchen-fee", kitchenIds.join(","), target?.lat, target?.lon],
    queryFn: () => fetchKitchenFees(kitchenIds, target!.lat, target!.lon),
    enabled: kitchenIds.length > 0 && !!target,
    retry: false,
  });

  const mealsTotal = chosen.reduce((a, c) => a + discounted(c.meal.price, pct), 0);
  const fullTotal = chosen.reduce((a, c) => a + c.meal.price, 0);
  const feeKnown = !!fees.data && chosen.every((c) => fees.data!.fees[c.meal.kitchenId] != null);
  const deliveryTotal = feeKnown ? chosen.reduce((a, c) => a + (fees.data!.fees[c.meal.kitchenId] ?? 0), 0) : null;
  const enough = chosen.length >= minDays;
  const canSubmit = enough && !!window && !submitting;

  const toggle = (day: string, mealId: string) =>
    setPicked((prev) => {
      const next = { ...prev };
      if (next[day] === mealId) delete next[day];
      else next[day] = mealId;
      return next;
    });

  const submit = async () => {
    if (!target) return askForAddress();
    if (!window) return;
    setSubmitting(true);
    try {
      const res = await placeKitchenSubscription({ ...target, goal, window, days: chosen.map((c) => ({ day: c.day, mealId: c.meal.id })) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([
        refreshOrders(),
        qc.invalidateQueries({ queryKey: ["kitchen-subscriptions"] }),
        qc.invalidateQueries({ queryKey: ["kitchen-menu"] }),
      ]);
      Alert.alert(
        t("kitchen.sub.doneTitle"),
        t("kitchen.sub.doneBody", { n: res.orders.length, total: money(res.total) }),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(t("common.error"), kitchenErrorMessage(err, t("common.retry")));
      menus.forEach((m) => m.refetch());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={backIcon} size={20} color="#fff" />
        </TouchableOpacity>
        <Text weight="extrabold" style={styles.headerTitle}>{t("kitchen.sub.title")}</Text>
        <Text style={styles.headerBody}>{t("kitchen.sub.intro", { pct, n: minDays })}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={K.green} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <Text weight="bold" style={styles.step}>{t("kitchen.sub.stepGoal")}</Text>
          <View style={styles.goals}>
            {GOALS.map((g) => {
              const on = g.key === goal;
              return (
                <TouchableOpacity key={g.key} style={[styles.goal, on && styles.goalOn]} onPress={() => setGoal(g.key)}>
                  <MaterialCommunityIcons name={g.icon} size={22} color={on ? "#fff" : K.green} />
                  <Text weight="bold" style={[styles.goalTitle, on && { color: "#fff" }]}>{t(`kitchen.goals.${g.key}.title`)}</Text>
                  <Text style={[styles.goalBody, on && { color: "#CFE0D2" }]} numberOfLines={2}>{t(`kitchen.goals.${g.key}.body`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text weight="bold" style={styles.step}>{t("kitchen.sub.stepDays", { n: minDays })}</Text>
          {dayMeals.length === 0 ? (
            <Text style={styles.none}>{t("kitchen.sub.noDays")}</Text>
          ) : (
            dayMeals.map((d) => (
              <View key={d.day} style={styles.dayBlock}>
                <View style={styles.dayHead}>
                  <Text weight="bold" style={styles.dayName}>{weekdayOf(d.day, ar)} <Text style={styles.dayDate}>{shortDate(d.day)}</Text></Text>
                  {picked[d.day] ? (
                    <MaterialIcons name="check-circle" size={18} color={K.green} />
                  ) : (
                    <Text style={styles.daySkip}>{t("kitchen.sub.skipped")}</Text>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealRow}>
                  {d.meals.map((m) => {
                    const on = picked[d.day] === m.id;
                    const image = buildImageUrl(m.image);
                    return (
                      <TouchableOpacity key={m.id} style={[styles.meal, on && styles.mealOn]} activeOpacity={0.85} onPress={() => toggle(d.day, m.id)}>
                        {image ? (
                          <Image source={{ uri: image }} style={styles.mealImage} contentFit="cover" />
                        ) : (
                          <View style={[styles.mealImage, { backgroundColor: K.sage, alignItems: "center", justifyContent: "center" }]}>
                            <MaterialCommunityIcons name="silverware-fork-knife" size={22} color={K.greenSoft} />
                          </View>
                        )}
                        <View style={{ padding: 8 }}>
                          <Text weight="bold" style={styles.mealName} numberOfLines={1}>{m.nameAr}</Text>
                          <Text style={styles.mealMeta} numberOfLines={1}>
                            {m.calories != null ? `${m.calories} ${t("kitchen.kcal")} · ` : ""}{m.kitchenName}
                          </Text>
                          <View style={styles.priceRow}>
                            <Text weight="extrabold" style={styles.mealPrice}>{money(discounted(m.price, pct))}</Text>
                            {pct > 0 && <Text style={styles.mealOld}>{Math.round(m.price).toLocaleString("en-US")}</Text>}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ))
          )}

          <Text weight="bold" style={styles.step}>{t("kitchen.meal.window")}</Text>
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
          <Text style={styles.note}>{t("kitchen.sub.payNote")}</Text>
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.rowBetween}>
          <Text style={styles.sumLabel}>{t("kitchen.sub.mealsCount", { n: chosen.length })}</Text>
          <Text weight="bold" style={styles.sumValue}>
            {money(mealsTotal)}{pct > 0 && fullTotal > mealsTotal ? `  (${t("kitchen.sub.saved", { amount: money(fullTotal - mealsTotal) })})` : ""}
          </Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 2 }]}>
          <Text style={styles.sumLabel}>{t("kitchen.sub.deliveryAll")}</Text>
          <Text weight="bold" style={styles.sumValue}>
            {deliveryTotal != null ? money(deliveryTotal) : fees.isError ? kitchenErrorMessage(fees.error, "—") : chosen.length > 0 && target ? "…" : "—"}
          </Text>
        </View>
        <TouchableOpacity style={[styles.cta, !canSubmit && { opacity: 0.5 }]} disabled={!canSubmit} onPress={submit}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text weight="extrabold" style={styles.ctaText}>
              {enough
                ? `${t("kitchen.sub.confirm")} · ${money(mealsTotal + (deliveryTotal ?? 0))}`
                : t("kitchen.sub.needMore", { n: minDays - chosen.length })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  header: { backgroundColor: K.green, paddingHorizontal: 18, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  headerTitle: { color: "#fff", fontSize: 24, marginTop: 10, textAlign: "left" },
  headerBody: { color: "#CFE0D2", fontSize: 13, marginTop: 4, lineHeight: 20, textAlign: "left" },
  step: { color: K.ink, fontSize: 15, marginTop: 20, marginHorizontal: 16, textAlign: "left" },
  goals: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 10 },
  goal: { flex: 1, backgroundColor: K.card, borderWidth: 1, borderColor: K.border, borderRadius: 16, padding: 10, alignItems: "center", gap: 3 },
  goalOn: { backgroundColor: K.green, borderColor: K.green },
  goalTitle: { color: K.ink, fontSize: 13.5 },
  goalBody: { color: K.muted, fontSize: 10.5, textAlign: "center", lineHeight: 15 },
  none: { color: K.muted, fontSize: 13, textAlign: "center", marginTop: 16, paddingHorizontal: 28, lineHeight: 20 },
  dayBlock: { marginTop: 12 },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  dayName: { color: K.green, fontSize: 14 },
  dayDate: { color: K.muted, fontSize: 12 },
  daySkip: { color: K.muted, fontSize: 11.5 },
  mealRow: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },
  meal: { width: 150, backgroundColor: K.card, borderRadius: 16, borderWidth: 2, borderColor: K.border, overflow: "hidden" },
  mealOn: { borderColor: K.green, backgroundColor: "#F2F8F1" },
  mealImage: { width: "100%", height: 84 },
  mealName: { color: K.ink, fontSize: 13, textAlign: "left" },
  mealMeta: { color: K.muted, fontSize: 10.5, marginTop: 2, textAlign: "left" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  mealPrice: { color: K.green, fontSize: 13 },
  mealOld: { color: K.muted, fontSize: 10.5, textDecorationLine: "line-through" },
  windows: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, paddingHorizontal: 16 },
  window: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: K.border, backgroundColor: K.card },
  windowOn: { backgroundColor: K.green, borderColor: K.green },
  windowText: { color: K.ink, fontSize: 13 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, marginHorizontal: 16, padding: 12, backgroundColor: K.card, borderRadius: 14, borderWidth: 1, borderColor: K.border },
  addressText: { flex: 1, color: K.muted, fontSize: 12.5, textAlign: "left" },
  note: { color: K.muted, fontSize: 12, lineHeight: 19, marginTop: 14, marginHorizontal: 20, textAlign: "left" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: K.card, borderTopWidth: 1, borderTopColor: K.border, paddingHorizontal: 18, paddingTop: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sumLabel: { color: K.muted, fontSize: 12.5 },
  sumValue: { color: K.ink, fontSize: 13 },
  cta: { marginTop: 10, backgroundColor: K.green, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  ctaText: { color: "#fff", fontSize: 15.5 },
});
