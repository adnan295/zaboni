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
}

interface Props {
  restaurant: HRestaurant;
  onPress: () => void;
  variant?: "default" | "deal";
}

export default function HorizontalRestaurantCard({ restaurant, onPress, variant = "default" }: Props) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isDeal = variant === "deal";

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
        {!!restaurant.discount && (
          <View style={[styles.badge, { backgroundColor: isDeal ? "#fff" : colors.primary }]}>
            <Text style={[styles.badgeText, { color: isDeal ? colors.primary : "#fff" }]}>
              {restaurant.discount}
            </Text>
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
  badgeText: { fontSize: 10, fontWeight: "700" },
  info: { padding: 10, gap: 5 },
  name: { fontSize: 13, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 11 },
  sep: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 2 },
});
