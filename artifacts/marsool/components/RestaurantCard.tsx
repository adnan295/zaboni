import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { buildImageUrl } from "@/lib/apiConfig";
import { useFavorites } from "@/context/FavoritesContext";
import type { Restaurant as ApiRestaurant } from "@workspace/api-client-react";
import SkeletonBox from "@/components/SkeletonBox";
import StampBadge from "@/components/StampBadge";
import { useStampRestaurants } from "@/hooks/useStamps";
import { cardShadow } from "@/constants/colors";
import { formatRating, minutesRangeText } from "@/components/HorizontalRestaurantCard";

interface Props {
  restaurant: ApiRestaurant;
  onPress: () => void;
}

export function RestaurantCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <SkeletonBox width={"100%"} height={160} borderRadius={0} />
      <View style={[styles.content, { gap: 10 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SkeletonBox width={140} height={14} borderRadius={6} />
          <SkeletonBox width={36} height={14} borderRadius={6} />
        </View>
        <SkeletonBox width={100} height={11} borderRadius={6} />
        <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
          <SkeletonBox width={70} height={11} borderRadius={6} />
          <SkeletonBox width={80} height={11} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

export default function RestaurantCard({ restaurant, onPress }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(restaurant.id);
  const stampIds = useStampRestaurants();
  const scale = React.useRef(new Animated.Value(1)).current;
  const hasFlashDeal = !!(restaurant as unknown as Record<string, unknown>)["hasFlashDeal"];
  const maxDealPercent = (restaurant as unknown as Record<string, unknown>)["maxDealPercent"] as number | null | undefined;

  const handleFav = (e: GestureResponderEvent) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 40 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }),
    ]).start();
    toggleFavorite(restaurant);
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={[styles.imageContainer, (restaurant as any).isLogo && styles.logoContainer]}>
        <Image
          source={{ uri: buildImageUrl(restaurant.image) }}
          style={(restaurant as any).isLogo ? [styles.image, styles.logoImage] : styles.image}
          contentFit={(restaurant as any).isLogo ? "contain" : "cover"}
          transition={200}
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>{t("restaurant.closed")}</Text>
          </View>
        )}
        {hasFlashDeal && (
          <View style={styles.flashBadge}>
            {maxDealPercent != null && maxDealPercent > 0 ? (
              <Text style={styles.flashBadgeText}>خصم حتى {maxDealPercent}%</Text>
            ) : (
              <Text style={styles.flashBadgeText}>عرض محدود</Text>
            )}
          </View>
        )}
        {!hasFlashDeal && maxDealPercent != null && maxDealPercent > 0 && (
          <View style={[styles.discountBadge, { backgroundColor: colors.offer }]}>
            <Text style={[styles.discountText, { color: colors.offerForeground }]}>
              خصم حتى {maxDealPercent}%
            </Text>
          </View>
        )}
        {restaurant.discount && !hasFlashDeal && !(maxDealPercent != null && maxDealPercent > 0) && (
          <View style={[styles.discountBadge, { backgroundColor: colors.offer }]}>
            <Text style={[styles.discountText, { color: colors.offerForeground }]}>
              {restaurant.discount}
            </Text>
          </View>
        )}

        {stampIds.has(restaurant.id) && <StampBadge style={{ bottom: 8, left: 8 }} />}
        <TouchableOpacity
          style={[styles.favBtn, { backgroundColor: "rgba(255,255,255,0.95)" }]}
          onPress={handleFav}
          accessibilityRole="button"
          accessibilityLabel={fav ? "شيل من المفضلة" : "أضف للمفضلة"}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <MaterialIcons
              name={fav ? "favorite" : "favorite-border"}
              size={20}
              color={fav ? colors.primary : colors.mutedForeground}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {restaurant.nameAr}
          </Text>
          <View style={[styles.ratingRow, { backgroundColor: colors.muted }]}>
            <Text style={{ color: colors.warning, fontSize: 13 }}>★</Text>
            <Text style={[styles.rating, { color: colors.foreground }]}>
              {formatRating(restaurant.rating)}
            </Text>
          </View>
        </View>

        {restaurant.tags.length > 0 && (
          <Text style={[styles.category, { color: colors.mutedForeground }]} numberOfLines={1}>
            {restaurant.tags.join(" · ")}
          </Text>
        )}

        {/* Same order as the small cards: time · delivery fee */}
        <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {minutesRangeText(restaurant.deliveryTime)} {t("restaurant.minutesLong", "دقيقة")}
          {"  ·  "}
          {restaurant.deliveryFee === 0
            ? t("restaurant.freeDelivery")
            : `${t("restaurant.deliveryShort", "توصيل")} ${restaurant.deliveryFee} ${t("restaurant.currency")}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    ...cardShadow,
  },
  imageContainer: { position: "relative" },
  logoContainer: { backgroundColor: "#ffffff", height: 160, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: 160 },
  logoImage: { width: "80%", height: 128 },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  flashBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  flashBadgeText: { fontSize: 12, fontWeight: "700", color: "#92400E" },
  discountBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountText: { fontSize: 12, fontWeight: "700" },
  favBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  content: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "left" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, height: 26, borderRadius: 13 },
  rating: { fontSize: 13, fontWeight: "700" },
  category: { fontSize: 13, textAlign: "left" },
  meta: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 13, textAlign: "left" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#ccc" },
});
