import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useRouter } from "expo-router";
import RestaurantCard from "@/components/RestaurantCard";
import { customFetch } from "@workspace/api-client-react";

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

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_H_PAD = 16;
const COLS = 3;
const CARD_W = (SCREEN_W - CARD_H_PAD * 2 - CARD_GAP * (COLS - 1)) / COLS;

export default function SearchTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isAr = i18n.language === "ar";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RestaurantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [openOnly, setOpenOnly] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [topRated, setTopRated] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, opts?: {
    sort?: SortOption;
    open?: boolean;
    free?: boolean;
    top?: boolean;
  }) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: trimmed, sortBy: opts?.sort ?? sortBy });
      if (opts?.open ?? openOnly) params.set("openOnly", "1");
      if (opts?.free ?? freeDelivery) params.set("freeDelivery", "1");
      if (opts?.top ?? topRated) params.set("minRating", "4");
      const data = await customFetch<RestaurantItem[]>(`/api/restaurants?${params.toString()}`);
      setResults(data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, openOnly, freeDelivery, topRated]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 400);
  };

  const handleSubmit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query);
  };

  const handleCategoryTap = (cat: CategoryItem) => {
    const label = isAr ? cat.labelAr : cat.labelEn;
    setQuery(label);
    setSortBy("priority");
    setOpenOnly(false);
    setFreeDelivery(false);
    setTopRated(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(label, { sort: "priority", open: false, free: false, top: false });
  };

  const handleSuggestionTap = (s: string) => {
    setQuery(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(s);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const isSearching = query.trim().length > 0;

  const SORT_OPTIONS: { key: SortOption; label: string }[] = [
    { key: "priority",     label: t("search.sort.recommended") },
    { key: "rating",       label: t("search.sort.rating") },
    { key: "fastest",      label: t("search.sort.fastest") },
    { key: "delivery_fee", label: t("search.sort.fee") },
  ];

  const suggestions: string[] = t("search.suggestionsList", { returnObjects: true }) as string[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ─── Header ─── */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
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
            <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Sort + Filter chips (only when searching) ─── */}
      {isSearching && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsWrap}
          contentContainerStyle={styles.chipsRow}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => { setSortBy(opt.key); doSearch(query, { sort: opt.key }); }}
              >
                <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Open now */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: openOnly ? colors.primary : colors.card, borderColor: openOnly ? colors.primary : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !openOnly; setOpenOnly(next); doSearch(query, { open: next }); }}
          >
            <MaterialIcons name="store" size={13} color={openOnly ? "#fff" : colors.foreground} />
            <Text style={[styles.chipText, { color: openOnly ? "#fff" : colors.foreground }]}>{t("home.openOnly")}</Text>
          </TouchableOpacity>

          {/* Free delivery */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: freeDelivery ? colors.primary : colors.card, borderColor: freeDelivery ? colors.primary : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !freeDelivery; setFreeDelivery(next); doSearch(query, { free: next }); }}
          >
            <MaterialIcons name="delivery-dining" size={13} color={freeDelivery ? "#fff" : colors.foreground} />
            <Text style={[styles.chipText, { color: freeDelivery ? "#fff" : colors.foreground }]}>{t("search.filters.freeDelivery")}</Text>
          </TouchableOpacity>

          {/* Top rated */}
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: topRated ? "#FFB800" : colors.card, borderColor: topRated ? "#FFB800" : colors.border, flexDirection: "row", gap: 4 }]}
            onPress={() => { const next = !topRated; setTopRated(next); doSearch(query, { top: next }); }}
          >
            <MaterialIcons name="star" size={13} color={topRated ? "#fff" : "#FFB800"} />
            <Text style={[styles.chipText, { color: topRated ? "#fff" : colors.foreground }]}>{t("search.filters.stars")}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ─── Loading ─── */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {/* ─── Empty state: categories grid ─── */}
      {!loading && !isSearching && (
        <ScrollView contentContainerStyle={styles.emptyState} showsVerticalScrollIndicator={false}>
          <Text style={[styles.browseTitle, { color: colors.foreground }]}>
            {isAr ? "تصفّح حسب الفئة" : "Browse by Category"}
          </Text>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catCard, { backgroundColor: cat.bg, width: CARD_W }]}
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

          <Text style={[styles.suggestionsTitle, { color: colors.mutedForeground }]}>
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

      {/* ─── No results ─── */}
      {!loading && isSearching && results.length === 0 && (
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
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },

  /* Chips */
  chipsWrap: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  chipText: { fontSize: 13, fontWeight: "600" },

  /* Helpers */
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },

  /* Empty state */
  emptyState: { paddingHorizontal: CARD_H_PAD, paddingTop: 24, paddingBottom: 120 },
  browseTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  catCard: {
    height: 90,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 0,
  },
  catLabel: { fontSize: 13, fontWeight: "700" },

  /* Suggestions */
  suggestionsTitle: { fontSize: 14, fontWeight: "600", marginTop: 28, marginBottom: 10 },
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
