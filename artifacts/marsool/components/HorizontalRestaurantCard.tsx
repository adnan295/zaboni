import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { buildImageUrl } from "@/lib/apiConfig";
import SkeletonBox from "@/components/SkeletonBox";

interface HRestaurant {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  rating: number;
  deliveryTime: string;
  deliveryFee: number;
  isOpen: boolean;
  isLogo: boolean;
  discount: string | null;
  hasFlashDeal?: boolean;
}

interface Props {
  restaurant: HRestaurant;
  onPress: () => void;
  variant?: "default" | "deal";
  badge?: string;
}

export function HorizontalRestaurantCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <SkeletonBox width={160} height={110} borderRadius={0} />
      <View style={[styles.info, { gap: 8 }]}>
        <SkeletonBox width={110} height={12} borderRadius={6} />
        <SkeletonBox width={80} height={10} borderRadius={6} />
      </View>
    </View>
  );
}

export default function HorizontalRestaurantCard({ restaurant, onPress, variant = "default", badge }: Props) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isDeal = variant === "deal";
  const hasFlashDeal = restaurant.hasFlashDeal ?? !!(restaurant as unknown as Record<string, unknown>)["hasFlashDeal"];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: isDeal ? colors.primary : colors.card },
      ]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View
        style={[
          styles.imageWrap,
          restaurant.isLogo && { backgroundColor: "#fff", alignItems: "center" as const, justifyContent: "center" as const },
        ]}
      >
        <Image
          source={{ uri: buildImageUrl(restaurant.image) }}
          style={restaurant.isLogo ? styles.logoImage : styles.image}
          resizeMode={restaurant.isLogo ? "contain" : "cover"}
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>{t("restaurant.closed")}</Text>
          </View>
        )}
        {hasFlashDeal && (
          <View style={styles.flashBadge}>
            <Text style={styles.flashBadgeText}>⚡ عرض محدود</Text>
          </View>
        )}
        {!!restaurant.discount && !hasFlashDeal && (
          <View style={[styles.badge, { backgroundColor: isDeal ? "#fff" : colors.primary }]}>
            <Text style={[styles.badgeText, { color: isDeal ? colors.primary : "#fff" }]}>
              {restaurant.discount}
            </Text>
          </View>
        )}
        {!!badge && (
          <View style={styles.reorderBadge}>
            <MaterialIcons name="replay" size={9} color="#fff" />
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.name, { color: isDeal ? "#fff" : colors.foreground }]}
          numberOfLines={1}
        >
          {isAr ? restaurant.nameAr : restaurant.name}
        </Text>
        <View style={styles.meta}>
          <MaterialIcons name="star" size={12} color={isDeal ? "#FFE066" : "#FFB800"} />
          <Text style={[styles.metaText, { color: isDeal ? "rgba(255,255,255,0.9)" : colors.mutedForeground }]}>
            {restaurant.rating}
          </Text>
          <View style={[styles.sep, { backgroundColor: isDeal ? "rgba(255,255,255,0.4)" : "#ccc" }]} />
          <MaterialIcons name="access-time" size={12} color={isDeal ? "rgba(255,255,255,0.7)" : colors.mutedForeground} />
          <Text style={[styles.metaText, { color: isDeal ? "rgba(255,255,255,0.9)" : colors.mutedForeground }]}>
            {restaurant.deliveryTime} {t("restaurant.minutes")}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  imageWrap: { position: "relative", height: 110 },
  image: { width: "100%", height: 110 },
  logoImage: { width: "80%", height: "100%" },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reorderBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#059669",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  flashBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#f97316",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  flashBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  info: { padding: 10, gap: 5 },
  name: { fontSize: 13, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 11 },
  sep: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 2 },
});
