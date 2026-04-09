import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import RestaurantCard from "@/components/RestaurantCard";
import { customFetch } from "@workspace/api-client-react";

type SortOption = "fastest" | "rating" | "delivery_fee";

const HISTORY_KEY = "@marsool_search_history";
const MAX_HISTORY = 5;

export default function SearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(false);
  const [minRating, setMinRating] = useState<number | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const SORT_OPTIONS: { id: SortOption; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { id: "fastest", label: t("search.sort.fastest"), icon: "access-time" },
    { id: "rating", label: t("search.sort.rating"), icon: "star" },
    { id: "delivery_fee", label: t("search.sort.fee"), icon: "local-shipping" },
  ];

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(HISTORY_KEY);
        if (stored) setHistory(JSON.parse(stored));
      } catch {}
    })();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const saveToHistory = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== term);
      const updated = [term, ...filtered].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const handleSubmit = () => {
    if (query.trim()) saveToHistory(query.trim());
  };

  const handleHistoryTap = (term: string) => {
    setQuery(term);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  type Restaurant = {
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
    discount: string | null;
  };

  const [apiResults, setApiResults] = useState<Restaurant[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setApiResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `/api/restaurants?search=${encodeURIComponent(query.trim())}`;
        const data = await customFetch(url) as Restaurant[];
        setApiResults(Array.isArray(data) ? data : []);
      } catch {
        setApiResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filtered = apiResults.filter((r) => {
    const matchRating = minRating === null || r.rating >= minRating;
    const matchFree = !freeDeliveryOnly || r.deliveryFee === 0;
    return matchRating && matchFree;
  }).sort((a, b) => {
    if (sortBy === "fastest") {
      const aMin = parseInt(a.deliveryTime.split("-")[0]);
      const bMin = parseInt(b.deliveryTime.split("-")[0]);
      return aMin - bMin;
    }
    if (sortBy === "rating") return b.rating - a.rating;
    if (sortBy === "delivery_fee") return a.deliveryFee - b.deliveryFee;
    return 0;
  });

  const showResults = query.trim().length > 0;
  const showHistory = !showResults && history.length > 0;
  const activeFiltersCount =
    (sortBy !== "rating" ? 1 : 0) + (freeDeliveryOnly ? 1 : 0) + (minRating ? 1 : 0);

  const suggestions = t("search.suggestionsList", { returnObjects: true }) as string[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={20} color={colors.primary} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            textAlign="right"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <MaterialIcons name="close" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={[styles.filtersWrapper, { borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.filterChip,
                {
                  backgroundColor: sortBy === opt.id ? colors.primary : colors.card,
                  borderColor: sortBy === opt.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSortBy(opt.id);
              }}
            >
              <MaterialIcons
                name={opt.icon}
                size={14}
                color={sortBy === opt.id ? "#fff" : colors.mutedForeground}
              />
              <Text style={[styles.filterChipText, { color: sortBy === opt.id ? "#fff" : colors.foreground }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}

          <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: freeDeliveryOnly ? colors.primary : colors.card,
                borderColor: freeDeliveryOnly ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFreeDeliveryOnly((v) => !v);
            }}
          >
            <MaterialIcons
              name="delivery-dining"
              size={14}
              color={freeDeliveryOnly ? "#fff" : colors.mutedForeground}
            />
            <Text style={[styles.filterChipText, { color: freeDeliveryOnly ? "#fff" : colors.foreground }]}>
              {t("search.filters.freeDelivery")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: minRating === 4 ? colors.primary : colors.card,
                borderColor: minRating === 4 ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMinRating((v) => (v === 4 ? null : 4));
            }}
          >
            <MaterialIcons name="star" size={14} color={minRating === 4 ? "#fff" : "#FFB800"} />
            <Text style={[styles.filterChipText, { color: minRating === 4 ? "#fff" : colors.foreground }]}>
              {t("search.filters.stars")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        data={showResults ? filtered : []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {showHistory && (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyTitle, { color: colors.foreground }]}>
                    {t("search.history.title")}
                  </Text>
                  <TouchableOpacity onPress={clearHistory}>
                    <Text style={[styles.clearHistory, { color: colors.destructive }]}>{t("search.history.clearAll")}</Text>
                  </TouchableOpacity>
                </View>
                {history.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={[styles.historyItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleHistoryTap(term)}
                  >
                    <MaterialIcons name="history" size={18} color={colors.mutedForeground} />
                    <Text style={[styles.historyText, { color: colors.foreground }]}>{term}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setHistory((prev) => {
                          const updated = prev.filter((h) => h !== term);
                          AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
                          return updated;
                        });
                      }}
                    >
                      <MaterialIcons name="close" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {showResults && searching && (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {showResults && !searching && filtered.length === 0 && (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialIcons name="search-off" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {t("search.noResults")} "{query}"
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                  {t("search.noResultsSub")}
                </Text>
              </View>
            )}

            {showResults && filtered.length > 0 && (
              <View style={styles.resultsHeader}>
                <Text style={[styles.resultsCount, { color: colors.mutedForeground }]}>
                  {filtered.length} {t("search.resultsCount")}
                  {activeFiltersCount > 0 && (
                    <Text style={{ color: colors.primary }}> · {activeFiltersCount} {t("search.activeFilters")}</Text>
                  )}
                </Text>
              </View>
            )}

            {!showResults && history.length === 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={[styles.suggestionsTitle, { color: colors.foreground }]}>
                  {t("search.suggestions")}
                </Text>
                <View style={styles.suggestionsGrid}>
                  {suggestions.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.suggestionChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => {
                        setQuery(s);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.suggestionChipText, { color: colors.foreground }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <RestaurantCard
            restaurant={item}
            onPress={() => {
              saveToHistory(query.trim());
              router.push(`/restaurant/${item.id}`);
            }}
          />
        )}
      />
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
    gap: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  filtersWrapper: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  filterChipText: { fontSize: 12, fontWeight: "600" },
  filterDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  list: { padding: 16 },
  historySection: { marginBottom: 20 },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyTitle: { fontSize: 15, fontWeight: "700" },
  clearHistory: { fontSize: 13, fontWeight: "600" },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  historyText: { flex: 1, fontSize: 14 },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySubtitle: { fontSize: 14, textAlign: "center" },
  resultsHeader: { marginBottom: 12 },
  resultsCount: { fontSize: 13 },
  suggestionsContainer: { marginBottom: 20 },
  suggestionsTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  suggestionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionChipText: { fontSize: 13, fontWeight: "600" },
});
