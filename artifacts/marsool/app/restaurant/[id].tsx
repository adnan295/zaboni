import { useRestaurantStamps } from "@/hooks/useStamps";
import { formatRating, minutesRangeText } from "@/components/HorizontalRestaurantCard";
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
  useWindowDimensions,
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
import AutoPromoBanner from "@/components/AutoPromoBanner";
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
  const stampQuery = useRestaurantStamps(typeof id === "string" ? id : undefined);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // The hero takes the picture's own shape: a wide banner fills the whole width, a square
  // logo stops at HERO_MAX and keeps its sides on the blurred copy. Never cropped.
  const [heroRatio, setHeroRatio] = useState<number | null>(null);
  const heroH = heroRatio ? Math.min(HERO_MAX, Math.max(HERO_MIN, screenW / heroRatio)) : 200;
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

  // Restaurant-wide flash discount as a percent, for DISPLAY on menu prices
  // only. Fixed-amount flash deals apply once to the whole order (not per item),
  // so they stay 0 here and surface only at checkout. The cart always stores the
  // pre-flash price, so the discount is never applied twice.
  const flashPercent =
    flashDeal && flashDeal.discountType === "percent" && flashDeal.discountValue > 0
      ? flashDeal.discountValue
      : 0;
  const flashUnit = (base: number): number =>
    flashPercent > 0 ? Math.round(base * (1 - flashPercent / 100)) : base;

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
  const stampCard = stampQuery.data ?? null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/*
        stickyHeaderIndices: child at index 2 becomes sticky.
        Order: 0=hero, 1=infoCard, 2=catTabs(STICKY), 3+=sections
      */}
      {/* The status bar keeps a white strip: the hero and the sticky section tabs stop under it. */}
      <View style={{ height: topPadding, backgroundColor: colors.card }} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={allTabs.length > 0 ? [flashDeal ? 4 : 3] : undefined}
      >
        {/* [0] Hero */}
        <View style={[styles.heroContainer, { height: heroH }]}>
          {/* Most restaurants' picture is their logo: show it whole (never cropped) over a blurred,
              faded copy of itself, so photos and logos both look right. */}
          <Image source={{ uri: buildImageUrl(restaurant.image) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
          <View style={styles.heroFade} />
          <View style={styles.heroFrontWrap}>
            <Image source={{ uri: buildImageUrl(restaurant.image) }} style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              transition={200}
              onLoad={(e) => {
                const { width: w, height: h } = e.source;
                if (w > 0 && h > 0) setHeroRatio(w / h);
              }}
            />
          </View>
          <View style={[styles.heroOverlay, { paddingTop: 12 }]}>
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
                    color={fav ? colors.primary : colors.mutedForeground}
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
              {(restaurant.tags as string[]).length > 0 && (
                <Text style={[styles.tags, { color: colors.mutedForeground }]}>
                  {(restaurant.tags as string[]).join(" · ")}
                </Text>
              )}
            </View>
          </View>
          {/* What a customer decides on, as chips: rating, time, delivery fee, distance */}
          {/* One fixed line from the right edge (a sideways-scrolling row drifted in Arabic).
              The row is one chip tall: a chip that does not fit wraps out of sight, so the
              least important one (distance, last) is the one that drops on narrow phones. */}
          <View style={styles.chipsWrap}>
            <View style={styles.chipsRow}>
              <View style={[styles.infoChip, { backgroundColor: colors.muted }]}>
                <Text style={{ color: colors.warning, fontSize: 13 }}>★</Text>
                <Text style={[styles.infoChipText, { color: colors.foreground }]}>{formatRating(restaurant.rating)}</Text>
                {restaurant.reviewCount > 0 && (
                  <Text style={[styles.infoChipSub, { color: colors.mutedForeground }]}>({restaurant.reviewCount})</Text>
                )}
              </View>
              <View style={[styles.infoChip, { backgroundColor: colors.muted }]}>
                <MaterialIcons name="schedule" size={14} color={colors.mutedForeground} />
                <Text style={[styles.infoChipText, { color: colors.foreground }]}>
                  {minutesRangeText(restaurant.deliveryTime)} {t("restaurant.minutesLong", "دقيقة")}
                </Text>
              </View>
              {restaurant.deliveryFee > 0 && (
                <View style={[styles.infoChip, { backgroundColor: colors.muted }]} accessibilityLabel={`${t("restaurant.deliveryShort", "توصيل")} ${restaurant.deliveryFee} ${t("restaurant.currency")}`}>
                  <MaterialIcons name="delivery-dining" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.infoChipText, { color: colors.foreground }]}>
                    {restaurant.deliveryFee} {t("restaurant.currency")}
                  </Text>
                </View>
              )}
              {!!distanceKm && (
                <View style={[styles.infoChip, { backgroundColor: colors.muted }]}>
                  <MaterialIcons name="place" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.infoChipText, { color: colors.foreground }]}>{distanceKm}</Text>
                </View>
              )}
            </View>
          </View>
          {/* «اطلب واربح»: one slim line — the stamps so far and the reward; taps through to «أختامي». */}
          {stampCard && (
            <TouchableOpacity
              style={[styles.stampStrip, { backgroundColor: colors.secondary }]}
              onPress={() => router.push("/stamps" as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={stampCard.coupon
                ? `كوبونك جاهز: ${stampCard.coupon.label}`
                : `أختامك ${stampCard.stamps} من ${stampCard.goal}، الجايزة ${stampCard.reward}`}
            >
              <MaterialIcons name="card-giftcard" size={16} color={colors.primaryDark} />
              {stampCard.coupon ? (
                <Text style={[styles.stampText, { color: colors.success }]} numberOfLines={1}>
                  <Text style={{ fontWeight: "800" }}>كوبونك جاهز</Text> · {stampCard.coupon.label}
                </Text>
              ) : (
                <>
                  <View style={styles.stampDots}>
                    {Array.from({ length: stampCard.goal }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.stampDot,
                          i < stampCard.stamps
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: colors.card, borderColor: "#FCA5A5" },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.stampText, { color: "#7F1D1D" }]} numberOfLines={1}>
                    <Text style={{ fontWeight: "800" }}>{stampCard.stamps} من {stampCard.goal}</Text> · الجايزة {stampCard.reward.replace(/ ببلاش$/, "")}
                  </Text>
                </>
              )}
              <MaterialIcons name="chevron-left" size={18} color={colors.primaryDark} />
            </TouchableOpacity>
          )}
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

        {/* Auto-apply promos (e.g. free first delivery) — includes this restaurant's own */}
        <AutoPromoBanner restaurantId={restaurant.id} />

        {/* [3 or 2] Sticky category tabs */}
        <View style={[styles.catTabsWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView
            ref={catTabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catScroll}
          >
            {allTabs.map((cat) => {
              const isActive = (activeCategory ?? allTabs[0]) === cat;
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
                        color: isActive ? colors.foreground : colors.mutedForeground,
                        fontWeight: isActive ? "800" : "500",
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
                    onPress={canAdd && !cart[item.id]?.qty ? () => openNoteModal(item as MenuItemWithDeal, dealPrice, item.price !== dealPrice ? item.price : undefined) : undefined}
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
                          {flashUnit(dealPrice).toLocaleString()} ل.س
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
                    onPress={canAdd && !cart[item.id]?.qty ? () => openNoteModal(item as MenuItemWithDeal, effectivePrice, itemIsDeal && effectivePrice !== item.price ? item.price : undefined) : undefined}
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
                            {flashUnit(effectivePrice).toLocaleString()} ل.س
                          </Text>
                        </View>
                      ) : item.price > 0 ? (
                        flashPercent > 0 ? (
                          <View style={styles.dealPriceRow}>
                            <Text style={[styles.dealOriginalPrice, { color: colors.mutedForeground }]}>
                              {item.price.toLocaleString()} ل.س
                            </Text>
                            <Text style={styles.dealNewPrice}>
                              {flashUnit(item.price).toLocaleString()} ل.س
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.popularItemPrice, { color: colors.primary }]}>
                            {item.price.toLocaleString()} ل.س
                          </Text>
                        )
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
                      flashPercent={flashPercent}
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

      {/* Order footer — only when there is something to say (closed) or to send (a cart) */}
      {(!isOpen || hasCart) && (
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
        {/* One button: how many items, «شوف السلة», and the total. Nothing until something is picked. */}
        {hasCart && isOpen && (
          <TouchableOpacity
            style={[styles.orderBtn, { backgroundColor: colors.primary }]}
            onPress={handleOrder}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${t("restaurant.reviewOrder")}، ${totalItems}`}
          >
            <View style={styles.orderBtnStart}>
              <View style={styles.cartCount}>
                <Text style={styles.cartCountText}>{totalItems}</Text>
              </View>
              <Text style={[styles.orderBtnText, { color: "#fff" }]}>{t("restaurant.reviewOrder")}</Text>
            </View>
            <Text style={[styles.orderBtnText, { color: "#fff" }]}>
              {flashUnit(estimatedTotal).toLocaleString("en-US")} {t("restaurant.currency")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      )}
    </View>
  );
}

const HERO_MIN = 120;
const HERO_MAX = 260;

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroContainer: { position: "relative", height: 200, overflow: "hidden", backgroundColor: "#FFFFFF" },
  heroImage: { width: "100%", height: 200 },
  heroFade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.55)" },
  heroFrontWrap: { ...StyleSheet.absoluteFillObject },
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
  catScroll: { paddingHorizontal: 16, alignItems: "center", gap: 22 },
  catTab: {
    height: CAT_TAB_HEIGHT,
    justifyContent: "center",
    borderBottomWidth: 3,
  },
  catTabText: { fontSize: 15 },
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
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingStart: 10,
    paddingEnd: 22,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  orderBtnStart: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartCount: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  cartCountText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  orderBtnText: { fontSize: 16, fontWeight: "700" },
  chipsWrap: { paddingHorizontal: 16, paddingBottom: 14, marginTop: -4 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, height: 32, overflow: "hidden" },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 16 },
  infoChipText: { fontSize: 13, fontWeight: "700" },
  infoChipSub: { fontSize: 13 },
  stampStrip: { flexDirection: "row", alignItems: "center", gap: 10, height: 40, borderRadius: 12, paddingHorizontal: 12, marginTop: 12 },
  stampDots: { flexDirection: "row", gap: 5 },
  stampDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  stampText: { flex: 1, fontSize: 13, textAlign: "left" },
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
