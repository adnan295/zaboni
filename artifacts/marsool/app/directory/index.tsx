import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useAddresses } from "@/context/AddressContext";
import DirectoryMap from "@/components/DirectoryMap";
import { Coords, haversineDistance } from "@/utils/geo";

interface ListPlace {
  id: string;
  nameAr: string;
  lat: number;
  lon: number;
  district: string;
  category: string;
  itemCount: number;
  cover: string | null;
  matches?: string[];
}

interface ListResponse {
  places: ListPlace[];
  categories: { category: string; count: number }[];
}

const SEARCH_DEBOUNCE_MS = 300;

export default function DirectoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { defaultAddress } = useAddresses();

  const home: Coords | null = defaultAddress?.latitude != null && defaultAddress?.longitude != null
    ? { latitude: defaultAddress.latitude, longitude: defaultAddress.longitude }
    : null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [data, setData] = useState<ListResponse | null>(null);
  const [categories, setCategories] = useState<ListResponse["categories"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async (q: string, cat: string | null) => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (cat) params.set("category", cat);
      const res = await customFetch<ListResponse>(`/api/directory/places${params.toString() ? `?${params}` : ""}`);
      if (mine !== requestId.current) return; // a newer search already answered
      // Nothing imported yet: the typed free order is all there is, so go straight to it.
      if (!q.trim() && !cat && res.places.length === 0) {
        router.replace("/errand-request" as any);
        return;
      }
      loadedOnce.current = true;
      setData(res);
      // Keep the full category list from the unfiltered load so chips do not vanish.
      if (!q.trim() && !cat) setCategories(res.categories);
    } catch {
      if (mine !== requestId.current) return;
      // The very first load failing (an older server without the directory, or no
      // network) must not block ordering: fall back to the typed free order.
      if (!loadedOnce.current) {
        router.replace("/errand-request" as any);
        return;
      }
      setError(true);
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const id = setTimeout(() => { void load(query, category); }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(id);
  }, [query, category, load]);

  // Nearest first from the delivery address; alphabetical when it is unknown.
  const places = useMemo(() => {
    const list = (data?.places ?? []).map((p) => ({
      ...p,
      km: home ? haversineDistance(home, { latitude: p.lat, longitude: p.lon }) : null,
    }));
    return list.sort((a, b) => (a.km != null && b.km != null ? a.km - b.km : a.nameAr.localeCompare(b.nameAr, "ar")));
  }, [data, home?.latitude, home?.longitude]);

  const openPlace = useCallback((id: string) => router.push(`/directory/${id}` as any), [router]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel={t("common.back", "رجوع")}>
            <MaterialIcons name={backIcon} size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("directory.title")}</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setView((v) => (v === "list" ? "map" : "list"))}
            accessibilityLabel={view === "list" ? t("directory.map") : t("directory.list")}
          >
            <MaterialIcons name={view === "list" ? "map" : "list"} size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder={t("directory.searchPlaceholder")}
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            textAlign="right"
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="مسح">
              <MaterialIcons name="close" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsBar}>
          {[{ category: null as string | null, count: 0 }, ...categories].map((c) => {
            const active = category === c.category;
            return (
              <TouchableOpacity
                key={c.category ?? "_all"}
                onPress={() => setCategory(c.category)}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
              >
                <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>
                  {c.category ?? t("directory.all")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>{t("directory.loadError")}</Text>
          <TouchableOpacity onPress={() => load(query, category)} style={[styles.retry, { borderColor: colors.primary }]}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("directory.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : view === "map" ? (
        <DirectoryMap places={places} home={home} onSelect={openPlace} />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t("directory.empty")}</Text>
          )}
          ListFooterComponent={(
            <TouchableOpacity onPress={() => router.push("/errand-request" as any)} style={styles.notListed}>
              <MaterialIcons name="add-location-alt" size={18} color={colors.primary} />
              <Text style={[styles.notListedText, { color: colors.primary }]}>{t("directory.notListed")}</Text>
            </TouchableOpacity>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => openPlace(item.id)}
              activeOpacity={0.85}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: "#fee2e2" }]}>
                <MaterialIcons name={item.category === "كافيه" ? "local-cafe" : "restaurant"} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{item.nameAr}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {[item.category, item.district, item.itemCount ? t("directory.itemsCount", { count: item.itemCount }) : null].filter(Boolean).join(" · ")}
                </Text>
                {item.matches?.length ? (
                  <Text style={[styles.matches, { color: colors.primary }]} numberOfLines={1}>{item.matches.join("، ")}</Text>
                ) : null}
              </View>
              {item.km != null && (
                <Text style={[styles.km, { color: colors.mutedForeground }]}>
                  {t("directory.kmAway", { km: item.km < 10 ? item.km.toFixed(1) : Math.round(item.km) })}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: "#111827", paddingVertical: 0 },
  chipsBar: { flexGrow: 0, flexShrink: 0, minHeight: 54 },
  chips: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  matches: { fontSize: 12, fontWeight: "600" },
  km: { fontSize: 12 },
  empty: { textAlign: "center", marginTop: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retry: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  notListed: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16 },
  notListedText: { fontSize: 14, fontWeight: "700" },
});
