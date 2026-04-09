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

interface SubscriptionRecord {
  id: string;
  courierId: string;
  date: string;
  amount: number;
  status: "paid" | "waived" | "pending";
  note: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  paid: { label: "مدفوع", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "check-circle" as const },
  waived: { label: "معفى", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "star" as const },
  pending: { label: "غير مدفوع", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", icon: "warning" as const },
};

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
}

export default function SubscriptionHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [records, setRecords] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const data = await customFetch("/api/courier/subscription/history") as SubscriptionRecord[];
        setRecords(data);
      } catch (err: unknown) {
        setError("تعذّر تحميل السجل");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalPaid = records.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const paidCount = records.filter((r) => r.status === "paid").length;
  const pendingCount = records.filter((r) => r.status === "pending").length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سجل الاشتراكات</Text>
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
          contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
          ListHeaderComponent={
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
                <Text style={[styles.summaryValue, { color: "#16a34a" }]}>
                  {totalPaid.toLocaleString("ar-SY")} ل.س
                </Text>
                <Text style={[styles.summaryLabel, { color: "#166534" }]}>إجمالي المدفوع</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
                <Text style={[styles.summaryValue, { color: "#16a34a" }]}>{paidCount}</Text>
                <Text style={[styles.summaryLabel, { color: "#166534" }]}>أيام مدفوعة</Text>
              </View>
              {pendingCount > 0 && (
                <View style={[styles.summaryCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
                  <Text style={[styles.summaryValue, { color: "#ea580c" }]}>{pendingCount}</Text>
                  <Text style={[styles.summaryLabel, { color: "#9a3412" }]}>أيام غير مدفوعة</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="receipt-long" size={56} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا يوجد سجل اشتراكات بعد</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: cfg.bg,
                    borderColor: cfg.border,
                  },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: cfg.color + "20" }]}>
                  <MaterialIcons name={cfg.icon} size={22} color={cfg.color} />
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.dateText, { color: colors.foreground }]}>{fmt(item.date)}</Text>
                    <View style={[styles.badge, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
                      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.amountText, { color: cfg.color }]}>
                    {item.amount.toLocaleString("ar-SY")} ل.س
                  </Text>
                  {item.note ? (
                    <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{item.note}</Text>
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
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    margin: 16,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: { fontSize: 18, fontWeight: "800" },
  summaryLabel: { fontSize: 11, fontWeight: "600" },
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
  dateText: { fontSize: 14, fontWeight: "600" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  amountText: { fontSize: 16, fontWeight: "800" },
  noteText: { fontSize: 12, marginTop: 2 },
});
