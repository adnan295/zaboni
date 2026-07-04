import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

type TransactionType = "deposit_request" | "deposit_approved" | "subscription_deduction";
type TransactionStatus = "pending" | "approved" | "rejected";

interface WalletTransaction {
  id: string;
  courierId: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  note: string | null;
  createdAt: string;
}

interface WalletData {
  balance: number;
  transactions: WalletTransaction[];
}

interface SubStatus {
  isActive: boolean;
  daysLeft?: number;
  vehicleType: string;
  monthlyPrice: number;
  subscription?: {
    endsAt: string;
    startsAt: string;
    gifted: boolean;
  } | null;
}

const VEHICLE_LABEL: Record<string, string> = {
  bicycle: "دراجة هوائية",
  motorcycle: "دراجة نارية",
  car: "سيارة",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
}

function TxRow({ tx }: { tx: WalletTransaction }) {
  const colors = useColors();
  const isPending = tx.status === "pending";
  const isRejected = tx.status === "rejected";
  const isDeduction = tx.type === "subscription_deduction";
  const isApproved = tx.status === "approved";

  let iconName: keyof typeof MaterialIcons.glyphMap = "account-balance-wallet";
  let iconColor = colors.mutedForeground;
  let amountColor = colors.foreground;
  let amountPrefix = "";

  if (isPending) {
    iconName = "hourglass-empty";
    iconColor = "#9ca3af";
    amountColor = "#9ca3af";
    amountPrefix = "+";
  } else if (isRejected) {
    iconName = "cancel";
    iconColor = "#ef4444";
    amountColor = "#9ca3af";
    amountPrefix = "+";
  } else if (isDeduction) {
    iconName = "remove-circle";
    iconColor = "#ef4444";
    amountColor = "#ef4444";
    amountPrefix = "-";
  } else if (isApproved) {
    iconName = "add-circle";
    iconColor = "#22c55e";
    amountColor = "#22c55e";
    amountPrefix = "+";
  }

  const typeLabel =
    tx.type === "deposit_request"
      ? "طلب إيداع"
      : tx.type === "deposit_approved"
      ? "إيداع مؤكد"
      : "اشتراك شهري";

  const statusLabel =
    tx.status === "pending"
      ? "قيد المراجعة"
      : tx.status === "approved"
      ? "مكتمل"
      : "مرفوض";

  return (
    <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.txIcon, { backgroundColor: isPending ? "#f3f4f6" : isDeduction ? "#fef2f2" : isRejected ? "#fef2f2" : "#f0fdf4" }]}>
        <MaterialIcons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.txInfo}>
        <Text style={[styles.txType, { color: colors.foreground }]}>{typeLabel}</Text>
        {tx.note ? <Text style={[styles.txNote, { color: colors.mutedForeground }]}>{tx.note}</Text> : null}
        <View style={styles.txMeta}>
          <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{formatDate(tx.createdAt)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isPending ? "#fef9c3" : isRejected ? "#fef2f2" : "#f0fdf4" }]}>
            <Text style={[styles.statusText, { color: isPending ? "#ca8a04" : isRejected ? "#ef4444" : "#22c55e" }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>
      <Text style={[styles.txAmount, { color: isRejected ? "#9ca3af" : amountColor }]}>
        {amountPrefix}{Math.abs(tx.amount).toLocaleString("ar-SY")}
        {"\n"}
        <Text style={[styles.txCurrency, { color: isRejected ? "#9ca3af" : amountColor }]}>ل.س</Text>
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [renewingSubscription, setRenewingSubscription] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchWallet = useCallback(async () => {
    try {
      const [walletRes, subRes, qrRes] = await Promise.allSettled([
        customFetch("/api/courier/wallet") as Promise<WalletData>,
        customFetch("/api/courier/subscription/status") as Promise<SubStatus>,
        customFetch("/api/courier/payment-qr") as Promise<{ url: string | null }>,
      ]);
      if (walletRes.status === "fulfilled") setWalletData(walletRes.value);
      if (subRes.status === "fulfilled") setSubStatus(subRes.value);
      if (qrRes.status === "fulfilled") setPaymentQrUrl(qrRes.value.url);
    } catch {
      setWalletData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRenewSubscription = async () => {
    if (!subStatus) return;
    const price = subStatus.monthlyPrice;
    const balance = walletData?.balance ?? 0;
    if (price > balance) {
      Alert.alert(
        "رصيد غير كافٍ",
        `سعر الاشتراك الشهري ${price.toLocaleString("ar-SY")} ل.س ورصيدك ${balance.toLocaleString("ar-SY")} ل.س`
      );
      return;
    }
    setRenewingSubscription(true);
    try {
      await customFetch("/api/courier/subscription/renew", { method: "POST" });
      await fetchWallet();
      Alert.alert("تم التجديد", "تم تجديد الاشتراك الشهري بنجاح");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      Alert.alert("خطأ", msg);
    } finally {
      setRenewingSubscription(false);
    }
  };

  React.useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWallet();
  };

  const handleSubmitDeposit = async () => {
    const amt = parseInt(depositAmount.trim(), 10);
    if (!depositAmount.trim() || isNaN(amt) || amt <= 0) {
      Alert.alert("خطأ", "الرجاء إدخال مبلغ صحيح");
      return;
    }
    setSubmitting(true);
    try {
      await customFetch("/api/courier/wallet/deposit-request", {
        method: "POST",
        body: JSON.stringify({ amount: amt, note: depositNote.trim() || undefined }),
      });
      setModalVisible(false);
      setDepositAmount("");
      setDepositNote("");
      await fetchWallet();
      Alert.alert("تم الإرسال", "تم إرسال طلب الإيداع بنجاح. سيتم مراجعته من قبل الإدارة.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "حدث خطأ";
      Alert.alert("خطأ", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const balance = walletData?.balance ?? 0;
  const transactions = walletData?.transactions ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>محفظتي</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}
        >
          <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="account-balance-wallet" size={36} color="rgba(255,255,255,0.8)" />
            <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
            <Text style={styles.balanceAmount}>{balance.toLocaleString("ar-SY")}</Text>
            <Text style={styles.balanceCurrency}>ل.س سورية</Text>

            <TouchableOpacity
              style={styles.depositBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color={colors.primary} />
              <Text style={[styles.depositBtnText, { color: colors.primary }]}>طلب إيداع رصيد</Text>
            </TouchableOpacity>
          </View>

          {subStatus && (
            <View
              style={[
                styles.subCard,
                {
                  backgroundColor: subStatus.isActive ? "#f0fdf4" : "#fff7ed",
                  borderColor: subStatus.isActive
                    ? (subStatus.daysLeft ?? 99) <= 5 ? "#fca5a5" : "#bbf7d0"
                    : "#fed7aa",
                },
              ]}
            >
              <View style={styles.subCardRow}>
                <MaterialIcons
                  name={subStatus.isActive ? "check-circle" : "warning"}
                  size={22}
                  color={subStatus.isActive ? (subStatus.daysLeft ?? 99) <= 5 ? "#dc2626" : "#16a34a" : "#ea580c"}
                />
                <View style={styles.subCardInfo}>
                  <Text style={[styles.subCardTitle, { color: subStatus.isActive ? "#166534" : "#9a3412" }]}>
                    {subStatus.isActive
                      ? `اشتراك نشط — ${VEHICLE_LABEL[subStatus.vehicleType] ?? subStatus.vehicleType}`
                      : `لا يوجد اشتراك نشط — ${VEHICLE_LABEL[subStatus.vehicleType] ?? subStatus.vehicleType}`}
                  </Text>
                  {subStatus.isActive && subStatus.subscription ? (
                    <Text style={[styles.subCardDetail, { color: "#166534" }]}>
                      ينتهي في {formatDate(subStatus.subscription.endsAt)} · متبقٍ {subStatus.daysLeft ?? 0} يوم
                    </Text>
                  ) : (
                    <Text style={[styles.subCardDetail, { color: "#9a3412" }]}>
                      سعر التجديد: {subStatus.monthlyPrice.toLocaleString("ar-SY")} ل.س / شهر
                    </Text>
                  )}
                </View>
              </View>
              {subStatus.monthlyPrice > 0 && (!subStatus.isActive || (subStatus.daysLeft ?? 99) <= 7) && (
                <TouchableOpacity
                  style={[
                    styles.renewBtn,
                    {
                      backgroundColor: subStatus.isActive ? "#16a34a" : "#ea580c",
                      opacity: renewingSubscription ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleRenewSubscription}
                  disabled={renewingSubscription}
                  activeOpacity={0.8}
                >
                  {renewingSubscription ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.renewBtnText}>
                      {subStatus.isActive ? "تجديد الاشتراك" : "اشتراك الآن"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={[styles.txSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.txHeader}>
              <MaterialIcons name="receipt-long" size={18} color={colors.mutedForeground} />
              <Text style={[styles.txHeaderText, { color: colors.mutedForeground }]}>سجل المعاملات</Text>
            </View>

            {transactions.length === 0 ? (
              <View style={styles.emptyTx}>
                <MaterialIcons name="inbox" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxText, { color: colors.mutedForeground }]}>لا توجد معاملات بعد</Text>
              </View>
            ) : (
              transactions.map((tx) => <TxRow key={tx.id} tx={tx} />)
            )}
          </View>

          {paymentQrUrl ? (
            <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.qrHeader}>
                <MaterialIcons name="qr-code" size={20} color={colors.primary} />
                <Text style={[styles.qrTitle, { color: colors.foreground }]}>ادفع عبر QR</Text>
              </View>
              <Text style={[styles.qrDesc, { color: colors.mutedForeground }]}>
                امسح الـ QR بتطبيق الدفع (سيريتل كاش / MTN) لإرسال مبلغ الاشتراك
              </Text>
              <View style={styles.qrImageWrap}>
                <Image
                  source={{ uri: paymentQrUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          ) : null}

          <View style={[styles.infoCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <MaterialIcons name="info-outline" size={18} color="#ea580c" />
            <Text style={[styles.infoText, { color: "#9a3412" }]}>
              لإيداع رصيد في محفظتك، ادفع المبلغ نقداً في مكتب الإدارة ثم أرسل طلب إيداع من هنا مع رقم الإيصال.
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>طلب إيداع رصيد</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              بعد دفع المبلغ في مكتب الإدارة، أدخل المبلغ ورقم الإيصال وسيتم الموافقة على الطلب من قبل الإدارة.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>المبلغ (ل.س) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: 50000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={depositAmount}
              onChangeText={setDepositAmount}
              textAlign="left"
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>رقم الإيصال (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="رقم إيصال الدفع"
              placeholderTextColor={colors.mutedForeground}
              value={depositNote}
              onChangeText={setDepositNote}
              textAlign="left"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmitDeposit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="send" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>إرسال الطلب</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  balanceCard: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 6,
  },
  balanceLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 8 },
  balanceAmount: { fontSize: 48, fontWeight: "900", color: "#fff" },
  balanceCurrency: { fontSize: 16, color: "rgba(255,255,255,0.7)" },
  depositBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 16,
  },
  depositBtnText: { fontSize: 15, fontWeight: "700" },
  txSection: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  txHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  txHeaderText: { fontSize: 13, fontWeight: "600" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: { flex: 1, gap: 3 },
  txType: { fontSize: 14, fontWeight: "600" },
  txNote: { fontSize: 12 },
  txMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  txDate: { fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "600" },
  txAmount: { fontSize: 15, fontWeight: "800", textAlign: "center" },
  txCurrency: { fontSize: 11, fontWeight: "600" },
  emptyTx: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTxText: { fontSize: 14 },
  subCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  subCardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  subCardInfo: { flex: 1, gap: 4 },
  subCardTitle: { fontSize: 14, fontWeight: "700" },
  subCardDetail: { fontSize: 12 },
  renewBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  renewBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  qrCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    alignItems: "center",
  },
  qrHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  qrTitle: { fontSize: 16, fontWeight: "700" },
  qrDesc: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  qrImageWrap: {
    width: 200,
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    padding: 8,
  },
  qrImage: { width: "100%", height: "100%" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalDesc: { fontSize: 13, lineHeight: 20 },
  fieldLabel: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
