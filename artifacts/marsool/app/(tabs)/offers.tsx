import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/lib/apiConfig";
import RestaurantCard, { RestaurantCardSkeleton } from "@/components/RestaurantCard";

type RestaurantItem = {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  categoryAr: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrder: number;
  image: string;
  tags: string[];
  isOpen: boolean;
  isLogo: boolean;
  discount: string | null;
  hasFlashDeal?: boolean;
  flashDealEndsAt?: string | null;
  maxDealPercent?: number | null;
};

async function fetchDeals(): Promise<RestaurantItem[]> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/home-sections/deals`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchDiscounted(): Promise<RestaurantItem[]> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/restaurants`);
    if (!res.ok) return [];
    const all: RestaurantItem[] = await res.json();
    return all.filter((r) => r.discount || r.hasFlashDeal);
  } catch {
    return [];
  }
}

export default function OffersScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const { data: deals = [], isLoading: isDealsLoading, refetch: refetchDeals } = useQuery<RestaurantItem[]>({
    queryKey: ["offers-deals"],
    queryFn: fetchDeals,
    staleTime: 2 * 60 * 1000,
  });

  const { data: discounted = [], isLoading: isDiscountedLoading, refetch: refetchDisc } = useQuery<RestaurantItem[]>({
    queryKey: ["offers-discounted"],
    queryFn: fetchDiscounted,
    staleTime: 2 * 60 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refetchDeals(), refetchDisc()]); } finally { setRefreshing(false); }
  }, [refetchDeals, refetchDisc]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const isLoading = isDealsLoading || isDiscountedLoading;
  const empty = !isLoading && deals.length === 0 && discounted.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>{t("tabs.offers")}</Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#DC2626"]} tintColor="#DC2626" />
        }
      >
        {deals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="local-offer" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.flashDeals")}</Text>
            </View>
            {isDealsLoading
              ? [0, 1, 2].map((i) => <RestaurantCardSkeleton key={i} />)
              : deals.map((r) => (
                  <TouchableOpacity key={r.id} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
                    <RestaurantCard restaurant={r} onPress={() => router.push(`/restaurant/${r.id}` as any)} />
                  </TouchableOpacity>
                ))}
          </View>
        )}

        {discounted.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="percent" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.specialOffers") ?? "عروض خاصة"}</Text>
            </View>
            {isDiscountedLoading
              ? [0, 1, 2].map((i) => <RestaurantCardSkeleton key={i} />)
              : discounted.map((r) => (
                  <TouchableOpacity key={r.id} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
                    <RestaurantCard restaurant={r} onPress={() => router.push(`/restaurant/${r.id}` as any)} />
                  </TouchableOpacity>
                ))}
          </View>
        )}

        {empty && (
          <View style={styles.empty}>
            <MaterialIcons name="local-offer" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد عروض متاحة الآن</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 100, gap: 12 },
  emptyText: { fontSize: 15 },
});
