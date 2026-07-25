import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type SubscriptionPeriod = "weekly" | "monthly" | "yearly";

type SubPlan = {
  id: string;
  name: string;
  period: SubscriptionPeriod;
  price: number;
  isActive: boolean;
};

type SubRequest = {
  id: string;
  courierId: string;
  planId: string;
  planName: string;
  planPeriod: SubscriptionPeriod;
  planPrice: number;
  paidAmount: number;
  receiptUrl: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
};

type SubStatus = {
  isActive: boolean;
  subscription: {
    planName?: string;
    planPeriod?: SubscriptionPeriod;
  } | null;
};

type PaymentInfo = {
  accountImage: string | null;
  qrImage: string | null;
};

const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  weekly: "أسبوعي",
  monthly: "شهري",
  yearly: "سنوي",
};

export default function CourierSubscribeScreen() {
  const colors = useColors();
  const { fontMedium, fontBold } = useTypography();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<"plan" | "payment">("plan");
  // Set when the courier taps "retry" on a rejected request, so we bypass the
  // rejected screen and show the plan/payment form again (the stored request
  // stays "rejected" until a new one is submitted, so without this flag the
  // rejected screen would immediately re-render and trap them).
  const [retrying, setRetrying] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [paidAmountText, setPaidAmountText] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: subStatus, isLoading: loadingStatus } = useQuery<SubStatus>({
    queryKey: ["courier", "subscription", "status"],
    queryFn: () => customFetch("/api/courier/subscription/status"),
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const { data: plans, isLoading: loadingPlans } = useQuery<SubPlan[]>({
    queryKey: ["courier", "subscription", "plans"],
    queryFn: () => customFetch("/api/courier/subscription-plans"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: paymentInfo } = useQuery<PaymentInfo>({
    queryKey: ["public", "payment-info"],
    queryFn: () => customFetch<PaymentInfo>("/api/public/payment-info"),
    staleTime: 60_000,
  });

  const { data: latestRequest, isLoading: loadingRequest } = useQuery<SubRequest | null>({
    queryKey: ["courier", "subscription", "request", "status"],
    queryFn: () => customFetch("/api/courier/subscription/request/status"),
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (subStatus?.isActive === true) {
      router.replace("/(courier)/available" as never);
    }
  }, [subStatus?.isActive, router]);

  useEffect(() => {
    if (!selectedPlanId && plans && plans.length > 0) {
      setSelectedPlanId(plans[0]!.id);
    }
  }, [plans, selectedPlanId]);

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId) ?? null;

  const cancelMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/courier/subscription/request", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courier", "subscription", "request", "status"] });
      setStep("plan");
      setReceiptImageUri(null);
      setPaidAmountText("");
    },
    onError: (err: Error) => {
      Alert.alert("لا يمكن الإلغاء الآن", err.message || "يرجى المحاولة لاحقاً");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) throw new Error("يرجى اختيار باقة");

      const paidAmount = parseInt(paidAmountText.replace(/[^0-9]/g, ""), 10);
      if (!paidAmountText || isNaN(paidAmount) || paidAmount <= 0) {
        throw new Error("يرجى إدخال المبلغ المدفوع");
      }

      if (!receiptImageUri) {
        throw new Error("يرجى رفع صورة وصل الدفع");
      }

      setUploading(true);
      let receiptUrl: string;
      try {
        receiptUrl = await uploadImageToStorage(receiptImageUri, "receipt.jpg");
      } finally {
        setUploading(false);
      }

      return customFetch("/api/courier/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          paidAmount,
          receiptUrl,
        }),
      });
    },
    onSuccess: () => {
      // New request submitted (now "pending"); clear the retry bypass so a future
      // rejection of THIS request shows its rejected screen normally.
      setRetrying(false);
      qc.invalidateQueries({ queryKey: ["courier", "subscription", "request", "status"] });
    },
    onError: (err: Error) => {
      Alert.alert("خطأ", err.message || "حدث خطأ أثناء إرسال الطلب");
    },
  });

  const pickReceipt = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول للكاميرا");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setReceiptImageUri(result.assets[0].uri);
    }
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    setStep("plan");
    setSelectedPlanId(null);
    setReceiptImageUri(null);
    setPaidAmountText("");
    qc.invalidateQueries({ queryKey: ["courier", "subscription", "request", "status"] });
  };

  if (loadingStatus || loadingRequest || loadingPlans) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (latestRequest?.status === "pending") {
    const createdAt = new Date(latestRequest.createdAt).getTime();
    const ageMs = Date.now() - createdAt;
    const tenMinutes = 10 * 60 * 1000;
    const canCancel = ageMs >= tenMinutes;
    const remainingMin = canCancel ? 0 : Math.ceil((tenMinutes - ageMs) / 60_000);

    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <MaterialIcons name="hourglass-empty" size={64} color={colors.primary} />
        <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
          طلبك قيد المراجعة
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
          سيتم إشعارك فور الموافقة على طلب الاشتراك
        </Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
          <Text style={[styles.infoRow, { color: colors.foreground, fontFamily: fontMedium }]}>
            الباقة: {latestRequest.planName} ({PERIOD_LABEL[latestRequest.planPeriod] ?? latestRequest.planPeriod})
          </Text>
          <Text style={[styles.infoRow, { color: colors.foreground, fontFamily: fontMedium }]}>
            المبلغ المدفوع: {latestRequest.paidAmount.toLocaleString("ar-SY")} ل.س
          </Text>
        </View>

        {canCancel ? (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: "#dc2626" }]}
            onPress={() => {
              Alert.alert(
                "إلغاء الطلب",
                "هل تريد إلغاء طلب الاشتراك وإعادة الإرسال؟",
                [
                  { text: "لا", style: "cancel" },
                  { text: "نعم، إلغاء", style: "destructive", onPress: () => cancelMutation.mutate() },
                ]
              );
            }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={[styles.outlineBtnText, { color: "#dc2626", fontFamily: fontBold }]}>
                إلغاء وإعادة الإرسال
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.infoCard, { backgroundColor: "#fef9c3", borderColor: "#fde047", width: "100%" }]}>
            <Text style={[styles.infoRow, { color: "#854d0e", fontFamily: fontMedium, textAlign: "center" }]}>
              يمكنك إلغاء الطلب وإعادة الإرسال بعد {remainingMin} دقيقة
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (latestRequest?.status === "approved") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="check-circle" size={64} color="#16a34a" />
        <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
          تمت الموافقة على اشتراكك!
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
          يمكنك الآن استلام الطلبات. جاري تحديث حالة الاشتراك…
        </Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (latestRequest?.status === "rejected" && !retrying) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="cancel" size={64} color="#dc2626" />
        <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
          تم رفض الطلب
        </Text>
        {latestRequest.adminNote ? (
          <View style={[styles.infoCard, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
            <Text style={[styles.infoRow, { color: "#dc2626", fontFamily: fontMedium }]}>
              السبب: {latestRequest.adminNote}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleRetry}
        >
          <Text style={[styles.primaryBtnText, { fontFamily: fontBold }]}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "plan") {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <MaterialIcons name="card-membership" size={56} color={colors.primary} style={styles.icon} />
        <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
          اختر باقتك
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
          لاستلام الطلبات، تحتاج إلى باقة اشتراك نشطة
        </Text>

        {!plans || plans.length === 0 ? (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
            <Text style={[styles.infoRow, { color: colors.mutedForeground, fontFamily: fontMedium, textAlign: "center" }]}>
              لا توجد باقات متاحة حالياً، يرجى التواصل مع الإدارة
            </Text>
          </View>
        ) : (
          <View style={{ width: "100%", gap: 12, marginBottom: 8 }}>
            {plans.map((plan) => {
              const selected = plan.id === selectedPlanId;
              return (
                <TouchableOpacity
                  key={plan.id}
                  onPress={() => setSelectedPlanId(plan.id)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.planHeader}>
                    <MaterialIcons
                      name={selected ? "radio-button-checked" : "radio-button-unchecked"}
                      size={22}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: fontBold }]}>
                      {plan.name}
                    </Text>
                    <View style={[styles.periodBadge, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.periodBadgeText, { color: colors.primary, fontFamily: fontMedium }]}>
                        {PERIOD_LABEL[plan.period] ?? plan.period}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.planPrice, { color: colors.primary, fontFamily: fontBold }]}>
                    {plan.price.toLocaleString("ar-SY")} ل.س
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.planFeatures}>
          {["استلام طلبات غير محدودة", "100% من رسوم التوصيل لك", "دعم فني مستمر"].map((f) => (
            <View key={f} style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={16} color="#16a34a" />
              <Text style={[styles.featureText, { color: colors.foreground, fontFamily: fontMedium }]}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: selectedPlan ? 1 : 0.5 }]}
          onPress={() => setStep("payment")}
          disabled={!selectedPlan}
        >
          <Text style={[styles.primaryBtnText, { fontFamily: fontBold }]}>اشترك الآن</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => setStep("plan")}>
        <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
        تعليمات الدفع
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
        حوّل المبلغ خارجياً، ثم ارفع صورة الوصل
      </Text>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoRowView}>
          <MaterialIcons name="card-membership" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground, fontFamily: fontBold }]}>
            الباقة: {selectedPlan?.name} ({PERIOD_LABEL[selectedPlan?.period ?? "monthly"]})
          </Text>
        </View>
        <View style={styles.infoRowView}>
          <MaterialIcons name="payments" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground, fontFamily: fontBold }]}>
            المبلغ المطلوب: {(selectedPlan?.price ?? 0).toLocaleString("ar-SY")} ل.س
          </Text>
        </View>
      </View>

      {(paymentInfo?.accountImage || paymentInfo?.qrImage) && (
        <View style={{ width: "100%", marginBottom: 20, gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: fontBold, marginBottom: 4 }]}>
            معلومات التحويل
          </Text>
          {paymentInfo.accountImage ? (
            <Image
              source={{ uri: paymentInfo.accountImage }}
              style={styles.paymentInfoImage}
              resizeMode="contain"
            />
          ) : null}
          {paymentInfo.qrImage ? (
            <Image
              source={{ uri: paymentInfo.qrImage }}
              style={styles.paymentQrImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: fontBold }]}>
        المبلغ المدفوع <Text style={{ color: "#dc2626" }}>*</Text>
      </Text>
      <TextInput
        style={[styles.amountInput, {
          borderColor: colors.border,
          backgroundColor: colors.card,
          color: colors.foreground,
          fontFamily: fontMedium,
        }]}
        placeholder={`مثلاً: ${(selectedPlan?.price ?? 0).toLocaleString("ar-SY")}`}
        placeholderTextColor={colors.mutedForeground}
        keyboardType="numeric"
        value={paidAmountText}
        onChangeText={setPaidAmountText}
        returnKeyType="done"
      />

      <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: fontBold }]}>
        صورة وصل الدفع <Text style={{ color: "#dc2626" }}>*</Text>
      </Text>

      {receiptImageUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: receiptImageUri }} style={styles.previewImage} resizeMode="cover" />
          <TouchableOpacity style={styles.removeImg} onPress={() => setReceiptImageUri(null)}>
            <MaterialIcons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.uploadRow}>
          <TouchableOpacity
            style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={pickReceipt}
          >
            <MaterialIcons name="photo-library" size={22} color={colors.primary} />
            <Text style={[styles.uploadBtnText, { color: colors.primary, fontFamily: fontMedium }]}>من الاستوديو</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={takePhoto}
          >
            <MaterialIcons name="camera-alt" size={22} color={colors.primary} />
            <Text style={[styles.uploadBtnText, { color: colors.primary, fontFamily: fontMedium }]}>التقاط صورة</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: submitMutation.isPending || uploading ? 0.7 : 1 }]}
        onPress={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || uploading}
      >
        {submitMutation.isPending || uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.primaryBtnText, { fontFamily: fontBold }]}>أرسل الطلب</Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
        سيتم مراجعة طلبك خلال 24 ساعة وإشعارك بالنتيجة
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  container: { alignItems: "center", paddingHorizontal: 20 },
  icon: { marginBottom: 12 },
  bigTitle: { fontSize: 22, textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  planCard: { width: "100%", borderRadius: 16, padding: 16 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  planTitle: { fontSize: 16, flex: 1 },
  periodBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  periodBadgeText: { fontSize: 12 },
  planPrice: { fontSize: 22 },
  planFeatures: { gap: 8, width: "100%", marginBottom: 16, marginTop: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 14 },
  primaryBtn: { width: "100%", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontSize: 16 },
  infoCard: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20, gap: 10 },
  infoRow: { fontSize: 14, lineHeight: 22 },
  infoRowView: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 14 },
  sectionLabel: { alignSelf: "flex-start", fontSize: 15, marginBottom: 10 },
  amountInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
    textAlign: "right",
  },
  uploadRow: { flexDirection: "row", gap: 12, width: "100%", marginBottom: 20 },
  uploadBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6 },
  uploadBtnText: { fontSize: 13 },
  previewContainer: { width: "100%", height: 180, borderRadius: 12, overflow: "hidden", marginBottom: 20, position: "relative" },
  previewImage: { width: "100%", height: "100%" },
  removeImg: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 },
  note: { fontSize: 12, textAlign: "center", lineHeight: 20, marginTop: 4 },
  backBtn: { alignSelf: "flex-start", marginBottom: 16 },
  outlineBtn: { width: "100%", borderRadius: 12, borderWidth: 1.5, paddingVertical: 13, alignItems: "center", marginTop: 8 },
  outlineBtnText: { fontSize: 15 },
  paymentInfoImage: { width: "100%", height: 160, borderRadius: 10 },
  paymentQrImage: { width: 160, height: 160, alignSelf: "center", borderRadius: 10 },
});
