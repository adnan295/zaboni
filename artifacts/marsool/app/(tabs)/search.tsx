import * as Location from "expo-location";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useRouter, useNavigation } from "expo-router";
import RestaurantCard from "@/components/RestaurantCard";
import { customFetch } from "@workspace/api-client-react";
import { useAddresses } from "@/context/AddressContext";

type SortOption = "priority" | "fastest" | "rating" | "delivery_fee";

type RestaurantItem = {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  categoryAr: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrder: number;
  image: string;
  tags: string[];
  isOpen: boolean;
  isLogo: boolean;
  discount: string | null;
  distanceKm?: number | null;
};

type CategoryItem = {
  key: string;
  labelAr: string;
  labelEn: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bg: string;
};

const CATEGORIES: CategoryItem[] = [
  { key: "برغر",    labelAr: "برغر",    labelEn: "Burger",  icon: "lunch-dining",    color: "#fff", bg: "#e53935" },
  { key: "بيتزا",   labelAr: "بيتزا",   labelEn: "Pizza",   icon: "local-pizza",     color: "#fff", bg: "#f4511e" },
  { key: "دجاج",    labelAr: "دجاج",    labelEn: "Chicken", icon: "egg-alt",         color: "#fff", bg: "#fb8c00" },
  { key: "مشاوي",   labelAr: "مشاوي",   labelEn: "Grills",  icon: "outdoor-grill",   color: "#fff", bg: "#6d4c41" },
  { key: "حلويات",  labelAr: "حلويات",  labelEn: "Sweets",  icon: "cake",            color: "#fff", bg: "#d81b60" },
  { key: "مشروبات", labelAr: "مشروبات", labelEn: "Drinks",  icon: "local-cafe",      color: "#fff", bg: "#00897b" },
];

const CARD_GAP = 12;
const CARD_H_PAD = 16;

