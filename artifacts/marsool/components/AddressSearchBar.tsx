import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";

const DAMASCUS_NEIGHBORHOODS = [
  "المزة، دمشق",
  "كفرسوسة، دمشق",
  "المالكي، دمشق",
  "أبو رمانة، دمشق",
  "الشعلان، دمشق",
  "الروضة، دمشق",
  "المهاجرين، دمشق",
  "الجسر الأبيض، دمشق",
  "باب توما، دمشق",
  "القيمرية، دمشق",
  "ساروجة، دمشق",
  "بساتين الرازي، دمشق",
  "الميدان، دمشق",
  "القدم، دمشق",
  "الأمين، دمشق",
  "الزاهرة، دمشق",
  "ركن الدين، دمشق",
  "المرجة، دمشق",
  "الحلبوني، دمشق",
  "الصالحية، دمشق",
  "دمر، دمشق",
  "جرمانا، ريف دمشق",
  "قدسيا، ريف دمشق",
  "الهامة، دمشق",
  "داريا، ريف دمشق",
  "عدرا، ريف دمشق",
  "شارع بغداد، دمشق",
  "شارع الثورة، دمشق",
  "ساحة الأمويين، دمشق",
  "السوق الحميدية، دمشق",
];

const DAMASCUS_NEIGHBORHOODS_EN = [
  "Mezzeh, Damascus",
  "Kafr Sousa, Damascus",
  "Al Malki, Damascus",
  "Abu Rummaneh, Damascus",
  "Al Sha'lan, Damascus",
  "Al Rawda, Damascus",
  "Al Muhajirin, Damascus",
  "Al Jisr Al Abyad, Damascus",
  "Bab Touma, Damascus",
  "Al Qaymariyya, Damascus",
  "Sarouja, Damascus",
  "Bsat Al Razi, Damascus",
  "Midan, Damascus",
  "Al Qadam, Damascus",
  "Al Amin, Damascus",
  "Al Zahira, Damascus",
  "Rukn Al Din, Damascus",
  "Al Marjeh, Damascus",
  "Halbouni, Damascus",
  "Al Salihiyya, Damascus",
  "Dummar, Damascus",
  "Jaramana, Rif Dimashq",
  "Qudsaya, Rif Dimashq",
  "Al Hama, Damascus",
  "Daraya, Rif Dimashq",
  "Adra, Rif Dimashq",
  "Baghdad Street, Damascus",
  "Al Thawra Street, Damascus",
  "Umayyad Square, Damascus",
  "Al Hamidiyya Souk, Damascus",
];

const GOOGLE_PLACES_KEY = typeof process !== "undefined"
  ? process.env?.["EXPO_PUBLIC_GOOGLE_MAPS_KEY"] ?? ""
  : "";

interface Coords { latitude: number; longitude: number }

async function fetchGooglePlaces(query: string, sessionToken: string, userCoords?: Coords): Promise<string[]> {
  if (!GOOGLE_PLACES_KEY) return [];
  try {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_KEY}&language=ar&components=country:SY&sessiontoken=${sessionToken}`;
    if (userCoords) {
      url += `&location=${userCoords.latitude},${userCoords.longitude}&radius=15000&strictbounds=false`;
    }
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK") return [];
    return (data.predictions as Array<{ description: string }>).map((p) => p.description);
  } catch {
    return [];
  }
}

interface AddressSearchBarProps {
  onSelect: (address: string) => void;
  placeholder?: string;
  userCoords?: Coords;
}

export function AddressSearchBar({ onSelect, placeholder, userCoords }: AddressSearchBarProps) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const isAr = i18n.language === "ar";

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const sessionToken = useRef(`${Date.now()}_${Math.random()}`).current;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allNeighborhoods = isAr ? DAMASCUS_NEIGHBORHOODS : DAMASCUS_NEIGHBORHOODS_EN;

  const search = useCallback(async (text: string) => {
    if (text.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const lower = text.toLowerCase();
    const local = allNeighborhoods.filter((n) =>
      n.toLowerCase().includes(lower)
    ).slice(0, 5);

    if (GOOGLE_PLACES_KEY) {
      const google = await fetchGooglePlaces(text, sessionToken, userCoords);
      const combined = [...new Set([...google.slice(0, 4), ...local])].slice(0, 6);
      setSuggestions(combined);
    } else {
      setSuggestions(local);
    }
    setShowSuggestions(true);
  }, [allNeighborhoods, sessionToken, userCoords]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(text), 350);
  };

  const handleSelect = (item: string) => {
    setQuery(item);
    setSuggestions([]);
    setShowSuggestions(false);
    onSelect(item);
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <MaterialIcons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder ?? t("map.searchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={handleChangeText}
          textAlign={isAr ? "right" : "left"}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(""); setSuggestions([]); setShowSuggestions(false); }}>
            <MaterialIcons name="close" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FlatList
            data={suggestions}
            keyExtractor={(item, i) => `${i}_${item}`}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestion} onPress={() => handleSelect(item)}>
                <MaterialIcons name="location-on" size={16} color="#DC2626" />
                <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", zIndex: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },
  sep: { height: 1 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
