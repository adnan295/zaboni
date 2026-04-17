import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Image,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import RestaurantCard from "@/components/RestaurantCard";
import ZaboniLogo from "@/components/ZaboniLogo";
import { useAddresses } from "@/context/AddressContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { useGetRestaurants } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { CATEGORIES } from "@/data/restaurants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_WIDTH = SCREEN_WIDTH - 32;

type PromoBanner = {
  id: string;
  image: string;
  restaurantId: string | null;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  iconName: string;
  bgColor: string;
  sortOrder: number;
  isActive: boolean;
};

type RestaurantCategory = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
};

const FALLBACK_BANNERS: PromoBanner[] = [];

const FALLBACK_CATEGORIES: RestaurantCategory[] = CATEGORIES
  .filter((c) => c.id !== "all")
  .map((c, i) => ({ id: c.id, code: c.id, nameAr: c.name, nameEn: c.id, iconName: c.icon, sortOrder: i, isActive: true }));

async function fetchBanners(): Promise<PromoBanner[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/banners`);
  if (!res.ok) throw new Error("fetch failed");
  const data: PromoBanner[] = await res.json();
  if (data.length === 0) return FALLBACK_BANNERS;
  return data;
}

async function fetchCategories(): Promise<RestaurantCategory[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/categories`);
  if (!res.ok) throw new Error("fetch failed");
  const data: RestaurantCategory[] = await res.json();
  if (data.length === 0) return FALLBACK_CATEGORIES;
  return data;
}

