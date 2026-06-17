import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
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
import RestaurantCard, { RestaurantCardSkeleton } from "@/components/RestaurantCard";
import HorizontalRestaurantCard, { HorizontalRestaurantCardSkeleton } from "@/components/HorizontalRestaurantCard";
import { useAddresses } from "@/context/AddressContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl, buildImageUrl } from "@/lib/apiConfig";
import { customFetch } from "@workspace/api-client-react";
import { CATEGORIES } from "@/data/restaurants";
import * as Location from "expo-location";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  .map((c, i) => ({
    id: c.id,
    code: c.id,
    nameAr: c.name,
    nameEn: c.id,
    iconName: c.icon,
    sortOrder: i,
    isActive: true,
  }));

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
  lat?: number | null;
  lon?: number | null;
  phone?: string | null;
  sortOrder?: number | null;
  distanceKm?: number | null;
};

type SortBy = "default" | "rating" | "time" | "fee";

const ALL_CATEGORY: { id: string; nameAr: string; nameEn: string; iconName: string } = {
  id: "all",
  nameAr: "الكل",
  nameEn: "All",
  iconName: "grid-view",
};

const CATEGORY_IMAGES: Record<string, string> = {
  all:          "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&q=80",
  restaurants:  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&q=80",
  burgers:      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&q=80",
  pizza:        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&q=80",
  shawarma:     "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=200&q=80",
  coffee:       "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&q=80",
  sweets:       "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=200&q=80",
  juice:        "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=200&q=80",
  seafood:      "https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=200&q=80",
  grocery:      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=80",
  pharmacy:     "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&q=80",
};

function parseDeliveryTime(deliveryTime: string): number {
  const nums = deliveryTime.match(/\d+/g);
  if (!nums || nums.length === 0) return 999;
  return Math.max(...nums.map(Number));
}

