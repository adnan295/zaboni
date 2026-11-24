import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useAddresses } from "@/context/AddressContext";
import { useOrders } from "@/context/OrderContext";
import { addItemToOrderText } from "@/utils/orderText";

interface Place {
  id: string;
  nameAr: string;
  lat: number;
  lon: number;
  district: string;
  category: string;
  menu: { title: string; items: string[] }[];
  menuImages: string[];
}

interface Quote {
  fee: number;
  km: number;
  outOfArea: boolean;
}

export default function DirectoryPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { defaultAddress } = useAddresses();
  const { placeOrder } = useOrders();

  const [place, setPlace] = useState<Place | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setPlace(await customFetch<Place>(`/api/directory/places/${id}`));
    } catch {
      setLoadError(true);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // The fee depends on where it is delivered: re-quote when the address changes.
  const lat = defaultAddress?.latitude;
  const lon = defaultAddress?.longitude;
  useEffect(() => {
    if (!id || lat == null || lon == null) { setQuote(null); return; }
    let cancelled = false;
    customFetch<Quote>(`/api/directory/places/${id}/quote?lat=${lat}&lon=${lon}`)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [id, lat, lon]);

  const submit = async () => {
    if (!place) return;
    if (!orderText.trim()) {
      Alert.alert(t("errand.errorTitle"), t("directory.orderRequired"));
      return;
    }
    if (!defaultAddress) {
      Alert.alert(t("errand.errorTitle"), t("errand.noAddressAlert"));
      router.push("/addresses");
      return;
    }
    if (lat == null || lon == null) {
      Alert.alert(t("orderRequest.noLocationTitle"), t("orderRequest.noLocationBody"), [
        { text: t("orderRequest.setLocation"), onPress: () => router.push("/addresses") },
        { text: t("common.cancel"), style: "cancel" },
      ]);
      return;
    }
    if (quote?.outOfArea) {
      Alert.alert(t("errand.errorTitle"), t("directory.outOfArea"));
      return;
    }
    setSubmitting(true);
    try {
      const order = await placeOrder({
        orderType: "errand",
        directoryPlaceId: place.id,
        placeName: place.nameAr,
        orderText: orderText.trim(),
        restaurantName: "",
        address: defaultAddress.address,
        lat,
        lon,
      });
      router.replace(`/order-tracking/${order.id}` as any);
    } catch (err: unknown) {
      const apiErr = err as { data?: { message?: string } };
      Alert.alert(t("errand.errorTitle"), apiErr?.data?.message ?? t("errand.errorMsg"));
    } finally {
      setSubmitting(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (!place) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {loadError ? (
          <TouchableOpacity onPress={load} style={[styles.retry, { borderColor: colors.primary }]}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("directory.retry")}</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: colors.primary }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name={backIcon} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{place.nameAr}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{[place.category, place.district].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {place.menuImages.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.section, { color: colors.foreground }]}>{t("directory.menuPhotos")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {place.menuImages.map((uri) => (
                  <TouchableOpacity key={uri} onPress={() => setPhoto(uri)} activeOpacity={0.85}>
                    <Image source={{ uri }} style={[styles.thumb, { borderColor: colors.border }]} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {place.menu.length > 0 && (
            <View style={{ gap: 10 }}>
              <View style={{ gap: 2 }}>
                <Text style={[styles.section, { color: colors.foreground }]}>{t("directory.menu")}</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("directory.tapToAdd")}</Text>
              </View>
              {place.menu.map((s, si) => (
                <View key={`${si}-${s.title}`} style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {s.title ? <Text style={[styles.menuTitle, { color: colors.primary }]}>{s.title}</Text> : null}
                  <View style={styles.items}>
                    {s.items.map((item, ii) => (
                      <TouchableOpacity
                        key={`${ii}-${item}`}
                        onPress={() => setOrderText((txt) => addItemToOrderText(txt, item))}
                        style={[styles.item, { borderColor: colors.border, backgroundColor: colors.background }]}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="add" size={14} color={colors.primary} />
                        <Text style={[styles.itemText, { color: colors.foreground }]}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("directory.noPrices")}</Text>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text style={[styles.section, { color: colors.foreground }]}>{t("directory.yourOrder")}</Text>
            <TextInput
              style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder={t("directory.orderPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={orderText}
              onChangeText={setOrderText}
              multiline
              textAlignVertical="top"
              textAlign="right"
            />
          </View>

          <TouchableOpacity
            style={[styles.addressRow, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.push("/addresses")}
            activeOpacity={0.8}
          >
            <MaterialIcons name="location-on" size={20} color={colors.primary} />
            <Text style={[styles.addressText, { color: defaultAddress ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>
              {defaultAddress ? defaultAddress.address : t("errand.noAddress")}
            </Text>
            <MaterialIcons name="chevron-left" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.feeRow}>
              <Text style={{ color: colors.mutedForeground }}>{t("directory.deliveryFee")}</Text>
              <Text style={[styles.fee, { color: quote?.outOfArea ? "#dc2626" : colors.primary }]}>
                {quote == null ? "—" : quote.outOfArea ? t("directory.outOfArea") : `${quote.fee.toLocaleString("ar-SY")} ل.س`}
              </Text>
            </View>
            <View style={[styles.billNote, { backgroundColor: "#fff7ed" }]}>
              <MaterialIcons name="receipt-long" size={18} color="#c2410c" />
              <Text style={styles.billText}>{t("directory.billNote")}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submit, { backgroundColor: submitting || quote?.outOfArea ? colors.border : colors.primary }]}
            onPress={submit}
            disabled={submitting || !!quote?.outOfArea}
            activeOpacity={0.85}
          >
            <MaterialIcons name="shopping-bag" size={20} color="#fff" />
            <Text style={styles.submitText}>{submitting ? t("errand.submitting") : t("directory.submit", { name: place.nameAr })}</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={photo != null} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
          <View style={styles.viewer}>
            <TouchableOpacity style={[styles.viewerClose, { top: insets.top + 12 }]} onPress={() => setPhoto(null)}>
              <MaterialIcons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
            >
              {photo && <Image source={{ uri: photo }} style={styles.viewerImage} resizeMode="contain" />}
            </ScrollView>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  retry: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 14 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center" },
  content: { padding: 16, gap: 18 },
  section: { fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 12 },
  thumb: { width: 120, height: 160, borderRadius: 10, borderWidth: 1 },
  menuCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  menuTitle: { fontSize: 14, fontWeight: "800" },
  items: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  itemText: { fontSize: 13 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 110, fontSize: 15, lineHeight: 22 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  addressText: { flex: 1, fontSize: 14 },
  summary: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fee: { fontSize: 15, fontWeight: "800" },
  billNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: 10, padding: 10 },
  billText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#9a3412" },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  viewerClose: { position: "absolute", right: 16, zIndex: 2, padding: 6 },
  viewerImage: { width: "100%", height: "100%", minHeight: 500 },
});
