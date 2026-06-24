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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type SubRequest = {
  id: string;
  courierId: string;
  vehicleType: string;
  planAmount: number;
  paidAmount: number;
  receiptUrl: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
};

type SubStatus = {
  isActive: boolean;
  vehicleType: string;
  monthlyPrice: number;
};

const VEHICLE_LABELS: Record<string, string> = {
  bicycle: "دراجة هوائية",
  motorcycle: "دراجة نارية",
  car: "سيارة",
};

async function uploadReceiptToStorage(imageUri: string): Promise<string> {
  const filename = imageUri.split("/").pop() ?? "receipt.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : "jpg";
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const blob = await (await fetch(imageUri)).blob();
  const size = blob.size > 0 ? blob.size : 1;

  const urlRes = await customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, size, contentType }),
    }
  );

  const uploadResponse = await fetch(urlRes.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error("فشل رفع صورة الوصل");
  }

  return urlRes.objectPath;
}

export default function CourierSubscribeScreen() {
  const colors = useColors();
  const { fontMedium, fontBold } = useTypography();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<"plan" | "payment">("plan");
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
      if (!subStatus) throw new Error("بيانات الاشتراك غير متاحة");

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
        receiptUrl = await uploadReceiptToStorage(receiptImageUri);
      } finally {
        setUploading(false);
      }

      return customFetch("/api/courier/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType: subStatus.vehicleType,
          paidAmount,
          receiptUrl,
        }),
      });
    },
    onSuccess: () => {
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
    qc.invalidateQueries({ queryKey: ["courier", "subscription", "request", "status"] });
    setStep("plan");
    setReceiptImageUri(null);
    setPaidAmountText("");
  };

  if (loadingStatus || loadingRequest) {
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
            الباقة: {VEHICLE_LABELS[latestRequest.vehicleType] ?? latestRequest.vehicleType}
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

  if (latestRequest?.status === "rejected") {
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
          اشترك لتبدأ العمل
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
          لاستلام الطلبات، تحتاج إلى اشتراك شهري نشط
        </Text>

        {subStatus && (
          <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={styles.planHeader}>
              <MaterialIcons name="directions-bike" size={28} color={colors.primary} />
              <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: fontBold }]}>
                باقة {VEHICLE_LABELS[subStatus.vehicleType] ?? subStatus.vehicleType}
              </Text>
            </View>
            <Text style={[styles.planPrice, { color: colors.primary, fontFamily: fontBold }]}>
              {subStatus.monthlyPrice.toLocaleString("ar-SY")} ل.س / شهر
            </Text>
            <View style={styles.planFeatures}>
              {["استلام طلبات غير محدودة", "100% من رسوم التوصيل لك", "دعم فني مستمر"].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <MaterialIcons name="check-circle" size={16} color="#16a34a" />
                  <Text style={[styles.featureText, { color: colors.foreground, fontFamily: fontMedium }]}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => setStep("payment")}
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
        ادفع المبلغ كاشاً في مكتبنا، ثم ارفع صورة الوصل
      </Text>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoRowView}>
          <MaterialIcons name="location-on" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground, fontFamily: fontMedium }]}>
            مكتب زبوني — دمشق
          </Text>
        </View>
        <View style={styles.infoRowView}>
          <MaterialIcons name="payments" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground, fontFamily: fontBold }]}>
            المبلغ المطلوب: {(subStatus?.monthlyPrice ?? 0).toLocaleString("ar-SY")} ل.س
          </Text>
        </View>
      </View>

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
        placeholder={`مثلاً: ${(subStatus?.monthlyPrice ?? 0).toLocaleString("ar-SY")}`}
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
  planCard: { width: "100%", borderRadius: 16, borderWidth: 2, padding: 20, marginBottom: 24 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  planTitle: { fontSize: 17 },
  planPrice: { fontSize: 24, marginBottom: 16 },
  planFeatures: { gap: 8 },
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
});
