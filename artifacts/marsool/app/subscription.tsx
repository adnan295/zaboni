import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";

interface SubscriptionStatus {
  isSubscribed: boolean;
  subscription: {
    id: string;
    startsAt: string;
    endsAt: string;
    pricePaid: number;
    isActive: boolean;
  } | null;
  settings: {
    monthlyPrice: number;
    subscriberDeliveryFee: number;
  };
}

export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [data, setData] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await customFetch("/api/subscriptions/status") as SubscriptionStatus;
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );

  const handleSubscribe = () => {
    if (!data) return;
    const price = data.settings.monthlyPrice;
    Alert.alert(
      t("subscription.confirmTitle"),
      t("subscription.confirmBody", { price: price.toLocaleString("ar-SY") }),
      [
        { text: t("subscription.cancel"), style: "cancel" },
        {
          text: t("subscription.confirmBtn"),
          onPress: async () => {
            setSubscribing(true);
            try {
              await customFetch("/api/subscriptions/subscribe", { method: "POST" });
              await fetchStatus();
              Alert.alert(t("subscription.successTitle"), t("subscription.successBody"));
            } catch (e: unknown) {
              const err = e as { message?: string };
              if (err.message?.includes("insufficient_balance")) {
                Alert.alert(t("subscription.errorTitle"), t("subscription.insufficientBalance"));
              } else if (err.message?.includes("already_subscribed")) {
                Alert.alert(t("subscription.errorTitle"), t("subscription.alreadySubscribed"));
              } else {
                Alert.alert(t("subscription.errorTitle"), t("subscription.errorBody"));
              }
            } finally {
              setSubscribing(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ar-SY", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const isActive = data?.isSubscribed && data?.subscription && new Date(data.subscription.endsAt) > new Date();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-forward-ios" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("subscription.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {isActive && data?.subscription ? (
              <View style={[styles.activeCard, { backgroundColor: "#F0FFF4", borderColor: "#B0E8C0" }]}>
                <View style={styles.activeRow}>
                  <MaterialIcons name="verified" size={40} color="#4CAF50" />
                  <View style={styles.activeText}>
                    <Text style={[styles.activeTitle, { color: "#2E7D32" }]}>{t("subscription.activeTitle")}</Text>
                    <Text style={[styles.activeSub, { color: "#388E3C" }]}>
                      {t("subscription.activeUntil", { date: formatDate(data.subscription.endsAt) })}
                    </Text>
                  </View>
                </View>
                <View style={[styles.benefitRow, { borderTopColor: "#B0E8C0" }]}>
                  <MaterialIcons name="local-shipping" size={20} color="#4CAF50" />
                  <Text style={[styles.benefitText, { color: "#388E3C" }]}>
                    {data.settings.subscriberDeliveryFee === 0
                      ? t("subscription.freeDeliveryActive")
                      : t("subscription.discountedDelivery", { fee: data.settings.subscriberDeliveryFee.toLocaleString("ar-SY") })}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="local-shipping" size={48} color="rgba(255,255,255,0.9)" />
                <Text style={styles.heroTitle}>{t("subscription.heroTitle")}</Text>
                <Text style={styles.heroSub}>{t("subscription.heroSub")}</Text>
                <Text style={styles.heroPrice}>
                  {(data?.settings.monthlyPrice ?? 0).toLocaleString("ar-SY")} {t("subscription.currency")}
                  <Text style={styles.heroPeriod}> / {t("subscription.perMonth")}</Text>
                </Text>
              </View>
            )}

            <View style={[styles.benefitsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.benefitsTitle, { color: colors.foreground }]}>{t("subscription.benefitsTitle")}</Text>

              <BenefitRow
                icon="local-shipping"
                label={data?.settings.subscriberDeliveryFee === 0
                  ? t("subscription.benefit1Free")
                  : t("subscription.benefit1Discounted", { fee: (data?.settings.subscriberDeliveryFee ?? 0).toLocaleString("ar-SY") })}
                colors={colors}
              />
              <BenefitRow icon="repeat" label={t("subscription.benefit2")} colors={colors} />
              <BenefitRow icon="star" label={t("subscription.benefit3")} colors={colors} />
              <BenefitRow icon="verified" label={t("subscription.benefit4")} colors={colors} />
            </View>

            {!isActive && (
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialIcons name="account-balance-wallet" size={22} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                  {t("subscription.walletInfo")}
                </Text>
              </View>
            )}

            {!isActive && (
              <TouchableOpacity
                style={[styles.subscribeBtn, { backgroundColor: colors.primary, opacity: subscribing ? 0.7 : 1 }]}
                onPress={handleSubscribe}
                disabled={subscribing}
                activeOpacity={0.85}
              >
                {subscribing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="star" size={20} color="#fff" />
                    <Text style={styles.subscribeBtnText}>{t("subscription.subscribeBtn")}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BenefitRow({ icon, label, colors }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.benefitItem}>
      <MaterialIcons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.benefitItemText, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  content: { padding: 16, gap: 14 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },

  heroCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },
  heroPrice: { fontSize: 28, fontWeight: "900", color: "#fff", marginTop: 8 },
  heroPeriod: { fontSize: 16, fontWeight: "400", color: "rgba(255,255,255,0.8)" },

  activeCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20 },
  activeText: { flex: 1 },
  activeTitle: { fontSize: 18, fontWeight: "700" },
  activeSub: { fontSize: 13, marginTop: 4 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: 1 },
  benefitText: { fontSize: 14, fontWeight: "500" },

  benefitsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  benefitsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  benefitItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitItemText: { fontSize: 14, flex: 1, lineHeight: 20 },

  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoText: { fontSize: 13, flex: 1, lineHeight: 18 },

  subscribeBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 4,
  },
  subscribeBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
