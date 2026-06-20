import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";

interface LoyaltyTransaction {
  id: string;
  type: "earn" | "redeem";
  points: number;
  orderId: string | null;
  description: string;
  createdAt: string;
}

interface LoyaltyData {
  balance: number;
  redeemDiscount: number;
  earnRate: number;
  pointValue: number;
  transactions: LoyaltyTransaction[];
}

export default function LoyaltyHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch("/api/users/me/loyalty")
      .then((res) => setData(res as LoyaltyData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("loyalty.historyTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="stars" size={32} color="#fff" />
            <Text style={styles.balanceNumber}>{data?.balance ?? 0}</Text>
            <Text style={styles.balanceLabel}>{t("loyalty.points")}</Text>
            {(data?.redeemDiscount ?? 0) > 0 && (
              <Text style={styles.balanceEquiv}>
                {t("loyalty.redeemValue", { amount: (data?.redeemDiscount ?? 0).toLocaleString() })}
              </Text>
            )}
            <Text style={styles.earnInfo}>
              {t("loyalty.earnInfo", { rate: data?.earnRate ?? 10 })}
            </Text>
          </View>

          {!data?.transactions?.length ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="star-border" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("loyalty.noHistory")}</Text>
            </View>
          ) : (
            data.transactions.map((tx) => (
              <View key={tx.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.txIcon, { backgroundColor: tx.type === "earn" ? "#dcfce7" : "#fef3c7" }]}>
                  <MaterialIcons
                    name={tx.type === "earn" ? "add-circle" : "remove-circle"}
                    size={20}
                    color={tx.type === "earn" ? "#16a34a" : "#d97706"}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txDesc, { color: colors.foreground }]}>{tx.description}</Text>
                  <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                    {new Date(tx.createdAt).toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" })}
                  </Text>
                </View>
                <Text style={[
                  styles.txPoints,
                  { color: tx.type === "earn" ? "#16a34a" : "#d97706" }
                ]}>
                  {tx.type === "earn" ? "+" : "-"}{tx.points} {t("loyalty.points")}
                </Text>
              </View>
            ))
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  balanceNumber: { fontSize: 48, fontWeight: "900", color: "#fff", lineHeight: 52 },
  balanceLabel: { fontSize: 16, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  balanceEquiv: { fontSize: 14, color: "rgba(255,255,255,0.9)", marginTop: 4, fontWeight: "700" },
  earnInfo: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: "600" },
  txDate: { fontSize: 12, marginTop: 2 },
  txPoints: { fontSize: 14, fontWeight: "800" },
});
