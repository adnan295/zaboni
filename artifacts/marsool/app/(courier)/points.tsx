import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { formatDateTime } from "@/utils/date";

interface PointsTransaction {
  id: string;
  type: "earn" | "redeem" | "admin_adjust";
  points: number;
  orderId: string | null;
  description: string;
  createdAt: string;
}

interface PointsData {
  balance: number;
  pointsPerDay: number;
  redeemableDays: number;
  transactions: PointsTransaction[];
}

function fmt(n: number): string {
  return n.toLocaleString("ar-SY");
}

export default function CourierPointsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const backIcon = useBackIcon();

  const [data, setData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(1);
  const [redeeming, setRedeeming] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = (await customFetch("/api/courier/points")) as PointsData;
      setData(res);
      setDays((d) => Math.min(Math.max(1, d), Math.max(1, res.redeemableDays)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const maxDays = data?.redeemableDays ?? 0;
  const cost = data ? days * data.pointsPerDay : 0;

  const handleRedeem = () => {
    if (!data || maxDays < 1 || redeeming) return;
    Alert.alert(
      "تأكيد الاستبدال",
      `استبدال ${fmt(cost)} نقطة مقابل ${days} يوم اشتراك؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "استبدال",
          style: "default",
          onPress: async () => {
            setRedeeming(true);
            try {
              const res = (await customFetch("/api/courier/points/redeem", {
                method: "POST",
                body: JSON.stringify({ days }),
              })) as { ok: boolean; daysAdded: number };
              if (res.ok) {
                Alert.alert("تم ✅", `أُضيف ${res.daysAdded} يوم لاشتراكك.`);
                setDays(1);
                await loadData(true);
              }
            } catch {
              Alert.alert("تعذّر الاستبدال", "تأكد من رصيد نقاطك وحاول مرة أخرى.");
            } finally {
              setRedeeming(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>نقاط المكافآت</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="wifi-off" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>تعذّر تحميل النقاط</Text>
          <TouchableOpacity onPress={() => loadData()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding + 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Balance hero */}
          <View style={[styles.hero, { backgroundColor: colors.primary }]}>
            <Text style={styles.heroLabel}>رصيد نقاطك</Text>
            <Text style={styles.heroValue}>{fmt(data?.balance ?? 0)}</Text>
            <Text style={styles.heroSub}>
              يعادل {maxDays} {maxDays === 1 ? "يوم" : "يوم"} اشتراك · كل {fmt(data?.pointsPerDay ?? 0)} نقطة = يوم
            </Text>
          </View>

          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
            بتكسب نقاط تعويضية لما الزبون يستخدم خصم بيقلّل أجرتك، وبتقدر تستبدلها بأيام إضافية لاشتراكك.
          </Text>

          {/* Redeem card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>استبدال بأيام اشتراك</Text>
            {maxDays < 1 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>
                ما عندك نقاط كافية للاستبدال بعد.
              </Text>
            ) : (
              <>
                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    onPress={() => setDays((d) => Math.max(1, d - 1))}
                    style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                  >
                    <MaterialIcons name="remove" size={22} color={colors.foreground} />
                  </TouchableOpacity>
                  <View style={styles.stepValue}>
                    <Text style={{ color: colors.foreground, fontSize: 26, fontWeight: "800" }}>{days}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>يوم</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDays((d) => Math.min(maxDays, d + 1))}
                    style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                  >
                    <MaterialIcons name="add" size={22} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
                  التكلفة: {fmt(cost)} نقطة
                </Text>
                <TouchableOpacity
                  onPress={handleRedeem}
                  disabled={redeeming}
                  style={[styles.redeemBtn, { backgroundColor: colors.primary, opacity: redeeming ? 0.6 : 1 }]}
                >
                  {redeeming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="redeem" size={20} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>استبدال</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* History */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>سجل النقاط</Text>
          {(data?.transactions ?? []).length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginTop: 8 }}>
              لا توجد حركات بعد
            </Text>
          ) : (
            (data?.transactions ?? []).map((tx) => {
              const isEarn = tx.type === "earn";
              return (
                <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                  <MaterialIcons
                    name={isEarn ? "add-circle" : tx.type === "redeem" ? "redeem" : "tune"}
                    size={20}
                    color={isEarn ? "#16a34a" : colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14 }}>{tx.description}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                      {formatDateTime(tx.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ color: isEarn ? "#16a34a" : colors.primary, fontWeight: "700", fontSize: 14 }}>
                    {isEarn ? "+" : "-"}
                    {fmt(tx.points)}
                  </Text>
                </View>
              );
            })
          )}
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
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  hero: {
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    marginBottom: 14,
  },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 6 },
  heroValue: { color: "#fff", fontSize: 44, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 8, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginVertical: 16,
  },
  stepBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  stepValue: { alignItems: "center", minWidth: 60 },
  redeemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});