async function fetchRestaurants(lat?: number, lon?: number, categoryId?: string): Promise<RestaurantItem[]> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (lat != null && lon != null) {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }
  if (categoryId && categoryId !== "all") {
    params.set("categoryId", categoryId);
  }
  const url = `${base}/api/restaurants${params.toString() ? "?" + params.toString() : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

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

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [openOnly, setOpenOnly] = useState(false);
  const activeBannerRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const { defaultAddress } = useAddresses();
  const { unreadCount } = useNotifications();
  const { activeOrder } = useOrders();
  const { user: _user } = useAuth();

  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      } catch {
      }
    })();
  }, []);

  const { data: allRestaurantsData = [], isLoading, refetch } = useQuery<RestaurantItem[]>({
    queryKey: ["restaurants", userLocation?.lat, userLocation?.lon],
    queryFn: () => fetchRestaurants(userLocation?.lat, userLocation?.lon),
    staleTime: 2 * 60 * 1000,
  });

  const { data: categoryRestaurantsData = [], isLoading: isCategoryLoading } = useQuery<RestaurantItem[]>({
    queryKey: ["restaurants-by-category", selectedCategory, userLocation?.lat, userLocation?.lon],
    queryFn: () => fetchRestaurants(userLocation?.lat, userLocation?.lon, selectedCategory),
    staleTime: 2 * 60 * 1000,
    enabled: selectedCategory !== "all",
  });

  type OrderRow = { restaurantId: string | null; status: string };
  type OrdersResponse = { orders: OrderRow[] };

  const { data: userOrders = [] } = useQuery<OrderRow[]>({
    queryKey: ["userOrdersForHome", _user?.id],
    queryFn: async () => {
      if (!_user?.id) return [];
      const data = await customFetch<OrdersResponse>("/api/orders?limit=50");
      return data?.orders ?? [];
    },
    enabled: !!_user?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: apiBanners = FALLBACK_BANNERS } = useQuery({
    queryKey: ["banners"],
    queryFn: fetchBanners,
    staleTime: 5 * 60 * 1000,
    placeholderData: FALLBACK_BANNERS,
  });

  const { data: apiCategories = FALLBACK_CATEGORIES } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
    placeholderData: FALLBACK_CATEGORIES,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const mainScrollRef = useRef<ScrollView>(null);
  const popularSectionY = useRef<number>(0);
  const dealsSectionY = useRef<number>(0);
  const fastSectionY = useRef<number>(0);

  const bannerScrollRef = useRef<ScrollView>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startBannerTimer = useCallback(() => {
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    if (apiBanners.length <= 1) return;
    bannerTimerRef.current = setInterval(() => {
      const next = (activeBannerRef.current + 1) % apiBanners.length;
      activeBannerRef.current = next;
      bannerScrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    }, 4000);
  }, [apiBanners.length]);

  useEffect(() => {
    startBannerTimer();
    return () => { if (bannerTimerRef.current) clearInterval(bannerTimerRef.current); };
  }, [startBannerTimer]);

  const handleBannerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    activeBannerRef.current = Math.max(0, Math.min(idx, apiBanners.length - 1));
    startBannerTimer();
  };

  const orderAgainRestaurants = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const order of userOrders) {
      if (
        order.restaurantId &&
        order.status === "delivered" &&
        !seen.has(order.restaurantId)
      ) {
        seen.add(order.restaurantId);
        ids.push(order.restaurantId);
        if (ids.length >= 4) break;
      }
    }
    return ids
      .map((id) => allRestaurantsData.find((r) => r.id === id))
      .filter((r): r is RestaurantItem => r !== undefined);
  }, [userOrders, allRestaurantsData]);

  const popularRestaurants = useMemo(
    () => [...allRestaurantsData].sort((a, b) => b.rating - a.rating).slice(0, 6),
    [allRestaurantsData]
  );

  const dealRestaurants = useMemo(
    () => allRestaurantsData.filter((r) => r.discount !== null && r.discount !== ""),
    [allRestaurantsData]
  );

  const fastRestaurants = useMemo(
    () => allRestaurantsData.filter((r) => parseDeliveryTime(r.deliveryTime) <= 30),
    [allRestaurantsData]
  );

  const hasPopularSection = isLoading || popularRestaurants.length > 0;
  const hasDealsSection = isLoading || dealRestaurants.length > 0;
  const hasFastSection = isLoading || fastRestaurants.length > 0;

  useEffect(() => { if (!hasPopularSection) popularSectionY.current = 0; }, [hasPopularSection]);
  useEffect(() => { if (!hasDealsSection) dealsSectionY.current = 0; }, [hasDealsSection]);
  useEffect(() => { if (!hasFastSection) fastSectionY.current = 0; }, [hasFastSection]);

  const isCategoryFiltered = selectedCategory !== "all";

  const filteredRestaurants = useMemo(() => {
    // When a specific category is selected, use server-returned order (admin-defined per category)
    let list = isCategoryFiltered ? [...categoryRestaurantsData] : [...allRestaurantsData];
    if (openOnly) list = list.filter((r) => r.isOpen);
    // Only re-sort if user explicitly picked a sort option (preserve server order otherwise)
    if (sortBy === "rating") list.sort((a, b) => b.rating - a.rating);
    else if (sortBy === "time") list.sort((a, b) => parseDeliveryTime(a.deliveryTime) - parseDeliveryTime(b.deliveryTime));
    else if (sortBy === "fee") list.sort((a, b) => a.deliveryFee - b.deliveryFee);
    return list;
  }, [allRestaurantsData, categoryRestaurantsData, openOnly, selectedCategory, sortBy, isCategoryFiltered]);

  const displayCategories = useMemo(
    () => [ALL_CATEGORY, ...apiCategories],
    [apiCategories]
  );

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


  const filterOptions: { key: SortBy; label: string }[] = [
    { key: "rating", label: t("home.filterRating") },
    { key: "time", label: t("home.filterTime") },
    { key: "fee", label: t("home.filterFee") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#DC2626"]}
            tintColor="#DC2626"
          />
        }
      >
        {/* ===== Colored Header ===== */}
        <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.locationRow} onPress={() => router.push("/addresses")}>
              <MaterialIcons name="location-on" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.locationText} numberOfLines={1}>
                {defaultAddress ? defaultAddress.label : t("home.addAddress")}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.notifWrap}>
              <MaterialIcons name="notifications-none" size={24} color="#fff" />
              {unreadCount > 0 && (
                <View style={[styles.notifBadge, { backgroundColor: "#fff" }]}>
                  <Text style={[styles.notifBadgeText, { color: colors.primary }]}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* White search bar */}
          <TouchableOpacity
            style={[styles.searchBar, { backgroundColor: "#fff" }]}
            onPress={() => router.push("/search")}
            activeOpacity={0.9}
          >
            <MaterialIcons name="search" size={20} color={colors.mutedForeground} />
            <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
              {t("home.searchPlaceholder")}
            </Text>
            <MaterialIcons name="tune" size={17} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ===== Full-width Banner Carousel ===== */}
        {apiBanners.length > 0 && (
          <ScrollView
            ref={bannerScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={handleBannerScroll}
            scrollEventThrottle={16}
          >
            {apiBanners.map((banner) => (
              <TouchableOpacity
                key={banner.id}
                activeOpacity={banner.restaurantId ? 0.88 : 1}
                onPress={() => {
                  if (banner.restaurantId) router.push(`/restaurant/${banner.restaurantId}` as any);
                }}
                style={styles.bannerSlide}
              >
                {banner.image ? (
                  <Image
                    source={{ uri: buildImageUrl(banner.image) }}
                    style={styles.bannerImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.bannerImage,
                      { backgroundColor: banner.bgColor || colors.primary, alignItems: "center", justifyContent: "center" },
                    ]}
                  >
                    <MaterialIcons
                      name={(banner.iconName as keyof typeof MaterialIcons.glyphMap) ?? "local-offer"}
                      size={64}
                      color="#fff"
                    />
                  </View>
                )}
                {!!(banner.titleAr || banner.titleEn) && (
                  <View style={styles.bannerOverlay} pointerEvents="none">
                    <Text style={[styles.bannerTitle, { textAlign: isAr ? "right" : "left" }]} numberOfLines={2}>
                      {isAr ? (banner.titleAr || banner.titleEn) : (banner.titleEn || banner.titleAr)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ===== Visual Category Tiles ===== */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
          style={styles.categoriesContainer}
        >
          {displayCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryTile}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.categoryTileIcon,
                    { borderColor: isSelected ? colors.primary : "transparent" },
                  ]}
                >
                  <Image
                    source={{ uri: (cat as any).imageUrl || CATEGORY_IMAGES[cat.code ?? cat.id] || CATEGORY_IMAGES.all }}
                    style={styles.categoryTileImg}
                  />
                </View>
                <Text
                  style={[
                    styles.categoryTileLabel,
                    { color: isSelected ? colors.primary : colors.mutedForeground, fontWeight: isSelected ? "700" : "600" },
                  ]}
                  numberOfLines={1}
                >
                  {isAr ? cat.nameAr : cat.nameEn}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ===== Order Again Section ===== */}
        {!isLoading && orderAgainRestaurants.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.orderAgain")}</Text>
              <MaterialIcons name="replay" size={16} color={colors.primary} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
            >
              {orderAgainRestaurants.map((r) => (
                <HorizontalRestaurantCard
                  key={r.id}
                  restaurant={r}
                  onPress={() => router.push(`/restaurant/${r.id}` as any)}
                  badge={t("home.orderAgainBadge")}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ===== Active Order Banner ===== */}
        {activeOrder && (
          <TouchableOpacity
            style={[styles.orderBanner, { backgroundColor: colors.secondary }]}
            onPress={() =>
              router.push({ pathname: "/order-tracking/[id]", params: { id: activeOrder.id } })
            }
          >
            <View style={[styles.orderDot, { backgroundColor: colors.primary }]} />
            <View style={styles.orderInfo}>
              <Text style={[styles.orderStatus, { color: colors.primary }]}>{getOrderStatusText()}</Text>
              <Text style={[styles.orderRestaurant, { color: colors.mutedForeground }]} numberOfLines={1}>
                {activeOrder.restaurantName}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* ===== Popular Section ===== */}
        {!isCategoryFiltered && (isLoading || popularRestaurants.length > 0) && (
          <View
            style={styles.sectionWrap}
            onLayout={(e) => { popularSectionY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.popular")}</Text>
              <MaterialIcons name="star" size={16} color="#FFB800" />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
            >
              {isLoading
                ? [0, 1, 2, 3].map((i) => <HorizontalRestaurantCardSkeleton key={i} />)
                : popularRestaurants.map((r) => (
                    <HorizontalRestaurantCard
                      key={r.id}
                      restaurant={r}
                      onPress={() => router.push(`/restaurant/${r.id}` as any)}
                    />
                  ))}
            </ScrollView>
          </View>
        )}

        {/* ===== Exclusive Deals Section ===== */}
        {!isCategoryFiltered && (isLoading || dealRestaurants.length > 0) && (
          <View
            style={styles.sectionWrap}
            onLayout={(e) => { dealsSectionY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.exclusiveDeals")}</Text>
              <MaterialIcons name="local-offer" size={16} color={colors.primary} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
            >
              {isLoading
                ? [0, 1, 2, 3].map((i) => <HorizontalRestaurantCardSkeleton key={i} />)
                : dealRestaurants.map((r) => (
                    <HorizontalRestaurantCard
                      key={r.id}
                      restaurant={r}
                      onPress={() => router.push(`/restaurant/${r.id}` as any)}
                      variant="deal"
                    />
                  ))}
            </ScrollView>
          </View>
        )}

        {/* ===== Fast Delivery Section ===== */}
        {!isCategoryFiltered && (isLoading || fastRestaurants.length > 0) && (
          <View
            style={styles.sectionWrap}
            onLayout={(e) => { fastSectionY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("home.expressDelivery")}</Text>
              <MaterialIcons name="delivery-dining" size={16} color={colors.primary} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
            >
              {isLoading
                ? [0, 1, 2, 3].map((i) => <HorizontalRestaurantCardSkeleton key={i} />)
                : fastRestaurants.map((r) => (
                    <HorizontalRestaurantCard
                      key={r.id}
                      restaurant={r}
                      onPress={() => router.push(`/restaurant/${r.id}` as any)}
                    />
                  ))}
            </ScrollView>
          </View>
        )}

        {/* ===== Filter Bar ===== */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          style={styles.filterContainer}
        >
          {filterOptions.map((opt) => {
            const isActive = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? colors.primary : colors.card,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSortBy(isActive ? "default" : opt.key)}
              >
                <Text style={[styles.filterChipText, { color: isActive ? "#fff" : colors.foreground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: openOnly ? colors.primary : colors.card,
                borderColor: openOnly ? colors.primary : colors.border,
                flexDirection: "row",
                gap: 4,
              },
            ]}
            onPress={() => setOpenOnly((p) => !p)}
          >
            <MaterialIcons name="store" size={13} color={openOnly ? "#fff" : colors.foreground} />
            <Text style={[styles.filterChipText, { color: openOnly ? "#fff" : colors.foreground }]}>
              {t("home.openOnly")}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ===== Explore All Section ===== */}
        <View style={styles.exploreSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t("home.exploreAll")}
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {" "}({filteredRestaurants.length})
              </Text>
            </Text>
            <TouchableOpacity onPress={() => router.push("/search")}>
              <MaterialIcons name="search" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {(isLoading || (isCategoryFiltered && isCategoryLoading)) ? (
            [0, 1, 2].map((i) => <RestaurantCardSkeleton key={i} />)
          ) : filteredRestaurants.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialIcons name="search-off" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("home.noResults")}</Text>
            </View>
          ) : (
            filteredRestaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant as any}
                onPress={() => router.push(`/restaurant/${restaurant.id}` as any)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, marginRight: 12 },
  locationText: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  notifWrap: { position: "relative" },
  notifBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, fontWeight: "800" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchPlaceholder: { flex: 1, fontSize: 14 },

  // Banner
  bannerSlide: { width: SCREEN_WIDTH, height: 180 },
  bannerImage: { width: SCREEN_WIDTH, height: 180 },
  bannerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  bannerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Category tiles
  categoriesContainer: { marginTop: 16, marginBottom: 2 },
  categoriesScroll: { paddingHorizontal: 16, gap: 10, paddingVertical: 4 },
  categoryTile: { alignItems: "center", gap: 6, width: 70 },
  categoryTileIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 2.5,
  },
  categoryTileImg: {
    width: "100%",
    height: "100%",
  },
  categoryTileLabel: { fontSize: 11, fontWeight: "600", textAlign: "center" },

  // Active order banner
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  orderDot: { width: 10, height: 10, borderRadius: 5 },
  orderInfo: { flex: 1 },
  orderStatus: { fontSize: 14, fontWeight: "700" },
  orderRestaurant: { fontSize: 12, marginTop: 2 },

  // Section
  sectionWrap: { marginTop: 22, marginBottom: 4 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  count: { fontSize: 14, fontWeight: "400" },
  hListContent: { paddingHorizontal: 16, gap: 12 },

  // Filter
  filterContainer: { marginTop: 22, marginBottom: 4 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: "600" },

  // Explore section
  exploreSection: { marginTop: 18, paddingHorizontal: 16 },
  loadingWrap: { alignItems: "center", paddingVertical: 40 },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15 },
});
