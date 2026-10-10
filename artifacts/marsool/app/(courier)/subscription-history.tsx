import React, { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import Text from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useCourierColors, CourierHeader } from "@/components/CourierUI";
import { customFetch } from "@workspace/api-client-react";
import { formatDate } from "@/utils/date";

type Subscription = {
  id: string; planName: string; startsAt: string; endsAt: string;
  amount: number; status: "paid" | "waived" | "pending"; isActive: boolean;
  gifted: boolean; note: string | null;
};
type Request = {
  id: string; planName: string; paidAmount: number; createdAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled"; adminNote: string | null;
};
type Row = { id: string; title: string; detail?: string; amount?: number; status?: string; note?: string | null; heading?: boolean; error?: boolean };
const requestLabels = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض", cancelled: "ملغى" };
const paymentLabels = { paid: "مدفوع", waived: "معفى", pending: "غير مدفوع" };

export default function CourierSubscriptionsScreen() {
  const colors = useCourierColors();
  const router = useRouter();
  const [active, setActive] = useState<boolean | null>(null);
  const insets = useSafeAreaInsets();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [requestsError, setRequestsError] = useState(false);
  const [reload, setReload] = useState(0);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    setLoading(true);
    const refresh = () => Promise.allSettled([
      customFetch("/api/courier/subscription/history") as Promise<Subscription[]>,
      customFetch("/api/courier/subscription/request/history") as Promise<Request[]>,
      customFetch("/api/courier/subscription/status") as Promise<{ isActive: boolean }>,
    ]).then(([history, requestHistory, status]) => {
      if (!mounted) return;
      const historyOK = history.status === "fulfilled" && Array.isArray(history.value);
      const requestsOK = requestHistory.status === "fulfilled" && Array.isArray(requestHistory.value);
      setActive(status.status === "fulfilled" && typeof status.value?.isActive === "boolean" ? status.value.isActive : null);
      setHistoryError(!historyOK);
      setRequestsError(!requestsOK);
      setSubscriptions(historyOK ? history.value : []);
      setRequests(requestsOK ? requestHistory.value : []);
      setLoading(false);
    });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 20_000);
    return () => { mounted = false; clearInterval(timer); };
  }, [reload]));

  const sortedRequests = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const currentRequests = sortedRequests.filter(r => r.status === "pending");
  // When no request is pending, show the latest decision so rejection reasons remain easy to find.
  const highlighted = currentRequests.length ? currentRequests : sortedRequests.slice(0, 1);
  const previous = sortedRequests.filter(r => !highlighted.some(h => h.id === r.id));
  const requestRow = (r: Request): Row => ({
    id: `request-${r.id}`, title: r.planName, detail: `تاريخ الطلب: ${formatDate(r.createdAt)}`,
    amount: r.paidAmount, status: requestLabels[r.status],
    note: r.adminNote ? `${r.status === "rejected" ? "سبب الرفض" : "ملاحظة الإدارة"}: ${r.adminNote}` : r.status === "pending" ? "بانتظار مراجعة الدفع من الإدارة" : null,
  });
  const rows: Row[] = [
    { id: "request-heading", title: currentRequests.length ? "طلب الاشتراك الحالي" : "آخر طلب اشتراك", heading: true },
    ...(requestsError ? [{ id: "request-error", title: "تعذّر تحميل حالة طلب الاشتراك", error: true }] : highlighted.length ? highlighted.map(requestRow) : [{ id: "no-request", title: "ليس لديك طلب اشتراك بعد" }]),
    { id: "history-heading", title: "اشتراكاتي الحالية والسابقة", heading: true },
    ...(historyError ? [{ id: "history-error", title: "تعذّر تحميل الاشتراكات", error: true }] : subscriptions.length ? [...subscriptions].sort((a,b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map((s): Row => ({
      id: `subscription-${s.id}`, title: `${s.planName}${s.gifted ? " — هدية" : ""}`,
      detail: `من ${formatDate(s.startsAt)} إلى ${formatDate(s.endsAt)}`,
      amount: s.amount, status: `${s.isActive && Date.parse(s.endsAt) > Date.now() ? "فعّال" : "منتهٍ"} • ${paymentLabels[s.status]}`,
      note: s.note,
    })) : [{ id: "no-subscription", title: "لا توجد اشتراكات مسجّلة بعد" }]),
    ...(previous.length ? [{ id: "previous-heading", title: "طلبات الاشتراك السابقة", heading: true }, ...previous.map(requestRow)] : []),
  ];

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <CourierHeader title="اشتراكاتي" back />
    {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View> : (
      <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={<View style={[styles.card, { backgroundColor: "#FCECEF", borderColor: "#F3CCD1" }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{active === true ? "اشتراكك فعّال" : active === false ? "لا يوجد اشتراك فعّال حالياً" : "تعذّر التحقق من حالة الاشتراك"}</Text>
          {active === false && currentRequests.length === 0 ? <TouchableOpacity accessibilityRole="button" style={[styles.retry, { backgroundColor: colors.primary }]} onPress={() => router.push("/courier-subscribe")}><Text style={{ color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" }}>اختيار باقة وتجديد الاشتراك</Text></TouchableOpacity> : null}
          {currentRequests.length > 0 ? <>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>طلبك قيد المراجعة، ويمكنك متابعة حالته أدناه.</Text>
            {active === false ? <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => router.push("/courier-subscribe")}><Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700", textAlign: "center" }}>إدارة طلب الاشتراك</Text></TouchableOpacity> : null}
          </> : null}
          {active === null ? <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => setReload(n => n + 1)}><Text style={{ color: colors.primary, textAlign: "center" }}>إعادة المحاولة</Text></TouchableOpacity> : null}
        </View>}
        renderItem={({ item }) => item.heading ? (
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{item.title}</Text>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {item.status ? <Text style={[styles.status, { color: colors.primary }]}>{item.status}</Text> : null}
            <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
            {item.detail ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text> : null}
            {item.amount != null ? <Text style={[styles.amount, { color: colors.foreground }]}>{item.amount.toLocaleString("ar-SY")} ل.س</Text> : null}
            {item.note ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.note}</Text> : null}
            {item.error ? <TouchableOpacity accessibilityRole="button" onPress={() => setReload(n => n + 1)} style={styles.retry}><Text style={{ color: colors.primary, fontWeight: "700", textAlign: "center" }}>إعادة المحاولة</Text></TouchableOpacity> : null}
          </View>
        )} />
    )}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 17, fontWeight: "800", marginTop: 12, marginBottom: 12, textAlign: "right" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, marginBottom: 12 },
  status: { fontSize: 13, fontWeight: "700", textAlign: "right" },
  title: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  detail: { fontSize: 13, textAlign: "right", lineHeight: 21 },
  amount: { fontSize: 18, fontWeight: "800", textAlign: "right" },
  retry: { minHeight: 44, justifyContent: "center", padding: 10, backgroundColor: "#FCECEF", borderRadius: 10 },
});
