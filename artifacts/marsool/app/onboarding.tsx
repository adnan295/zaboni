import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Platform,
  I18nManager,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ONBOARDING_SEEN_KEY = "marsool_onboarding_seen_v1";

const SLIDE_ICONS: Array<{
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}> = [
  { icon: "restaurant-menu", color: "#FF6B00" },
  { icon: "delivery-dining",  color: "#FF8C35" },
  { icon: "payments",         color: "#E55A00" },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const topPadding = Platform.OS === "web" ? 60 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 40 : insets.bottom;

  const slides = t("onboarding.slides", { returnObjects: true }) as Array<{
    title: string;
    body: string;
  }>;

  const isLast = activeIndex === slides.length - 1;

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    router.replace("/auth/phone");
  }

  async function skip() {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    router.replace("/auth/phone");
  }

  function handleNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeIndex < slides.length - 1) {
      const nextIdx = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setActiveIndex(nextIdx);
    } else {
      finish();
    }
  }

  function handleScrollEnd(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const raw = e.nativeEvent.contentOffset.x / SCREEN_WIDTH;
    const idx = Math.round(Math.abs(raw));
    setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
  }

  const isRTL = I18nManager.isRTL;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={skip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
            {t("onboarding.skip")}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        bounces={false}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item, index }) => {
          const meta = SLIDE_ICONS[index] ?? SLIDE_ICONS[0];
          return (
            <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <View style={[styles.iconCircle, { backgroundColor: meta.color + "18" }]}>
                <View style={[styles.iconInner, { backgroundColor: meta.color, shadowColor: meta.color }]}>
                  <MaterialIcons name={meta.icon} size={72} color="#fff" />
                </View>
              </View>
              <Text style={[styles.slideTitle, { color: colors.foreground }]}>
                {item.title}
              </Text>
              <Text style={[styles.slideBody, { color: colors.mutedForeground }]}>
                {item.body}
              </Text>
            </View>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: bottomPadding + 16 }]}>
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex
                  ? { backgroundColor: "#FF6B00", width: 24 }
                  : { backgroundColor: colors.border, width: 8 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: "#FF6B00" }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          {isLast ? (
            <>
              <Text style={styles.nextBtnText}>{t("onboarding.start")}</Text>
              <MaterialIcons name="check" size={20} color="#fff" />
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>{t("onboarding.next")}</Text>
              <MaterialIcons
                name={isRTL ? "arrow-back" : "arrow-forward"}
                size={20}
                color="#fff"
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipRow: {
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { fontSize: 14, fontWeight: "600" },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 28,
  },
  iconCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 152,
    height: 152,
    borderRadius: 76,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 38,
  },
  slideBody: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 20,
    paddingTop: 8,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    height: 58,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnText: { fontSize: 18, fontWeight: "700", color: "#fff" },
});
