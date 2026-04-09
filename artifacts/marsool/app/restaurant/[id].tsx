import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  ActivityIndicator,
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
import { useGetRestaurant, useGetRestaurantMenu } from "@workspace/api-client-react";

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { isFavorite, toggleFavorite } = useFavorites();

  const { data: restaurant, isLoading: restaurantLoading } = useGetRestaurant(id ?? "");
  const { data: menuItemsData } = useGetRestaurantMenu(id ?? "");
  const menuItems = menuItemsData ?? [];
  const categories = Array.from(new Set(menuItems.map((m) => m.categoryAr)));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  const filteredItems = selectedCategory
    ? menuItems.filter((m) => m.categoryAr === selectedCategory)
    : menuItems;

  if (restaurantLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#FF6B00" />
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.heroContainer}>
          <Image source={{ uri: restaurant.image }} style={styles.heroImage} resizeMode="cover" />
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

        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={styles.infoTop}>
            <View style={styles.infoMain}>
              <Text style={[styles.restaurantName, { color: colors.foreground }]}>
                {restaurant.nameAr}
              </Text>
              <Text style={[styles.tags, { color: colors.mutedForeground }]}>
                {(restaurant.tags as string[]).join(" · ")}
              </Text>
            </View>
            <View style={[styles.ratingChip, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="star" size={14} color="#FFB800" />
              <Text style={[styles.ratingNum, { color: colors.foreground }]}>
                {restaurant.rating}
              </Text>
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
              <Text style={[styles.statValue, { color: colors.foreground }]}>{t("restaurant.nearby")}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <MaterialIcons name="star" size={16} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("restaurant.rating")}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{restaurant.rating}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
          style={{ marginBottom: 12 }}
        >
          <TouchableOpacity
            style={[
              styles.catBtn,
              {
                backgroundColor: !selectedCategory ? colors.primary : colors.card,
                borderColor: !selectedCategory ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.catText, { color: !selectedCategory ? "#fff" : colors.foreground }]}>
              {t("restaurant.all")}
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.catBtn,
                {
                  backgroundColor: selectedCategory === cat ? colors.primary : colors.card,
                  borderColor: selectedCategory === cat ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catText, { color: selectedCategory === cat ? "#fff" : colors.foreground }]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.menuSection}>
          <Text style={[styles.menuTitle, { color: colors.foreground }]}>{t("restaurant.menu")}</Text>
          {filteredItems.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.orderFooter, { backgroundColor: colors.background, paddingBottom: bottomPadding + 12, borderTopColor: colors.border }]}>
        {!restaurant.isOpen && (
          <View style={[styles.closedBanner, { backgroundColor: "rgba(0,0,0,0.08)" }]}>
            <MaterialIcons name="access-time" size={16} color={colors.mutedForeground} />
            <Text style={[styles.closedBannerText, { color: colors.mutedForeground }]}>
              {t("restaurant.closed")}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: restaurant.isOpen ? colors.primary : colors.muted }]}
          onPress={() => {
            if (!restaurant.isOpen) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({
              pathname: "/order-request",
              params: { restaurantName: restaurant.nameAr, deliveryFee: restaurant.deliveryFee.toString() },
            });
          }}
          activeOpacity={restaurant.isOpen ? 0.85 : 1}
          disabled={!restaurant.isOpen}
        >
          <MaterialIcons name="edit-note" size={22} color={restaurant.isOpen ? "#fff" : colors.mutedForeground} />
          <Text style={[styles.orderBtnText, { color: restaurant.isOpen ? "#fff" : colors.mutedForeground }]}>
            {restaurant.isOpen ? t("restaurant.orderNow") : t("restaurant.closed")}
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
  heroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
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
  catScroll: { paddingHorizontal: 16, gap: 8 },
  catBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  catText: { fontSize: 13, fontWeight: "600" },
  menuSection: { paddingHorizontal: 16 },
  menuTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12, textAlign: "right" },
  orderFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  orderBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#FF6B00",
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
    marginBottom: 8,
  },
  closedBannerText: { fontSize: 14, fontWeight: "700" },
});