export default function SearchTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const isAr = i18n.language === "ar";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RestaurantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retrySearch, setRetrySearch] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [openOnly, setOpenOnly] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [topRated, setTopRated] = useState(false);

  const [popular, setPopular] = useState<RestaurantItem[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);

  const inputRef = useRef<TextInput>(null);

  const { defaultAddress } = useAddresses();
  // Price cards from the delivery address so the fee matches checkout.
  const [userLocation, setUserLocation] = useState<{lat: number; lon: number} | null>(null);
  useEffect(() => {
    if (defaultAddress?.latitude != null && defaultAddress?.longitude != null) return;
    let active = true;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") return;
        const position = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced});
        if (active) setUserLocation({lat: position.coords.latitude, lon: position.coords.longitude});
      } catch { /* Keep the fallback order when location is unavailable. */ }
    })();
    return () => { active = false; };
  }, [defaultAddress?.latitude, defaultAddress?.longitude]);
  const feeLat = defaultAddress?.latitude ?? userLocation?.lat;
  const feeLon = defaultAddress?.longitude ?? userLocation?.lon;
  const locParam = feeLat != null && feeLon != null ? `&lat=${feeLat}&lon=${feeLon}` : "";

  // Fetch popular restaurants on mount (used in empty state)
  useEffect(() => {
    customFetch<RestaurantItem[]>(`/api/restaurants?sortBy=rating&limit=6${locParam}`)
      .then((data) => setPopular(data ?? []))
      .catch(() => setPopular([]))
      .finally(() => setPopularLoading(false));
  }, [locParam]);

  useEffect(() => {
    let active = true;
    setResults([]);
    setSearchError(false);
    const trimmed = query.trim();
    if (!trimmed) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: trimmed, sortBy });
        if (openOnly) params.set("openOnly", "1");
        if (freeDelivery) params.set("freeDelivery", "1");
        if (topRated) params.set("minRating", "4");
        if (feeLat != null && feeLon != null) { params.set("lat", String(feeLat)); params.set("lon", String(feeLon)); }
        const data = await customFetch<RestaurantItem[]>(`/api/restaurants?${params.toString()}`);
        if (active) setResults(data ?? []);
      } catch { if (active) setSearchError(true); }
      finally { if (active) setLoading(false); }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [query, sortBy, openOnly, freeDelivery, topRated, feeLat, feeLon, retrySearch]);

  const handleChange = (text: string) => { setQuery(text); setResults([]); setSearchError(false); setLoading(!!text.trim()); };
  const handleSubmit = () => setRetrySearch(n => n + 1);
  const handleCategoryTap = (cat: CategoryItem) => {
    handleChange(isAr ? cat.labelAr : cat.labelEn);
    setSortBy("priority"); setOpenOnly(false); setFreeDelivery(false); setTopRated(false);
  };
  const handleSuggestionTap = handleChange;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const isSearching = query.trim().length > 0;

  const SORT_OPTIONS: { key: SortOption; label: string }[] = [
    { key: "priority",     label: t(feeLat != null && feeLon != null ? "search.sort.nearest" : "search.sort.recommended") },
    { key: "rating",       label: t("search.sort.rating") },
    { key: "fastest",      label: t("search.sort.fastest") },
    { key: "delivery_fee", label: t("search.sort.fee") },
  ];

  const suggestions: string[] = t("search.suggestionsList", { returnObjects: true }) as string[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ─── Header ─── */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
        {canGoBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backBtn}
          >
            <MaterialIcons
              name={isAr ? "chevron-right" : "chevron-left"}
              size={28}
              color="#fff"
            />
          </TouchableOpacity>
        )}
        <View style={[styles.searchBox, { backgroundColor: colors.card }]}>
          <MaterialIcons name="search" size={20} color={colors.mutedForeground} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            textAlign={isAr ? "right" : "left"}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery("");
                setResults([]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Sort + Filter chips (only when searching) ─── */}
      {isSearching && (
        <View style={styles.chipsWrap}>
          <Text style={[styles.groupLabel, {color: colors.mutedForeground}]}>{t("search.sortTitle")}</Text>
          <View style={styles.chipsRow}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => { setSortBy(opt.key); }}
              >
                <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}

          </View>
          <Text style={[styles.groupLabel, {color: colors.mutedForeground}]}>{t("search.filtersTitle")}</Text>
          <View style={styles.chipsRow}>
          {/* Open now */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: openOnly ? colors.primary : colors.card, borderColor: openOnly ? colors.primary : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !openOnly; setOpenOnly(next); }}
          >
            <MaterialIcons name="store" size={13} color={openOnly ? "#fff" : colors.foreground} />
            <Text style={[styles.chipText, { color: openOnly ? "#fff" : colors.foreground }]}>{t("home.openOnly")}</Text>
          </TouchableOpacity>

          {/* Free delivery */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: freeDelivery ? colors.primary : colors.card, borderColor: freeDelivery ? colors.primary : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !freeDelivery; setFreeDelivery(next); }}
          >
            <MaterialIcons name="delivery-dining" size={13} color={freeDelivery ? "#fff" : colors.foreground} />
            <Text style={[styles.chipText, { color: freeDelivery ? "#fff" : colors.foreground }]}>{t("search.filters.freeDelivery")}</Text>
          </TouchableOpacity>

          {/* Top rated */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: topRated ? "#FFB800" : colors.card, borderColor: topRated ? "#FFB800" : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !topRated; setTopRated(next); }}
          >
            <MaterialIcons name="star" size={13} color={topRated ? "#fff" : "#FFB800"} />
            <Text style={[styles.chipText, { color: topRated ? "#fff" : colors.foreground }]}>{t("search.filters.stars")}</Text>
          </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Loading (search results) ─── */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {/* ─── Empty state: categories + popular restaurants ─── */}
      {!loading && !isSearching && (
        <ScrollView contentContainerStyle={styles.emptyState} showsVerticalScrollIndicator={false}>
          {/* Category grid */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {isAr ? "تصفّح حسب الفئة" : "Browse by Category"}
          </Text>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catCard, { backgroundColor: cat.bg }]}
                onPress={() => handleCategoryTap(cat)}
                activeOpacity={0.85}
              >
                <MaterialIcons name={cat.icon} size={32} color={cat.color} />
                <Text style={[styles.catLabel, { color: cat.color }]}>
                  {isAr ? cat.labelAr : cat.labelEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Popular restaurants */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>
            {t("home.popular")}
          </Text>
          {popularLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : (
            popular.map((item) => (
              <RestaurantCard
                key={item.id}
                restaurant={item}
                onPress={() => router.push(`/restaurant/${item.id}` as any)}
              />
            ))
          )}

          {/* Quick suggestions */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 24, fontSize: 14 }]}>
            {t("search.suggestions")}
          </Text>
          <View style={styles.suggestionsRow}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.suggChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSuggestionTap(s)}
              >
                <Text style={[styles.suggChipText, { color: colors.foreground }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {!loading && isSearching && searchError && <View style={styles.center}>
        <Text accessibilityRole="alert" style={[styles.noResultText, {color: colors.foreground}]}>{t("search.loadFailed")}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={handleSubmit}><Text style={{color:colors.primary}}>{t("common.retry")}</Text></TouchableOpacity>
      </View>}
      {/* ─── No results ─── */}
      {!loading && !searchError && isSearching && results.length === 0 && (
        <View style={styles.center}>
          <MaterialIcons name="search-off" size={52} color={colors.mutedForeground} />
          <Text style={[styles.noResultText, { color: colors.foreground }]}>
            {t("search.noResults")} «{query.trim()}»
          </Text>
          <Text style={[styles.noResultSub, { color: colors.mutedForeground }]}>
            {t("search.noResultsSub")}
          </Text>
          <View style={styles.suggestionsRow}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.suggChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSuggestionTap(s)}
              >
                <Text style={[styles.suggChipText, { color: colors.foreground }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ─── Results list ─── */}
      {!loading && isSearching && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onPress={() => router.push(`/restaurant/${item.id}` as any)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: { paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  searchBox: {
    flex: 1, minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },

  /* Chips */
  chipsWrap: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  groupLabel: { fontSize: 12, fontWeight: "600", textAlign: "right" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "48%", minHeight: 44, flexShrink: 0, justifyContent: "center", gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  chipText: { fontSize: 13, fontWeight: "600", textAlign: "center", flexShrink: 1 },

  /* Helpers */
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },

  /* Empty state */
  emptyState: { paddingHorizontal: CARD_H_PAD, paddingTop: 24, paddingBottom: 120 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  catCard: {
    width: "30%", minHeight: 96, paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  catLabel: { fontSize: 13, fontWeight: "700" },

  /* Suggestions */
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" },
  suggChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggChipText: { fontSize: 13 },

  /* No results */
  noResultText: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  noResultSub: { fontSize: 13, textAlign: "center", opacity: 0.7 },

  /* Results */
  resultsList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
});
