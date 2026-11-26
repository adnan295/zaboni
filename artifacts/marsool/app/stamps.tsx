import React from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { cardShadow } from "@/constants/colors";
import { useMyStamps, type MyStampCard, type StampCoupon } from "@/hooks/useStamps";
import { syrianDay } from "@/utils/syrianDate";

const left = (n: number) => (n === 1 ? "طلب واحد" : n === 2 ? "طلبين" : `${n} طلبات`);

/** «أختامي»: ready coupons first, then every stamp card, closest to the reward first. */
export default function StampsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backIcon = useBackIcon();
  const { data, isLoading, isError, refetch, isRefetching } = useMyStamps();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const openRestaurant = (id: string) => router.push(`/restaurant/${id}` as any);

  const coupons = data?.coupons ?? [];
  const cards = data?.cards ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.muted }]} onPress={() => router.back()} accessibilityLabel="رجوع">
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>أختامي</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>ما قدرنا نجيب أختامك</Text>
          <TouchableOpacity onPress={() => refetch()}><Text style={{ color: colors.primaryDark, fontWeight: "700" }}>جرّب مرة تانية</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {coupons.length === 0 && cards.length === 0 && (
            <View style={[styles.empty, { backgroundColor: colors.card }, cardShadow]}>
              <MaterialIcons name="card-giftcard" size={40} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لسا ما عندك أختام</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                اطلب من المطاعم يلي عليها شارة «اطلب واربح»، وكل طلب بيعطيك ختم. لما يكمل الكرت بتاخد جايزة من المطعم.
              </Text>
            </View>
          )}

          {coupons.map((c: StampCoupon) => (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: "#FECACA" }, cardShadow]}>
              <View style={styles.row}>
                <Letter name={c.restaurantName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{c.restaurantName}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>الجايزة: {c.label}</Text>
                </View>
                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => openRestaurant(c.restaurantId)} accessibilityRole="button">
                  <Text style={[styles.btnText, { color: "#fff" }]}>استعمل الكوبون</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.note, { color: colors.success }]}>كوبونك جاهز · صالح لحد {syrianDay(c.expiresAt)}</Text>
            </View>
          ))}

          {cards.map((c: MyStampCard) => (
            <View key={c.restaurantId} style={[styles.card, { backgroundColor: colors.card, borderColor: "#F1F1F3" }, cardShadow]}>
              <View style={styles.row}>
                <Letter name={c.restaurantName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{c.restaurantName}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>الجايزة: {c.reward.replace(/ ببلاش$/, "")}</Text>
                </View>
                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.secondary }]} onPress={() => openRestaurant(c.restaurantId)} accessibilityRole="button">
                  <Text style={[styles.btnText, { color: colors.primaryDark }]}>اطلب</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.stamps}>
                {Array.from({ length: c.goal }).map((_, i) => {
                  const done = i < c.stamps;
                  const last = i === c.goal - 1;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.stamp,
                        done
                          ? { backgroundColor: colors.primary, borderColor: colors.primary, borderStyle: "solid" }
                          : { backgroundColor: colors.card, borderColor: last ? colors.primary : "#D1D5DB", borderStyle: "dashed" },
                      ]}
                    >
                      {done ? (
                        <Text style={styles.stampLetter}>{c.restaurantName.trim().charAt(0)}</Text>
                      ) : last ? (
                        <MaterialIcons name="card-giftcard" size={16} color={colors.primary} />
                      ) : (
                        <Text style={[styles.stampNum, { color: "#9CA3AF" }]}>{i + 1}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                باقيلك {left(c.goal - c.stamps)}{c.minOrder > 0 ? ` · ختم على كل طلب فوق ${c.minOrder.toLocaleString("en-US")} ل.س` : ""}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Letter({ name }: { name: string }) {
  const colors = useColors();
  return (
    <View style={[styles.letter, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.letterText, { color: colors.primary }]}>{name.trim().charAt(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  empty: { borderRadius: 16, padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  card: { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  letter: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  letterText: { fontSize: 17, fontWeight: "800" },
  name: { fontSize: 16, fontWeight: "700", textAlign: "left" },
  meta: { fontSize: 13, textAlign: "left" },
  btn: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 14, fontWeight: "800" },
  stamps: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stamp: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stampLetter: { color: "#fff", fontSize: 15, fontWeight: "800" },
  stampNum: { fontSize: 14, fontWeight: "700" },
  note: { fontSize: 13, fontWeight: "700", textAlign: "left" },
});
