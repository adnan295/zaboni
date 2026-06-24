import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import MenuItemCard from "@/components/MenuItemCard";
import ItemNoteModal, { type OptionGroup } from "@/components/ItemNoteModal";
import type { SelectedOption } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAddresses } from "@/context/AddressContext";
import { useCart } from "@/context/CartContext";
import { useGetRestaurant, useGetRestaurantMenu, customFetch } from "@workspace/api-client-react";
import { haversineDistance } from "@/utils/geo";
import { buildImageUrl } from "@/lib/apiConfig";

type FlashDeal = {
  id: string;
  title: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  endsAt: string;
};

function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "انتهى العرض";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const POPULAR_KEY = "__popular__";
const DEALS_KEY = "__deals__";
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
  type MenuItemWithDeal = typeof menuItems[number] & { isDeal?: boolean; dealPrice?: number | null; dealDiscountPercent?: number | null; optionGroups?: OptionGroup[] };

  const getEffectivePrice = (item: MenuItemWithDeal): number => {
    const typed = item as MenuItemWithDeal;
    return typed.isDeal && typed.dealPrice ? typed.dealPrice : item.price;
  };

  const getDealPercent = (item: MenuItemWithDeal): number | null => {
    if (!item.isDeal) return null;
    if (item.dealDiscountPercent != null) return Math.round(item.dealDiscountPercent);
    if (item.dealPrice != null && item.price > 0) return Math.round((1 - item.dealPrice / item.price) * 100);
    return null;
  };

  const dealItems = menuItems.filter((m) => (m as MenuItemWithDeal).isDeal);
  const hasDeals = dealItems.length > 0;
  const popularItems = menuItems.filter((m) => m.isPopular).slice(0, 4);
  const hasPopular = popularItems.length > 0;

  const allTabs: string[] = [
    ...(hasDeals ? [DEALS_KEY] : []),
    ...(hasPopular ? [POPULAR_KEY] : []),
    ...categories,
  ];

  const cartCtx = useCart();
  const cart: Record<string, CartEntry> =
    restaurant && cartCtx.restaurantId === restaurant.id
      ? (cartCtx.items as Record<string, CartEntry>)
      : {};
  const [activeCategory, setActiveCategory] = useState<string | null>(allTabs[0] ?? null);
  const [flashDeal, setFlashDeal] = useState<FlashDeal | null>(null);
  const [flashCountdown, setFlashCountdown] = useState<string>("");
  const [noteModalData, setNoteModalData] = useState<{
    item: MenuItemWithDeal;
    effectivePrice: number;
    originalPrice?: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    customFetch(`/api/restaurants/${id}/flash-deal`)
      .then((data) => {
        const deal = data as FlashDeal | null;
        setFlashDeal(deal);
        if (deal) setFlashCountdown(formatCountdown(deal.endsAt));
      })
      .catch(() => setFlashDeal(null));
  }, [id]);

  useEffect(() => {
    if (!flashDeal) return;
    const timer = setInterval(() => {
      setFlashCountdown(formatCountdown(flashDeal.endsAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [flashDeal]);

  const scrollRef = useRef<ScrollView>(null);
  const catTabScrollRef = useRef<ScrollView>(null);
  const sectionYRef = useRef<Record<string, number>>({});
  const isProgrammaticScroll = useRef(false);
  const activeCategoryRef = useRef<string | null>(allTabs[0] ?? null);
  const allTabsRef = useRef<string[]>(allTabs);
  allTabsRef.current = allTabs;

  const addToCart = (itemId: string, nameAr: string, price: number, originalPrice?: number) => {
    if (!restaurant) return;
    cartCtx.addItem(restaurant.id, restaurant.nameAr, { menuItemId: itemId, nameAr, price, originalPrice });
  };

  const openNoteModal = (item: MenuItemWithDeal, effectivePrice: number, originalPrice?: number) => {
    if (!restaurant) return;
    if (
      cartCtx.restaurantId &&
      cartCtx.restaurantId !== restaurant.id &&
      cartCtx.totalItems > 0
    ) {
      Alert.alert(
        t("cart.switchTitle"),
        t("cart.switchBody", { restaurant: cartCtx.restaurantName ?? "" }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("cart.switchConfirm"),
            style: "destructive",
            onPress: () => {
              cartCtx.replaceCart(restaurant.id, restaurant.nameAr, []);
              setNoteModalData({ item, effectivePrice, originalPrice });
            },
          },
        ]
      );
      return;
    }
    setNoteModalData({ item, effectivePrice, originalPrice });
  };

  const handleModalAdd = (note: string, qty: number, selectedOptions: SelectedOption[]) => {
    if (!restaurant || !noteModalData) return;
    const { item, effectivePrice, originalPrice } = noteModalData;
    const optionsExtra = selectedOptions.reduce((sum, o) => sum + o.extraPrice, 0);
    cartCtx.addItem(restaurant.id, restaurant.nameAr, {
      menuItemId: item.id,
      nameAr: item.nameAr,
      price: effectivePrice + optionsExtra,
      originalPrice,
      note: note || undefined,
      selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
    });
    for (let i = 1; i < qty; i++) {
      cartCtx.incItem(item.id);
    }
    setNoteModalData(null);
  };

  const removeFromCart = (itemId: string, _nameAr?: string, _price?: number) => {
    cartCtx.decItem(itemId);
  };

  const renderCartControl = (
    itemId: string,
    nameAr: string,
    price: number,
    accentColor: string,
    canAdd: boolean,
  ) => {
    const qty = cart[itemId]?.qty ?? 0;
    if (qty > 0) {
      return (
        <View style={[styles.popularStepper, { backgroundColor: accentColor }]}>
          <TouchableOpacity
            style={styles.popularStepperBtn}
            onPress={canAdd ? () => removeFromCart(itemId, nameAr, price) : undefined}
            disabled={!canAdd}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="remove" size={16} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.popularStepperQty}>{qty}</Text>
          <TouchableOpacity
            style={styles.popularStepperBtn}
            onPress={canAdd ? () => addToCart(itemId, nameAr, price) : undefined}
            disabled={!canAdd}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }
    if (canAdd) {
      return (
        <View style={[styles.popularAddBtn, { backgroundColor: accentColor }]}>
          <MaterialIcons name="add" size={16} color="#fff" />
        </View>
      );
    }
    return null;
  };

  const cartEntries = Object.values(cart);
  const totalItems = cartEntries.reduce((s, e) => s + e.qty, 0);
  const estimatedTotal = cartEntries.reduce((s, e) => s + (e.price || 0) * e.qty, 0);
  const hasCart = totalItems > 0;

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
    if (!hasCart) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/order-request",
      params: { restaurantName: restaurant.nameAr, restaurantId: restaurant.id },
    });
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
        stickyHeaderIndices={allTabs.length > 0 ? [flashDeal ? 3 : 2] : undefined}
      >
        {/* [0] Hero */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: buildImageUrl(restaurant.image) }} style={styles.heroImage} contentFit="cover" />
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

        {/* [2] Flash deal banner (conditional) */}
        {flashDeal ? (
          <View style={styles.flashBanner}>
            <View style={styles.flashBannerLeft}>
              <Text style={styles.flashBannerTitle}>⚡ {flashDeal.title}</Text>
              <Text style={styles.flashBannerDiscount}>
                خصم {flashDeal.discountType === "percent"
                  ? `${flashDeal.discountValue}%`
                  : `${flashDeal.discountValue.toLocaleString()} ل.س`}
                {" "}يُطبَّق تلقائياً
              </Text>
            </View>
            {flashCountdown ? (
              <View style={styles.flashBannerTimer}>
                <Text style={styles.flashBannerTimerLabel}>ينتهي خلال</Text>
                <Text style={styles.flashBannerTimerValue}>{flashCountdown}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* [3 or 2] Sticky category tabs */}
        <View style={[styles.catTabsWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView
            ref={catTabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catScroll}
          >
            {allTabs.map((cat) => {
              const isActive = activeCategory === cat;
              const label = cat === DEALS_KEY ? "العروض 🔥" : cat === POPULAR_KEY ? "🔥 الأكثر طلباً" : cat;
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

        {/* [3] Deals section */}
        {hasDeals && (
          <View onLayout={registerSection(DEALS_KEY)} style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>العروض 🔥</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>أصناف بأسعار مخفضة</Text>
            <View style={styles.popularGrid}>
              {dealItems.map((item) => {
                const itemAvailable = (item as MenuItemWithDeal).isAvailable !== false;
                const canAdd = isOpen && itemAvailable;
                const dealPrice = getEffectivePrice(item as MenuItemWithDeal);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.popularCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: cart[item.id]?.qty ? colors.primary : "#F97316",
                        opacity: itemAvailable ? 1 : 0.5,
                      },
                    ]}
                    onPress={canAdd && !cart[item.id]?.qty ? () => addToCart(item.id, item.nameAr, dealPrice, item.price !== dealPrice ? item.price : undefined) : undefined}
                    activeOpacity={canAdd && !cart[item.id]?.qty ? 0.85 : 1}
                  >
                    <Image source={{ uri: buildImageUrl(item.image) }} style={styles.popularImage} contentFit="cover" />
                    <View style={styles.dealBadge}>
                      {getDealPercent(item as MenuItemWithDeal) != null ? (
                        <Text style={styles.dealBadgeText}>خصم {getDealPercent(item as MenuItemWithDeal)}%</Text>
                      ) : (
                        <Text style={styles.dealBadgeText}>🔥 عرض</Text>
                      )}
                    </View>
                    {!itemAvailable ? (
                      <View style={styles.unavailableBadge}>
                        <Text style={styles.unavailableText}>غير متوفر</Text>
                      </View>
                    ) : (
                      renderCartControl(item.id, item.nameAr, dealPrice, "#F97316", canAdd)
                    )}
                    <View style={styles.popularCardBody}>
                      <Text style={[styles.popularItemName, { color: colors.foreground }]} numberOfLines={2}>
                        {item.nameAr}
                      </Text>
                      <View style={styles.dealPriceRow}>
                        <Text style={[styles.dealOriginalPrice, { color: colors.mutedForeground }]}>
                          {item.price.toLocaleString()} ل.س
                        </Text>
                        <Text style={styles.dealNewPrice}>
                          {dealPrice.toLocaleString()} ل.س
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* [4] Popular section */}
        {hasPopular && (
          <View onLayout={registerSection(POPULAR_KEY)} style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🔥 الأكثر طلباً</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>الأكثر طلباً الآن</Text>
            <View style={styles.popularGrid}>
              {popularItems.map((item) => {
                const itemAvailable = (item as MenuItemWithDeal).isAvailable !== false;
                const canAdd = isOpen && itemAvailable;
                const effectivePrice = getEffectivePrice(item as MenuItemWithDeal);
                const itemIsDeal = !!(item as MenuItemWithDeal).isDeal;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.popularCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: cart[item.id]?.qty ? colors.primary : itemIsDeal ? "#F97316" : colors.border,
                        opacity: itemAvailable ? 1 : 0.5,
                      },
                    ]}
                    onPress={canAdd && !cart[item.id]?.qty ? () => addToCart(item.id, item.nameAr, effectivePrice, itemIsDeal && effectivePrice !== item.price ? item.price : undefined) : undefined}
                    activeOpacity={canAdd && !cart[item.id]?.qty ? 0.85 : 1}
                  >
                    <Image source={{ uri: buildImageUrl(item.image) }} style={styles.popularImage} contentFit="cover" />
                    {itemIsDeal && (
                      <View style={styles.dealBadge}>
                        {getDealPercent(item as MenuItemWithDeal) != null ? (
                          <Text style={styles.dealBadgeText}>خصم {getDealPercent(item as MenuItemWithDeal)}%</Text>
                        ) : (
                          <Text style={styles.dealBadgeText}>🔥 عرض</Text>
                        )}
                      </View>
                    )}
                    {!itemAvailable ? (
                      <View style={styles.unavailableBadge}>
                        <Text style={styles.unavailableText}>غير متوفر</Text>
                      </View>
                    ) : (
                      renderCartControl(
                        item.id,
                        item.nameAr,
                        effectivePrice,
                        itemIsDeal ? "#F97316" : colors.primary,
                        canAdd,
                      )
                    )}
                    <View style={styles.popularCardBody}>
                      <Text style={[styles.popularItemName, { color: colors.foreground }]} numberOfLines={2}>
                        {item.nameAr}
                      </Text>
                      {itemIsDeal ? (
                        <View style={styles.dealPriceRow}>
                          <Text style={[styles.dealOriginalPrice, { color: colors.mutedForeground }]}>
                            {item.price.toLocaleString()} ل.س
                          </Text>
                          <Text style={styles.dealNewPrice}>
                            {effectivePrice.toLocaleString()} ل.س
                          </Text>
                        </View>
                      ) : item.price > 0 ? (
                        <Text style={[styles.popularItemPrice, { color: colors.primary }]}>
                          {item.price.toLocaleString()} ل.س
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* [4+] One section per category */}
        {categories.map((cat) => {
          const catItems = menuItems.filter((m) => m.categoryAr === cat);
          return (
            <View key={cat} onLayout={registerSection(cat)} style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat}</Text>
              {catItems.map((item) => {
                const typedItem = item as MenuItemWithDeal;
                const available = typedItem.isAvailable !== false;
                const effectivePrice = getEffectivePrice(typedItem);
                const itemIsDeal = !!typedItem.isDeal;
                const itemDealPrice = typedItem.isDeal && typedItem.dealPrice ? typedItem.dealPrice : undefined;
                return (
                  <View key={item.id} style={{ opacity: available ? 1 : 0.5 }}>
                    {!available && (
                      <View style={styles.unavailableBadge}>
                        <Text style={styles.unavailableText}>غير متوفر</Text>
                      </View>
                    )}
                    <MenuItemCard
                      item={item}
                      quantity={cart[item.id]?.qty ?? 0}
                      onAdd={isOpen && available ? () => {
                        const currentQty = cart[item.id]?.qty ?? 0;
                        if (currentQty === 0) {
                          openNoteModal(typedItem, effectivePrice, itemIsDeal && effectivePrice !== item.price ? item.price : undefined);
                        } else {
                          addToCart(item.id, item.nameAr, effectivePrice, itemIsDeal && effectivePrice !== item.price ? item.price : undefined);
                        }
                      } : undefined}
                      onRemove={isOpen && available ? () => removeFromCart(item.id, item.nameAr, effectivePrice) : undefined}
                      isDeal={itemIsDeal}
                      dealPrice={itemDealPrice}
                      dealDiscountPercent={typedItem.dealDiscountPercent ?? null}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <ItemNoteModal
        visible={noteModalData !== null}
        item={noteModalData?.item ?? null}
        isDeal={noteModalData?.item?.isDeal}
        effectivePrice={noteModalData?.effectivePrice}
        initialNote={(noteModalData?.item ? (cartCtx.items[noteModalData.item.id]?.note ?? "") : "")}
        initialSelectedOptions={noteModalData?.item ? cartCtx.items[noteModalData.item.id]?.selectedOptions : undefined}
        optionGroups={(noteModalData?.item as MenuItemWithDeal | null)?.optionGroups}
        initialQty={1}
        onClose={() => setNoteModalData(null)}
        onAdd={handleModalAdd}
      />

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
          style={[styles.orderBtn, { backgroundColor: isOpen && hasCart ? colors.primary : colors.muted }]}
          onPress={handleOrder}
          activeOpacity={isOpen && hasCart ? 0.85 : 1}
          disabled={!isOpen || !hasCart}
        >
          <MaterialIcons
            name={hasCart ? "shopping-bag" : "restaurant-menu"}
            size={22}
            color={isOpen && hasCart ? "#fff" : colors.mutedForeground}
          />
          <Text style={[styles.orderBtnText, { color: isOpen && hasCart ? "#fff" : colors.mutedForeground }]}>
            {!isOpen
              ? t("restaurant.closed")
              : hasCart
              ? t("restaurant.reviewOrder")
              : t("restaurant.selectItems")}
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
  restaurantName: { fontSize: 20, fontWeight: "800", textAlign: "left" },
  tags: { fontSize: 13, textAlign: "left" },
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
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4, textAlign: "left" },
  sectionSubtitle: { fontSize: 12, marginBottom: 12, textAlign: "left" },
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
  popularStepper: {
    position: "absolute",
    bottom: 68,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    borderRadius: 8,
    overflow: "hidden",
  },
  popularStepperBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  popularStepperQty: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center",
  },
  popularCardBody: { padding: 10, gap: 4 },
  popularItemName: { fontSize: 13, fontWeight: "700", textAlign: "left" },
  popularItemPrice: { fontSize: 13, fontWeight: "800", textAlign: "left" },
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
  unavailableBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unavailableText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dealBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    backgroundColor: "rgba(249,115,22,0.92)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dealBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dealPriceRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  dealOriginalPrice: { fontSize: 11, textDecorationLine: "line-through" },
  dealNewPrice: { fontSize: 13, fontWeight: "800", color: "#F97316" },
  flashBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#DC2626",
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  flashBannerLeft: { flex: 1, gap: 4 },
  flashBannerTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  flashBannerDiscount: { fontSize: 12, color: "rgba(255,255,255,0.9)" },
  flashBannerTimer: { alignItems: "center", minWidth: 64 },
  flashBannerTimerLabel: { fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  flashBannerTimerValue: { fontSize: 18, fontWeight: "900", color: "#fff" },
});
