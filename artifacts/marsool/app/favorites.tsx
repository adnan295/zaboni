import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useFavorites } from "@/context/FavoritesContext";
import RestaurantCard from "@/components/RestaurantCard";

export default function FavoritesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { favorites } = useFavorites();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("favorites.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="favorite-border" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {t("favorites.empty.title")}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            {t("favorites.empty.subtitle")}
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.browseBtnText}>{t("favorites.empty.browse")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onPress={() => router.push(`/restaurant/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptySubtitle: { fontSize: 14, textAlign: "center" },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  list: { padding: 16 },
});
