import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import RestaurantCard from "@/components/RestaurantCard";
import { CATEGORIES, RESTAURANTS, Restaurant } from "@/data/restaurants";
import { useAddresses } from "@/context/AddressContext";
import { useNotifications } from "@/context/NotificationsContext";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { defaultAddress } = useAddresses();
  const { unreadCount } = useNotifications();

  const filtered = RESTAURANTS.filter((r) => {
    return selectedCategory === "all" || r.category === selectedCategory;
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
          <TouchableOpacity style={styles.locationRow} onPress={() => router.push("/addresses")}>
            <MaterialIcons name="location-on" size={18} color={colors.primary} />
            <Text style={[styles.location, { color: colors.foreground }]} numberOfLines={1}>
              {defaultAddress ? defaultAddress.label : "أضف عنواناً"}
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
          <Text style={[styles.greetTitle, { color: colors.foreground }]}>
            اكتشف <Text style={{ color: colors.primary }}>ما يشتهيه قلبك</Text>
          </Text>
        </View>

        {/* Search — tappable button that opens the search screen */}
        <TouchableOpacity
          style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/search")}
          activeOpacity={0.8}
        >
          <MaterialIcons name="search" size={20} color={colors.mutedForeground} />
          <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
            ابحث عن مطعم أو طعام...
          </Text>
          <MaterialIcons name="tune" size={18} color={colors.primary} />
        </TouchableOpacity>

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

        {/* Active orders banner */}
        <TouchableOpacity
          style={[styles.orderBanner, { backgroundColor: colors.secondary }]}
          onPress={() => router.push("/orders")}
        >
          <View style={[styles.bannerDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.bannerText, { color: colors.primary }]}>
            تتبع طلبك الحالي
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Restaurants */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {selectedCategory === "all" ? "جميع المطاعم" : CATEGORIES.find(c => c.id === selectedCategory)?.name}
              <Text style={[styles.count, { color: colors.mutedForeground }]}> ({filtered.length})</Text>
            </Text>
            <TouchableOpacity onPress={() => router.push("/search")}>
              <MaterialIcons name="search" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

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
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                لا توجد نتائج
              </Text>
            </View>
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
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  location: {
    fontSize: 15,
    fontWeight: "600",
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  greeting: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  greetTitle: {
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 34,
  },
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
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
  },
  categoriesContainer: {
    marginBottom: 16,
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 14,
    gap: 8,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    writingDirection: "rtl",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  count: {
    fontWeight: "400",
    fontSize: 14,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
});
