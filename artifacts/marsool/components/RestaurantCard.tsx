import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  GestureResponderEvent,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { buildImageUrl } from "@/lib/apiConfig";
import { useFavorites } from "@/context/FavoritesContext";
import type { Restaurant as ApiRestaurant } from "@workspace/api-client-react";

interface Props {
  restaurant: ApiRestaurant;
  onPress: () => void;
}

export default function RestaurantCard({ restaurant, onPress }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(restaurant.id);
  const scale = React.useRef(new Animated.Value(1)).current;

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
      <View style={[styles.imageContainer, restaurant.isLogo && styles.logoContainer]}>
        <Image
          source={{ uri: buildImageUrl(restaurant.image) }}
          style={styles.image}
          resizeMode={restaurant.isLogo ? "contain" : "cover"}
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>{t("restaurant.closed")}</Text>
          </View>
        )}
        {restaurant.discount && (
          <View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.discountText, { color: colors.primaryForeground }]}>
              {restaurant.discount}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.favBtn, { backgroundColor: "rgba(255,255,255,0.92)" }]}
          onPress={handleFav}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <MaterialIcons
              name={fav ? "favorite" : "favorite-border"}
              size={20}
              color={fav ? "#ef4444" : "#888"}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {restaurant.nameAr}
          </Text>
          <View style={styles.ratingRow}>
            <MaterialIcons name="star" size={14} color="#FFB800" />
            <Text style={[styles.rating, { color: colors.foreground }]}>
              {restaurant.rating}
            </Text>
          </View>
        </View>

        <Text style={[styles.category, { color: colors.mutedForeground }]}>
          {restaurant.tags.join(" · ")}
        </Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <MaterialIcons name="access-time" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {restaurant.deliveryTime} {t("restaurant.minutes")}
            </Text>
          </View>
          <View style={styles.dot} />
          <View style={styles.metaItem}>
            <MaterialIcons name="delivery-dining" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {restaurant.deliveryFee === 0
                ? t("restaurant.freeDelivery")
                : `${restaurant.deliveryFee} ${t("restaurant.currency")}`}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: { position: "relative" },
  logoContainer: { backgroundColor: "#ffffff" },
  image: { width: "100%", height: 160 },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  discountBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountText: { fontSize: 11, fontWeight: "700" },
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
  content: { padding: 14, gap: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "700", flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  rating: { fontSize: 13, fontWeight: "600" },
  category: { fontSize: 13 },
  meta: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#ccc" },
});
