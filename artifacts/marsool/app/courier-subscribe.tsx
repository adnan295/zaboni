import React, { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/apiConfig";

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

async function uploadReceipt(imageUri: string): Promise<string> {
  const base = getApiBaseUrl();
  const urlRes = await fetch(`${base}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg" }),
  });
  if (!urlRes.ok) throw new Error("فشل الحصول على رابط الرفع");
  const { uploadUrl, key } = await urlRes.json();

  const blob = await fetch(imageUri).then((r) => r.blob());
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!putRes.ok) throw new Error("فشل رفع الصورة");

  return key;
}

export default function CourierSubscribeScreen() {
  const colors = useColors();
  const { fontMedium, fontBold } = useTypography();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<"plan" | "payment">("plan");
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: subStatus, isLoading: loadingStatus } = useQuery<SubStatus>({
    queryKey: ["courier", "subscription", "status"],
    queryFn: () => customFetch("/api/courier/subscription/status"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: latestRequest, isLoading: loadingRequest } = useQuery<SubRequest | null>({
    queryKey: ["courier", "subscription", "request", "status"],
    queryFn: () => customFetch("/api/courier/subscription/request/status"),
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!subStatus) throw new Error("بيانات الاشتراك غير متاحة");
      let receiptUrl: string | undefined;
      if (receiptImageUri) {
        setUploading(true);
        try {
          receiptUrl = await uploadReceipt(receiptImageUri);
        } finally {
          setUploading(false);
        }
      }
      return customFetch("/api/courier/subscription/request", {
        method: "POST",
        body: JSON.stringify({
          vehicleType: subStatus.vehicleType,
          paidAmount: subStatus.monthlyPrice,
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
  };

  if (loadingStatus || loadingRequest) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (latestRequest?.status === "pending") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="hourglass-empty" size={64} color={colors.primary} />
        <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: fontBold }]}>
          طلبك قيد المراجعة
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fontMedium }]}>
          سيتم إشعارك فور الموافقة على طلب الاشتراك
        </Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoRow, { color: colors.foreground, fontFamily: fontMedium }]}>
            الباقة: {VEHICLE_LABELS[latestRequest.vehicleType] ?? latestRequest.vehicleType}
          </Text>
          <Text style={[styles.infoRow, { color: colors.foreground, fontFamily: fontMedium }]}>
            المبلغ المدفوع: {latestRequest.paidAmount.toLocaleString("ar-SY")} ل.س
          </Text>
        </View>
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
            المبلغ: {(subStatus?.monthlyPrice ?? 0).toLocaleString("ar-SY")} ل.س
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: fontBold }]}>
        صورة الوصل (اختياري)
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
  sectionLabel: { alignSelf: "flex-start", fontSize: 15, marginBottom: 12 },
  uploadRow: { flexDirection: "row", gap: 12, width: "100%", marginBottom: 20 },
  uploadBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6 },
  uploadBtnText: { fontSize: 13 },
  previewContainer: { width: "100%", height: 180, borderRadius: 12, overflow: "hidden", marginBottom: 20, position: "relative" },
  previewImage: { width: "100%", height: "100%" },
  removeImg: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 },
  note: { fontSize: 12, textAlign: "center", lineHeight: 20, marginTop: 4 },
  backBtn: { alignSelf: "flex-start", marginBottom: 16 },
});
