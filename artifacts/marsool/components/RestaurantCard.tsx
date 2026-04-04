import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Restaurant } from "@/data/restaurants";

interface Props {
  restaurant: Restaurant;
  onPress: () => void;
}

export default function RestaurantCard({ restaurant, onPress }: Props) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: restaurant.image }}
          style={styles.image}
          resizeMode="cover"
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>مغلق</Text>
          </View>
        )}
        {restaurant.discount && (
          <View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.discountText, { color: colors.primaryForeground }]}>
              {restaurant.discount}
            </Text>
          </View>
        )}
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
              {restaurant.deliveryTime} د
            </Text>
          </View>
          <View style={styles.dot} />
          <View style={styles.metaItem}>
            <MaterialIcons name="delivery-dining" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {restaurant.deliveryFee === 0 ? "توصيل مجاني" : `${restaurant.deliveryFee} ر.س`}
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
  imageContainer: {
    position: "relative",
  },
  image: {
    width: "100%",
    height: 160,
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  discountBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    padding: 14,
    gap: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  rating: {
    fontSize: 13,
    fontWeight: "600",
  },
  category: {
    fontSize: 13,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#ccc",
  },
});
