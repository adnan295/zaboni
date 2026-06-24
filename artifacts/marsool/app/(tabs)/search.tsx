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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useRouter } from "expo-router";
import RestaurantCard from "@/components/RestaurantCard";
import { customFetch } from "@workspace/api-client-react";
import * as Location from "expo-location";

type SortOption = "priority" | "fastest" | "rating" | "delivery_fee";

const HISTORY_KEY = "@marsool_search_history";
const MAX_HISTORY = 5;

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

export default function SearchTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isAr = i18n.language === "ar";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RestaurantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [openOnly, setOpenOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  const saveHistory = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: q.trim(), sortBy });
      if (openOnly) params.set("openOnly", "1");
      if (userLocation) {
        params.set("lat", String(userLocation.lat));
        params.set("lon", String(userLocation.lon));
      }
      const data = await customFetch<RestaurantItem[]>(`/api/restaurants?${params.toString()}`);
      setResults(data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, openOnly, userLocation]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 400);
  };

  const handleSubmit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query);
    saveHistory(query);
  };

  const handleHistoryTap = (h: string) => {
    setQuery(h);
    doSearch(h);
    saveHistory(h);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const SORT_OPTIONS: { key: SortOption; label: string }[] = [
    { key: "priority", label: t("search.sort.recommended") },
    { key: "rating",   label: t("search.sort.rating") },
    { key: "fastest",  label: t("search.sort.fastest") },
    { key: "delivery_fee", label: t("search.sort.fee") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }}>
              <MaterialIcons name="close" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sort / Filter row */}
      {query.trim().length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRowWrap} contentContainerStyle={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.sortChip,
                { backgroundColor: sortBy === opt.key ? colors.primary : colors.card,
                  borderColor: sortBy === opt.key ? colors.primary : colors.border },
              ]}
              onPress={() => { setSortBy(opt.key); doSearch(query); }}
            >
              <Text style={[styles.sortChipText, { color: sortBy === opt.key ? "#fff" : colors.foreground }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.sortChip,
              { backgroundColor: openOnly ? colors.primary : colors.card,
                borderColor: openOnly ? colors.primary : colors.border,
                flexDirection: "row", gap: 4 },
            ]}
            onPress={() => { setOpenOnly((p) => !p); doSearch(query); }}
          >
            <MaterialIcons name="store" size={13} color={openOnly ? "#fff" : colors.foreground} />
            <Text style={[styles.sortChipText, { color: openOnly ? "#fff" : colors.foreground }]}>
              {t("home.openOnly")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {!loading && query.trim() === "" && history.length > 0 && (
        <View style={styles.historyWrap}>
          <Text style={[styles.historyTitle, { color: colors.mutedForeground }]}>{t("search.recentSearches")}</Text>
          {history.map((h) => (
            <TouchableOpacity key={h} style={styles.historyRow} onPress={() => handleHistoryTap(h)}>
              <MaterialIcons name="history" size={16} color={colors.mutedForeground} />
              <Text style={[styles.historyText, { color: colors.foreground }]}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!loading && query.trim() !== "" && results.length === 0 && (
        <View style={styles.center}>
          <MaterialIcons name="search-off" size={48} color={colors.mutedForeground} />
          <Text style={[styles.noResult, { color: colors.mutedForeground }]}>
            {t("search.noResults")} «{query.trim()}»
          </Text>
          <Text style={[styles.noResultSub, { color: colors.mutedForeground }]}>
            {t("search.noResultsSub")}
          </Text>
        </View>
      )}

      {!loading && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
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
  sortRowWrap: { flexGrow: 0 },
  sortRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  sortChipText: { fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  noResult: { fontSize: 15, textAlign: "center" },
  noResultSub: { fontSize: 13, textAlign: "center", opacity: 0.7 },
  historyWrap: { paddingHorizontal: 16, paddingTop: 16 },
  historyTitle: { fontSize: 13, marginBottom: 8 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  historyText: { fontSize: 15 },
});
