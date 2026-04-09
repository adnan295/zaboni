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
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import RestaurantCard from "@/components/RestaurantCard";
import { CATEGORIES } from "@/data/restaurants";
import { useAddresses } from "@/context/AddressContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { useGetRestaurants } from "@workspace/api-client-react";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_WIDTH = SCREEN_WIDTH - 32;

interface PromoBanner {
  id: string;
  title: string;
  subtitle: string;
  bg: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const PROMO_BANNERS: PromoBanner[] = [
  {
    id: "1",
    title: "توصيل سريع لباب بيتك",
    subtitle: "أطلب الآن وتابع المندوب مباشرة على الخريطة",
    bg: "#FF6B00",
    icon: "delivery-dining",
  },
  {
    id: "2",
    title: "أفضل المطاعم في دمشق",
    subtitle: "اكتشف قائمة متنوعة من البرغر، البيتزا، المشاوي وأكثر",
    bg: "#1e40af",
    icon: "restaurant",
  },
  {
    id: "3",
    title: "ادفع عند الاستلام",
    subtitle: "لا حاجة لبطاقة بنكية — ادفع نقداً عند وصول طلبك",
    bg: "#065f46",
    icon: "payments",
  },
];

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { defaultAddress } = useAddresses();
  const { unreadCount } = useNotifications();
  const { activeOrder } = useOrders();
  const { user } = useAuth();

  const { data: apiRestaurants, isLoading: restaurantsLoading, refetch } = useGetRestaurants();
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
    setActiveBanner(Math.max(0, Math.min(idx, PROMO_BANNERS.length - 1)));
  };

  const allRestaurants = apiRestaurants ?? [];
  const filtered = allRestaurants.filter((r) => {
    return selectedCategory === "all" || r.category === selectedCategory;
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const getOrderStatusText = () => {
    if (!activeOrder) return "";
    if (activeOrder.status === "searching") return t("home.order.searching");
    if (activeOrder.status === "accepted") return `${activeOrder.courierName} ${t("home.order.accepted")}`;
    if (activeOrder.status === "on_way") return t("home.order.onWay");
    return t("home.order.delivered");
  };

  const firstName = user?.name ? user.name.split(" ")[0] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FF6B00"]}
            tintColor="#FF6B00"
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
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
              {"أهلاً، "}
              <Text style={{ color: colors.primary }}>{firstName}</Text>
              {" 👋"}
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
            {PROMO_BANNERS.map((banner) => (
              <View
                key={banner.id}
                style={[styles.bannerCard, { backgroundColor: banner.bg, width: BANNER_WIDTH }]}
              >
                <View style={styles.bannerContent}>
                  <View style={styles.bannerText}>
                    <Text style={styles.bannerTitle}>{banner.title}</Text>
                    <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                  </View>
                  <View style={[styles.bannerIconBg, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                    <MaterialIcons name={banner.icon} size={40} color="#fff" />
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dotsRow}>
            {PROMO_BANNERS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === activeBanner ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
          style={styles.categoriesContainer}
        >
          {CATEGORIES.map((cat) => (
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
                {cat.name}
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
                : CATEGORIES.find((c) => c.id === selectedCategory)?.name}
              <Text style={[styles.count, { color: colors.mutedForeground }]}> ({filtered.length})</Text>
            </Text>
            <TouchableOpacity onPress={() => router.push("/search")}>
              <MaterialIcons name="search" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {restaurantsLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color="#FF6B00" />
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
    padding: 20,
    overflow: "hidden",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerText: { flex: 1, gap: 6, paddingRight: 12 },
  bannerTitle: { fontSize: 16, fontWeight: "800", color: "#fff", lineHeight: 22 },
  bannerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 18 },
  bannerIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
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