const ALL_CATEGORY = { id: "all", nameAr: "الكل", nameEn: "All", iconName: "grid-view" };

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { defaultAddress } = useAddresses();
  const { unreadCount } = useNotifications();
  const { activeOrder } = useOrders();
  const { user } = useAuth();

  const { data: apiRestaurants, isLoading: restaurantsLoading, refetch } = useGetRestaurants();
  const { data: apiBanners = FALLBACK_BANNERS } = useQuery({ queryKey: ["banners"], queryFn: fetchBanners, staleTime: 5 * 60 * 1000, placeholderData: FALLBACK_BANNERS });
  const { data: apiCategories = FALLBACK_CATEGORIES } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60 * 1000, placeholderData: FALLBACK_CATEGORIES });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const [activeBanner, setActiveBanner] = useState(0);
  const bannerScrollRef = useRef<ScrollView>(null);

  const handleBannerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH);
    setActiveBanner(Math.max(0, Math.min(idx, apiBanners.length - 1)));
  };

  const displayCategories = [ALL_CATEGORY, ...apiCategories];

  const allRestaurants = apiRestaurants ?? [];
  const filtered = allRestaurants.filter((r) => {
    if (selectedCategory === "all") return true;
    const selected = apiCategories.find((c) => c.id === selectedCategory);
    return r.category === (selected?.code || selectedCategory);
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const getOrderStatusText = () => {
    if (!activeOrder) return "";
    if (activeOrder.status === "searching") return t("home.order.searching");
    if (activeOrder.status === "accepted") return `${activeOrder.courierName} ${t("home.order.accepted")}`;
    if (activeOrder.status === "picked_up") return t("home.order.pickedUp");
    if (activeOrder.status === "on_way") return t("home.order.onWay");
    if (activeOrder.status === "delivered") return t("home.order.delivered");
    return "";
  };

  const firstName = user?.name ? user.name.split(" ")[0] : null;

  const selectedCategoryLabel = (() => {
    const found = displayCategories.find((c) => c.id === selectedCategory);
    if (!found) return "";
    return isAr ? found.nameAr : found.nameEn;
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#DC2626"]}
            tintColor="#DC2626"
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
          <ZaboniLogo size="small" showName={false} />
          <TouchableOpacity style={styles.locationRow} onPress={() => router.push("/addresses")}>
            <MaterialIcons name="location-on" size={18} color={colors.primary} />
            <Text style={[styles.location, { color: colors.foreground }]} numberOfLines={1}>
              {defaultAddress ? defaultAddress.label : t("home.addAddress")}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.notifBtn, { backgroundColor: colors.card }]}
            onPress={() => router.push("/notifications")}
          >
            <MaterialIcons name="notifications-none" size={22} color={colors.foreground} />
            {unreadCount > 0 && (
              <View style={[styles.notifBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <View style={styles.greeting}>
          {firstName ? (
            <Text style={[styles.greetTitle, { color: colors.foreground }]}>
              {t("home.greeting", { name: firstName })}
            </Text>
          ) : (
            <Text style={[styles.greetTitle, { color: colors.foreground }]}>
              {t("home.discoverTitle")}{" "}
              <Text style={{ color: colors.primary }}>{t("home.discoverSub")}</Text>
            </Text>
          )}
        </View>

        {/* Search */}
        <TouchableOpacity
          style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/search")}
          activeOpacity={0.8}
        >
          <MaterialIcons name="search" size={20} color={colors.mutedForeground} />
          <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
            {t("home.searchPlaceholder")}
          </Text>
          <MaterialIcons name="tune" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* Promotional Banners Carousel */}
        {apiBanners.length > 0 && (
          <View style={styles.bannersSection}>
            <ScrollView
              ref={bannerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={BANNER_WIDTH + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.bannersScroll}
              onMomentumScrollEnd={handleBannerScroll}
            >
              {apiBanners.map((banner) => (
                <TouchableOpacity
                  key={banner.id}
                  activeOpacity={banner.restaurantId ? 0.85 : 1}
                  onPress={() => {
                    if (banner.restaurantId) {
                      router.push(`/restaurant/${banner.restaurantId}` as any);
                    }
                  }}
                  style={[styles.bannerCard, { width: BANNER_WIDTH }]}
                >
                  {banner.image ? (
                    <Image
                      source={{ uri: banner.image }}
                      style={styles.bannerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.bannerImage, { backgroundColor: banner.bgColor || "#DC2626", justifyContent: "center", alignItems: "center" }]}>
                      <MaterialIcons
                        name={(banner.iconName as keyof typeof MaterialIcons.glyphMap) ?? "local-offer"}
                        size={48}
                        color="#fff"
                      />
                    </View>
                  )}
                  {!!(banner.titleAr || banner.titleEn) && (
                    <View style={styles.bannerOverlay} pointerEvents="none">
                      <Text style={[styles.bannerOverlayText, { textAlign: isAr ? "right" : "left" }]} numberOfLines={2}>
                        {isAr ? (banner.titleAr || banner.titleEn) : (banner.titleEn || banner.titleAr)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {apiBanners.length > 1 && (
              <View style={styles.dotsRow}>
                {apiBanners.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: i === activeBanner ? colors.primary : colors.border },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
          style={styles.categoriesContainer}
        >
          {displayCategories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryBtn,
                {
                  backgroundColor: selectedCategory === cat.id ? colors.primary : colors.card,
                  borderColor: selectedCategory === cat.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: selectedCategory === cat.id ? "#fff" : colors.foreground },
                ]}
              >
                {isAr ? cat.nameAr : cat.nameEn}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Active order banner */}
        {activeOrder && (
          <TouchableOpacity
            style={[styles.orderBanner, { backgroundColor: colors.secondary }]}
            onPress={() =>
              router.push({ pathname: "/order-tracking/[id]", params: { id: activeOrder.id } })
            }
          >
            <View style={[styles.bannerDot, { backgroundColor: colors.primary }]} />
            <View style={styles.bannerInfo}>
              <Text style={[styles.bannerText2, { color: colors.primary }]}>
                {getOrderStatusText()}
              </Text>
              <Text style={[styles.bannerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {activeOrder.restaurantName}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Restaurants */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {selectedCategory === "all"
                ? t("home.allRestaurants")
                : selectedCategoryLabel}
              <Text style={[styles.count, { color: colors.mutedForeground }]}> ({filtered.length})</Text>
            </Text>
            <TouchableOpacity onPress={() => router.push("/search")}>
              <MaterialIcons name="search" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {restaurantsLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
          ) : (
            <>
              {filtered.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onPress={() => router.push(`/restaurant/${restaurant.id}`)}
                />
              ))}

              {filtered.length === 0 && (
                <View style={styles.empty}>
                  <MaterialIcons name="search-off" size={48} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("home.noResults")}</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { fontSize: 15, fontWeight: "600" },
  notifBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", position: "relative" },
  notifBadge: { position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  greeting: { paddingHorizontal: 16, marginBottom: 16 },
  greetTitle: { fontSize: 24, fontWeight: "800", lineHeight: 34 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchPlaceholder: { flex: 1, fontSize: 14 },
  bannersSection: { marginBottom: 16 },
  bannersScroll: { paddingHorizontal: 16, gap: 12 },
  bannerCard: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  bannerImage: {
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  bannerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bannerOverlayText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  categoriesContainer: { marginBottom: 16 },
  categoriesScroll: { paddingHorizontal: 16, gap: 8 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontSize: 13, fontWeight: "600" },
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 14,
    gap: 10,
  },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerInfo: { flex: 1 },
  bannerText2: { fontSize: 14, fontWeight: "700" },
  bannerSub: { fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    writingDirection: "rtl",
  },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  count: { fontWeight: "400", fontSize: 14 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 16 },
});
