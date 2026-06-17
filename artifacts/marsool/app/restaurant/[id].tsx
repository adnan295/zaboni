import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import MenuItemCard from "@/components/MenuItemCard";
import { useFavorites } from "@/context/FavoritesContext";
import { useAddresses } from "@/context/AddressContext";
import { useGetRestaurant, useGetRestaurantMenu } from "@workspace/api-client-react";
import { haversineDistance } from "@/utils/geo";
import { buildImageUrl } from "@/lib/apiConfig";

const POPULAR_KEY = "__popular__";
const CAT_TAB_HEIGHT = 48;

interface CartEntry {
  nameAr: string;
  price: number;
  qty: number;
}

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { defaultAddress } = useAddresses();

  const { data: restaurant, isLoading: restaurantLoading } = useGetRestaurant(id ?? "");

  const restaurantWithCoords = restaurant as (typeof restaurant & { lat?: number | null; lon?: number | null }) | undefined;
  const distanceKm: string | null = (() => {
    if (!restaurantWithCoords?.lat || !restaurantWithCoords?.lon) return null;
    if (!defaultAddress?.latitude || !defaultAddress?.longitude) return null;
    const dist = haversineDistance(
      { latitude: defaultAddress.latitude, longitude: defaultAddress.longitude },
      { latitude: restaurantWithCoords.lat, longitude: restaurantWithCoords.lon }
    );
    return dist < 1 ? `${Math.round(dist * 1000)} م` : `${dist.toFixed(1)} كم`;
  })();

  const { data: menuItemsData } = useGetRestaurantMenu(id ?? "");
  const menuItems = menuItemsData ?? [];
  const categories = Array.from(new Set(menuItems.map((m) => m.categoryAr)));
  const popularItems = menuItems.filter((m) => m.isPopular).slice(0, 4);
  const hasPopular = popularItems.length > 0;

  const allTabs: string[] = [...(hasPopular ? [POPULAR_KEY] : []), ...categories];

  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(allTabs[0] ?? null);

  const scrollRef = useRef<ScrollView>(null);
  const catTabScrollRef = useRef<ScrollView>(null);
  const sectionYRef = useRef<Record<string, number>>({});
  const isProgrammaticScroll = useRef(false);
  const activeCategoryRef = useRef<string | null>(allTabs[0] ?? null);
  const allTabsRef = useRef<string[]>(allTabs);
  allTabsRef.current = allTabs;

  const addToCart = (itemId: string, nameAr: string, price: number) => {
    setCart((prev) => ({
      ...prev,
      [itemId]: { nameAr, price, qty: (prev[itemId]?.qty ?? 0) + 1 },
    }));
  };

  const removeFromCart = (itemId: string, nameAr: string, price: number) => {
    setCart((prev) => {
      const current = prev[itemId]?.qty ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { nameAr, price, qty: current - 1 } };
    });
  };

  const cartEntries = Object.values(cart);
  const totalItems = cartEntries.reduce((s, e) => s + e.qty, 0);
  const estimatedTotal = cartEntries.reduce((s, e) => s + (e.price || 0) * e.qty, 0);
  const hasCart = totalItems > 0;

  const buildCartText = (): string => {
    const prefix = restaurant ? `${t("orderRequest.from")} ${restaurant.nameAr}: ` : "";
    const items = cartEntries.map((e) => (e.qty > 1 ? `${e.nameAr} × ${e.qty}` : e.nameAr)).join("، ");
    return prefix + items;
  };

  const favScale = React.useRef(new Animated.Value(1)).current;
  const fav = restaurant ? isFavorite(restaurant.id) : false;

  const handleFav = () => {
    if (!restaurant) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(favScale, { toValue: 1.4, useNativeDriver: true, speed: 40 }),
      Animated.spring(favScale, { toValue: 1, useNativeDriver: true, speed: 40 }),
    ]).start();
    toggleFavorite(restaurant);
  };

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammaticScroll.current) return;
    const y = event.nativeEvent.contentOffset.y;
    let currentCat: string | null = null;
    for (const cat of allTabsRef.current) {
      const secY = sectionYRef.current[cat];
      if (secY != null && y >= secY - CAT_TAB_HEIGHT - 16) {
        currentCat = cat;
      }
    }
    if (currentCat !== activeCategoryRef.current) {
      activeCategoryRef.current = currentCat;
      setActiveCategory(currentCat);
    }
  }, []);

  const scrollToCategory = (cat: string) => {
    const y = sectionYRef.current[cat];
    if (y == null) return;
    isProgrammaticScroll.current = true;
    activeCategoryRef.current = cat;
    setActiveCategory(cat);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - CAT_TAB_HEIGHT), animated: true });
    setTimeout(() => { isProgrammaticScroll.current = false; }, 800);
  };

  const registerSection = (cat: string) => (e: LayoutChangeEvent) => {
    sectionYRef.current[cat] = e.nativeEvent.layout.y;
  };

  const handleOrder = () => {
    if (!restaurant || !restaurant.isOpen) return;
    if (!defaultAddress) {
      Alert.alert(
        t("orderRequest.noAddressTitle"),
        t("orderRequest.noAddressBody"),
        [
          { text: t("orderRequest.addAddress"), onPress: () => router.push("/addresses"), style: "default" },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params: Record<string, string> = { restaurantName: restaurant.nameAr, restaurantId: restaurant.id };
    if (hasCart) {
      params.reorderText = buildCartText();
      params.estimatedTotal = String(estimatedTotal);
    }
    router.push({ pathname: "/order-request", params });
  };

  if (restaurantLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.foreground }}>{t("restaurant.notFound")}</Text>
      </View>
    );
  }

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const isOpen = restaurant.isOpen;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/*
        stickyHeaderIndices: child at index 2 becomes sticky.
        Order: 0=hero, 1=infoCard, 2=catTabs(STICKY), 3+=sections
      */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={allTabs.length > 0 ? [2] : undefined}
      >
        {/* [0] Hero */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: buildImageUrl(restaurant.image) }} style={styles.heroImage} resizeMode="cover" />
          <View style={[styles.heroOverlay, { paddingTop: topPadding + 8 }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: "rgba(255,255,255,0.9)" }]}
              onPress={() => router.back()}
            >
              <MaterialIcons name={backIcon} size={22} color="#1a1a1a" />
            </TouchableOpacity>
            <View style={styles.heroRight}>
              {restaurant.discount && (
                <View style={[styles.heroBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.heroBadgeText}>{restaurant.discount}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.favHeroBtn, { backgroundColor: "rgba(255,255,255,0.9)" }]}
                onPress={handleFav}
                activeOpacity={0.8}
              >
                <Animated.View style={{ transform: [{ scale: favScale }] }}>
                  <MaterialIcons
                    name={fav ? "favorite" : "favorite-border"}
                    size={22}
                    color={fav ? "#ef4444" : "#888"}
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* [1] Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={styles.infoTop}>
            <View style={styles.infoMain}>
              <Text style={[styles.restaurantName, { color: colors.foreground }]}>{restaurant.nameAr}</Text>
              <Text style={[styles.tags, { color: colors.mutedForeground }]}>
                {(restaurant.tags as string[]).join(" · ")}
              </Text>
            </View>
            <View style={[styles.ratingChip, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="star" size={14} color="#FFB800" />
              <Text style={[styles.ratingNum, { color: colors.foreground }]}>{restaurant.rating}</Text>
              <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>
                ({restaurant.reviewCount.toLocaleString()})
              </Text>
            </View>
          </View>
          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              <MaterialIcons name="access-time" size={16} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("restaurant.deliveryTime")}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{restaurant.deliveryTime} {t("restaurant.minutes")}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <MaterialIcons name="location-on" size={16} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("restaurant.distance")}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{distanceKm ?? t("restaurant.nearby")}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <MaterialIcons name="star" size={16} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("restaurant.rating")}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{restaurant.rating}</Text>
            </View>
          </View>
        </View>

        {/* [2] Sticky category tabs */}
        <View style={[styles.catTabsWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView
            ref={catTabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catScroll}
          >
            {allTabs.map((cat) => {
              const isActive = activeCategory === cat;
              const label = cat === POPULAR_KEY ? "🔥 الأكثر طلباً" : cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catTab,
                    { borderBottomColor: isActive ? colors.primary : "transparent" },
                  ]}
                  onPress={() => scrollToCategory(cat)}
                >
                  <Text
                    style={[
                      styles.catTabText,
                      {
                        color: isActive ? colors.primary : colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* [3] Popular section */}
        {hasPopular && (
          <View onLayout={registerSection(POPULAR_KEY)} style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🔥 الأكثر طلباً</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>الأكثر طلباً الآن</Text>
            <View style={styles.popularGrid}>
              {popularItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.popularCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: cart[item.id]?.qty ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={isOpen ? () => addToCart(item.id, item.nameAr, item.price) : undefined}
                  activeOpacity={isOpen ? 0.85 : 1}
                >
                  <Image source={{ uri: buildImageUrl(item.image) }} style={styles.popularImage} resizeMode="cover" />
                  {cart[item.id]?.qty ? (
                    <View style={[styles.popularQtyBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.popularQtyText}>{cart[item.id]!.qty}</Text>
                    </View>
                  ) : isOpen ? (
                    <View style={[styles.popularAddBtn, { backgroundColor: colors.primary }]}>
                      <MaterialIcons name="add" size={16} color="#fff" />
                    </View>
                  ) : null}
                  <View style={styles.popularCardBody}>
                    <Text style={[styles.popularItemName, { color: colors.foreground }]} numberOfLines={2}>
                      {item.nameAr}
                    </Text>
                    {item.price > 0 && (
                      <Text style={[styles.popularItemPrice, { color: colors.primary }]}>
                        {item.price.toLocaleString()} ل.س
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* [4+] One section per category */}
        {categories.map((cat) => {
          const catItems = menuItems.filter((m) => m.categoryAr === cat);
          return (
            <View key={cat} onLayout={registerSection(cat)} style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat}</Text>
              {catItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantity={cart[item.id]?.qty ?? 0}
                  onAdd={isOpen ? () => addToCart(item.id, item.nameAr, item.price) : undefined}
                  onRemove={isOpen ? () => removeFromCart(item.id, item.nameAr, item.price) : undefined}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* Order footer */}
      <View
        style={[
          styles.orderFooter,
          { backgroundColor: colors.background, paddingBottom: bottomPadding + 12, borderTopColor: colors.border },
        ]}
      >
        {!isOpen && (
          <View style={[styles.closedBanner, { backgroundColor: "rgba(0,0,0,0.08)" }]}>
            <MaterialIcons name="access-time" size={16} color={colors.mutedForeground} />
            <Text style={[styles.closedBannerText, { color: colors.mutedForeground }]}>
              {t("restaurant.closed")}
            </Text>
          </View>
        )}
        {hasCart && isOpen && (
          <View style={[styles.cartSummary, { backgroundColor: colors.secondary }]}>
            <View style={styles.cartSummaryLeft}>
              <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
              <Text style={[styles.cartSummaryLabel, { color: colors.foreground }]}>
                {t("restaurant.itemsSelected", { count: totalItems })}
              </Text>
            </View>
            <Text style={[styles.cartTotal, { color: colors.primary }]}>
              ~{estimatedTotal.toLocaleString()} ل.س
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: isOpen ? colors.primary : colors.muted }]}
          onPress={handleOrder}
          activeOpacity={isOpen ? 0.85 : 1}
          disabled={!isOpen}
        >
          <MaterialIcons
            name={hasCart ? "shopping-bag" : "edit-note"}
            size={22}
            color={isOpen ? "#fff" : colors.mutedForeground}
          />
          <Text style={[styles.orderBtnText, { color: isOpen ? "#fff" : colors.mutedForeground }]}>
            {!isOpen
              ? t("restaurant.closed")
              : hasCart
              ? t("restaurant.reviewOrder")
              : t("restaurant.orderNow")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroContainer: { position: "relative" },
  heroImage: { width: "100%", height: 220 },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  heroRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  favHeroBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  heroBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  heroBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  infoCard: {
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  infoMain: { flex: 1, gap: 4 },
  restaurantName: { fontSize: 20, fontWeight: "800" },
  tags: { fontSize: 13 },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  ratingNum: { fontSize: 14, fontWeight: "700" },
  ratingCount: { fontSize: 11 },
  statsRow: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { width: 1, height: "100%" },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 13, fontWeight: "700" },
  catTabsWrap: {
    height: CAT_TAB_HEIGHT,
    borderBottomWidth: 1,
    justifyContent: "center",
  },
  catScroll: { paddingHorizontal: 12, alignItems: "center", gap: 0 },
  catTab: {
    paddingHorizontal: 16,
    height: CAT_TAB_HEIGHT,
    justifyContent: "center",
    borderBottomWidth: 2.5,
  },
  catTabText: { fontSize: 13 },
  sectionWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    direction: "rtl",
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, marginBottom: 12 },
  popularGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  popularCard: {
    width: "47%",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
  },
  popularImage: { width: "100%", height: 130 },
  popularAddBtn: {
    position: "absolute",
    bottom: 68,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  popularQtyBadge: {
    position: "absolute",
    bottom: 68,
    left: 8,
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  popularQtyText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  popularCardBody: { padding: 10, gap: 4 },
  popularItemName: { fontSize: 13, fontWeight: "700" },
  popularItemPrice: { fontSize: 13, fontWeight: "800" },
  orderFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  cartSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cartSummaryLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cartSummaryLabel: { fontSize: 13, fontWeight: "600" },
  cartTotal: { fontSize: 15, fontWeight: "800" },
  orderBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  orderBtnText: { fontSize: 17, fontWeight: "700" },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closedBannerText: { fontSize: 14, fontWeight: "700" },
});
