import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";

interface CourierStats {
  deliveredCount: number;
  avgRating: number | null;
  name: string;
  phone: string;
  role: string;
}

export default function CourierProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState<CourierStats | null>(null);
  const [loading, setLoading] = useState(true);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const data = await customFetch("/api/courier/stats") as CourierStats;
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="person" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.profile.title")}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}>
          <View style={[styles.avatarSection, { backgroundColor: colors.primary }]}>
            <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <MaterialIcons name="delivery-dining" size={48} color="#fff" />
            </View>
            <Text style={styles.userName}>{stats?.name || user?.name || t("profile.defaultUser")}</Text>
            <Text style={styles.userPhone}>{stats?.phone || user?.phone || ""}</Text>
            <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
              <MaterialIcons name="verified" size={14} color="#fff" />
              <Text style={styles.badgeText}>{t("profile.courier.badge")}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="local-shipping" size={28} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats?.deliveredCount ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {t("courier.profile.delivered")}
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="star" size={28} color="#FFB800" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats?.avgRating != null ? stats.avgRating.toFixed(1) : "—"}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {t("courier.profile.avgRating")}
              </Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <MaterialIcons name="phone" size={20} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.profile.phone")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {stats?.phone || user?.phone || "—"}
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <MaterialIcons name="check-circle" size={20} color="#22c55e" />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.profile.accountStatus")}
                </Text>
                <Text style={[styles.infoValue, { color: "#22c55e" }]}>
                  {t("courier.profile.statusActive")}
                </Text>
              </View>
            </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  userName: { fontSize: 20, fontWeight: "800", color: "#fff" },
  userPhone: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    margin: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 12, textAlign: "center" },
  infoCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1, marginHorizontal: 16 },
});
