import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";

interface SubscriptionRequestRecord {
  id: string;
  courierId: string;
  planId: string;
  planName: string;
  planPeriod: "weekly" | "monthly" | "yearly";
  planPrice: number;
  paidAmount: number;
  receiptUrl: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  adminNote: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  pending: { label: "قيد المراجعة", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", icon: "hourglass-empty" as const },
  approved: { label: "مقبول", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "check-circle" as const },
  rejected: { label: "مرفوض", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "cancel" as const },
  cancelled: { label: "ملغى", color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0", icon: "block" as const },
};

const PERIOD_LABEL: Record<string, string> = {
  weekly: "أسبوعي",
  monthly: "شهري",
  yearly: "سنوي",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SubscriptionRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [records, setRecords] = useState<SubscriptionRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const data = await customFetch("/api/courier/subscription/request/history") as SubscriptionRequestRecord[];
        setRecords(data);
      } catch {
        setError("تعذّر تحميل السجل");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سجل طلبات الاشتراك</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: bottomPadding + 20, paddingTop: 12 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="receipt-long" size={56} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا يوجد طلبات اشتراك بعد</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <View style={[styles.row, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <View style={[styles.iconWrap, { backgroundColor: cfg.color + "20" }]}>
                  <MaterialIcons name={cfg.icon} size={22} color={cfg.color} />
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.planText, { color: colors.foreground }]}>
                      {item.planName} ({PERIOD_LABEL[item.planPeriod] ?? item.planPeriod})
                    </Text>
                    <View style={[styles.badge, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
                      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.dateRange, { color: colors.mutedForeground }]}>
                    {fmtDate(item.createdAt)}
                  </Text>
                  <Text style={[styles.amountText, { color: cfg.color }]}>
                    {item.paidAmount.toLocaleString("ar-SY")} ل.س
                  </Text>
                  {item.status === "rejected" && item.adminNote ? (
                    <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                      السبب: {item.adminNote}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
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
    gap: 14,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  errorText: { fontSize: 15, textAlign: "center" },
  emptyText: { fontSize: 15, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planText: { fontSize: 14, fontWeight: "600" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  dateRange: { fontSize: 12, marginTop: 2 },
  amountText: { fontSize: 16, fontWeight: "800" },
  noteText: { fontSize: 12, marginTop: 2 },
});
