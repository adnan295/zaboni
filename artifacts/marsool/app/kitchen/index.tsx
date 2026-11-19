import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Text from "@/components/AppText";
import { useBackIcon, useForwardIcon } from "@/hooks/useTypography";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders } from "@/context/OrderContext";
import { buildImageUrl } from "@/lib/apiConfig";
import { K } from "@/constants/kitchenTheme";
import {
  fetchKitchenConfig, fetchKitchenMenu, fetchKitchenSubscriptions, cancelKitchenSubscription, kitchenErrorMessage,
  weekdayOf, shortDate, money, timeLeft, type KitchenMeal, type MealSection,
} from "@/lib/kitchenApi";

const SECTIONS: { key: MealSection; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "home", icon: "pot-steam" },
  { key: "healthy", icon: "leaf" },
  { key: "dessert", icon: "cupcake" },
];

function MealCard({ meal, open, onPress }: { meal: KitchenMeal; open: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const soldOut = meal.left <= 0;
  const image = buildImageUrl(meal.image);
  return (
    <TouchableOpacity style={[styles.meal, (soldOut || !open) && { opacity: 0.6 }]} activeOpacity={0.9} onPress={onPress}>
      <View style={styles.mealImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.mealImage} contentFit="cover" />
        ) : (
          <View style={[styles.mealImage, styles.mealImageEmpty]}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={28} color={K.greenSoft} />
          </View>
        )}
        {meal.calories != null && (
          <View style={styles.kcalBadge}>
            <Text weight="bold" style={styles.kcalText}>{meal.calories} {t("kitchen.kcal")}</Text>
          </View>
        )}
      </View>
      <View style={styles.mealBody}>
        <Text weight="bold" style={styles.mealName} numberOfLines={1}>{meal.nameAr}</Text>
        <Text style={styles.mealKitchen} numberOfLines={1}>
          {meal.kitchenName}{meal.kitchenReviewCount > 0 ? `  ★ ${meal.kitchenRating.toFixed(1)}` : ""}
        </Text>
        {meal.proteinG != null && (
          <Text style={styles.mealMacros} numberOfLines={1}>
            {t("kitchen.protein")} {meal.proteinG}{t("kitchen.gram")}
            {meal.carbsG != null ? ` · ${t("kitchen.carbs")} ${meal.carbsG}${t("kitchen.gram")}` : ""}
          </Text>
        )}
        <View style={styles.mealFooter}>
          <Text weight="extrabold" style={styles.mealPrice}>{money(meal.price)}</Text>
          <View style={[styles.leftPill, soldOut ? { backgroundColor: "#F1E4E1" } : meal.left <= 3 ? { backgroundColor: K.terracottaSoft } : null]}>
            <Text weight="bold" style={[styles.leftText, soldOut ? { color: K.danger } : meal.left <= 3 ? { color: K.terracottaInk } : null]}>
              {soldOut ? t("kitchen.soldOut") : t("kitchen.left", { n: meal.left })}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function KitchenHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const ar = language === "ar";
  const backIcon = useBackIcon();
  const forwardIcon = useForwardIcon();
  const qc = useQueryClient();
  const { refreshOrders } = useOrders();

  const [day, setDay] = useState<string | undefined>(undefined);
  const [section, setSection] = useState<MealSection>("home");
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const config = useQuery({ queryKey: ["kitchen-config"], queryFn: fetchKitchenConfig, staleTime: 5 * 60 * 1000 });
  const menu = useQuery({ queryKey: ["kitchen-menu", day ?? "default"], queryFn: () => fetchKitchenMenu(day), enabled: !!config.data?.enabled });
  const subs = useQuery({ queryKey: ["kitchen-subscriptions"], queryFn: fetchKitchenSubscriptions, enabled: !!config.data?.enabled });

  const data = menu.data;
  const activeDay = data?.day;
  const meals = useMemo(() => (data?.meals ?? []).filter((m) => m.section === section), [data, section]);
  // Open the tab that actually has food if the default one is empty for this day.
  useEffect(() => {
    if (!data || data.meals.length === 0) return;
    if (!data.meals.some((m) => m.section === section)) setSection(data.meals[0]!.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeSub = subs.data?.subscriptions.find((s) => s.status === "active" && s.upcoming > 0);
  const closesIn = data?.open ? timeLeft(data.closesAt, now, ar) : "";

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([menu.refetch(), subs.refetch(), config.refetch()]);
    setRefreshing(false);
  };

  const cancelSub = () => {
    if (!activeSub) return;
    Alert.alert(t("kitchen.sub.cancelTitle"), t("kitchen.sub.cancelBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("kitchen.sub.cancelConfirm"),
        style: "destructive",
        onPress: async () => {
          try {
            const r = await cancelKitchenSubscription(activeSub.id);
            await Promise.all([qc.invalidateQueries({ queryKey: ["kitchen-subscriptions"] }), qc.invalidateQueries({ queryKey: ["kitchen-menu"] }), refreshOrders()]);
            if (r.kept > 0) Alert.alert(t("kitchen.sub.cancelledTitle"), t("kitchen.sub.keptNote", { n: r.kept }));
          } catch (err) {
            Alert.alert(t("common.error"), kitchenErrorMessage(err, t("common.retry")));
          }
        },
      },
    ]);
  };

  const title = config.data?.title || t("kitchen.defaultTitle");

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={backIcon} size={16} color="#fff" />
          <Text weight="bold" style={styles.backText}>{t("kitchen.backToZaboni")}</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="leaf" size={24} color={K.sage} />
          <Text weight="extrabold" style={styles.headerTitle}>{title}</Text>
        </View>
        <Text style={styles.headerTagline}>{t("kitchen.tagline")}</Text>
      </View>

      {config.isLoading ? (
        <ActivityIndicator color={K.green} style={{ marginTop: 40 }} />
      ) : !config.data?.enabled ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="sprout-outline" size={44} color={K.greenSoft} />
          <Text weight="bold" style={styles.emptyTitle}>{t("kitchen.soonTitle")}</Text>
          <Text style={styles.emptyBody}>{t("kitchen.soonBody")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={K.green} />}
        >
          {/* Delivery day */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {(data?.days ?? config.data.days ?? []).map((d) => {
              const selected = d.day === activeDay;
              return (
                <TouchableOpacity
                  key={d.day}
                  style={[styles.dayChip, selected && styles.dayChipOn, !d.open && { opacity: 0.45 }]}
                  onPress={() => setDay(d.day)}
                >
                  <Text weight="bold" style={[styles.dayName, selected && { color: "#fff" }]}>{weekdayOf(d.day, ar)}</Text>
                  <Text style={[styles.dayDate, selected && { color: "#CFE0D2" }]}>{shortDate(d.day)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {data && (
            <View style={[styles.cutoff, !data.open && { backgroundColor: "#F1E4E1" }]}>
              <MaterialIcons name={data.open ? "schedule" : "lock-clock"} size={16} color={data.open ? K.terracottaInk : K.danger} />
              <Text weight="medium" style={[styles.cutoffText, !data.open && { color: K.danger }]}>
                {data.open
                  ? t("kitchen.closesIn", { day: weekdayOf(data.day, ar), time: closesIn })
                  : t("kitchen.closedForDay", { day: weekdayOf(data.day, ar) })}
              </Text>
            </View>
          )}

          {/* Weekly subscription */}
          {activeSub ? (
            <View style={styles.subCard}>
              <View style={{ flex: 1 }}>
                <Text weight="extrabold" style={styles.subTitle}>{t("kitchen.sub.activeTitle")}</Text>
                <Text style={styles.subBody}>{t("kitchen.sub.activeBody", { n: activeSub.upcoming, window: activeSub.window })}</Text>
              </View>
              <TouchableOpacity style={styles.subGhostBtn} onPress={cancelSub}>
                <Text weight="bold" style={styles.subGhostText}>{t("kitchen.sub.cancel")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.subCard} activeOpacity={0.9} onPress={() => router.push("/kitchen/subscribe")}>
              <View style={styles.subIcon}>
                <MaterialCommunityIcons name="calendar-heart" size={24} color={K.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text weight="extrabold" style={styles.subTitle}>{t("kitchen.sub.title")}</Text>
                <Text style={styles.subBody}>
                  {t("kitchen.sub.body", { pct: config.data.subscriptionDiscountPct ?? 0, n: config.data.minSubscriptionDays ?? 3 })}
                </Text>
              </View>
              <MaterialIcons name={forwardIcon} size={20} color={K.green} />
            </TouchableOpacity>
          )}

          {/* Sections */}
          <View style={styles.tabs}>
            {SECTIONS.map((s) => {
              const on = s.key === section;
              return (
                <TouchableOpacity key={s.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setSection(s.key)}>
                  <MaterialCommunityIcons name={s.icon} size={17} color={on ? "#fff" : K.green} />
                  <Text weight="bold" style={[styles.tabText, on && { color: "#fff" }]}>{t(`kitchen.sections.${s.key}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {menu.isLoading ? (
            <ActivityIndicator color={K.green} style={{ marginTop: 30 }} />
          ) : menu.isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyBody}>{kitchenErrorMessage(menu.error, t("common.retry"))}</Text>
            </View>
          ) : meals.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="pot-outline" size={40} color={K.greenSoft} />
              <Text weight="bold" style={styles.emptyTitle}>{t("kitchen.emptyTitle")}</Text>
              <Text style={styles.emptyBody}>{t("kitchen.emptyBody")}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {meals.map((m) => (
                <MealCard
                  key={m.id}
                  meal={m}
                  open={!!data?.open}
                  onPress={() => router.push({ pathname: "/kitchen/meal/[id]", params: { id: m.id, day: data!.day } })}
                />
              ))}
            </View>
          )}

          <Text style={styles.footnote}>{t("kitchen.howItWorks", { hour: config.data.cutoffHour ?? 21 })}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: K.bg },
  header: { backgroundColor: K.green, paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  backPill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  backText: { color: "#fff", fontSize: 12.5 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  headerTitle: { color: "#fff", fontSize: 28 },
  headerTagline: { color: "#CFE0D2", fontSize: 13.5, marginTop: 4, textAlign: "left" },

  dayRow: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  dayChip: { minWidth: 68, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, backgroundColor: K.card, borderWidth: 1, borderColor: K.border, alignItems: "center" },
  dayChipOn: { backgroundColor: K.green, borderColor: K.green },
  dayName: { color: K.ink, fontSize: 13.5 },
  dayDate: { color: K.muted, fontSize: 11.5, marginTop: 1 },

  cutoff: { marginHorizontal: 16, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: K.terracottaSoft, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  cutoffText: { color: K.terracottaInk, fontSize: 12.5, flex: 1, textAlign: "left" },

  subCard: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: K.sage, flexDirection: "row", alignItems: "center", gap: 12 },
  subIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: K.bg, alignItems: "center", justifyContent: "center" },
  subTitle: { color: K.green, fontSize: 16, textAlign: "left" },
  subBody: { color: K.greenSoft, fontSize: 12.5, marginTop: 2, textAlign: "left" },
  subGhostBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: K.green },
  subGhostText: { color: K.green, fontSize: 12.5 },

  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 18 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 999, backgroundColor: K.card, borderWidth: 1, borderColor: K.border },
  tabOn: { backgroundColor: K.green, borderColor: K.green },
  tabText: { color: K.green, fontSize: 12.5 },

  list: { paddingHorizontal: 16, marginTop: 14, gap: 12 },
  meal: { flexDirection: "row", backgroundColor: K.card, borderRadius: 18, borderWidth: 1, borderColor: K.border, overflow: "hidden" },
  mealImageWrap: { width: 112, height: 112 },
  mealImage: { width: 112, height: 112 },
  mealImageEmpty: { backgroundColor: K.sage, alignItems: "center", justifyContent: "center" },
  kcalBadge: { position: "absolute", bottom: 6, left: 6, right: 6, backgroundColor: "rgba(31,77,58,0.88)", borderRadius: 999, paddingVertical: 3, alignItems: "center" },
  kcalText: { color: "#fff", fontSize: 11 },
  mealBody: { flex: 1, padding: 12, justifyContent: "space-between" },
  mealName: { color: K.ink, fontSize: 15.5, textAlign: "left" },
  mealKitchen: { color: K.muted, fontSize: 12, marginTop: 2, textAlign: "left" },
  mealMacros: { color: K.greenSoft, fontSize: 11.5, marginTop: 3, textAlign: "left" },
  mealFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  mealPrice: { color: K.green, fontSize: 15 },
  leftPill: { backgroundColor: K.sage, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  leftText: { color: K.green, fontSize: 11 },

  empty: { alignItems: "center", paddingHorizontal: 32, paddingTop: 36, gap: 6 },
  emptyTitle: { color: K.ink, fontSize: 16, textAlign: "center" },
  emptyBody: { color: K.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  footnote: { color: K.muted, fontSize: 12, textAlign: "center", marginTop: 22, paddingHorizontal: 28, lineHeight: 19 },
});
