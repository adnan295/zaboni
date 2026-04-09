import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Platform,
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

interface Slide {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    icon: "delivery-dining",
    titleAr: "أهلاً بك في مرسول",
    titleEn: "Welcome to Marsool",
    bodyAr: "منصة التوصيل الأسرع في دمشق — اطلب أي شيء وسنوصّله إلى بابك.",
    bodyEn: "Damascus's fastest delivery platform — order anything and we'll bring it to your door.",
    color: "#FF6B00",
  },
  {
    id: "how",
    icon: "assignment",
    titleAr: "كيف تطلب؟",
    titleEn: "How it works",
    bodyAr: "اكتب طلبك بكل حرية، سيتلقّاه أقرب المندوبين ويقبله في ثوانٍ.",
    bodyEn: "Write your order freely — the nearest courier receives it and accepts within seconds.",
    color: "#FF8C35",
  },
  {
    id: "track",
    icon: "location-on",
    titleAr: "تابع توصيلك مباشرةً",
    titleEn: "Track your delivery live",
    bodyAr: "راقب موقع المندوب على الخريطة لحظة بلحظة، وتحدّث معه مباشرةً.",
    bodyEn: "Watch the courier on the live map and chat with them directly.",
    color: "#E55A00",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const topPadding = Platform.OS === "web" ? 60 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 40 : insets.bottom;

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    router.replace("/auth/phone");
  }

  function next() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      setActiveIndex(activeIndex + 1);
    } else {
      finish();
    }
  }

  async function skip() {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    router.replace("/auth/phone");
  }

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={skip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
            {isAr ? "تخطي" : "Skip"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + "18" }]}>
              <View style={[styles.iconInner, { backgroundColor: item.color }]}>
                <MaterialIcons name={item.icon} size={64} color="#fff" />
              </View>
            </View>
            <Text style={[styles.slideTitle, { color: colors.foreground }]}>
              {isAr ? item.titleAr : item.titleEn}
            </Text>
            <Text style={[styles.slideBody, { color: colors.mutedForeground }]}>
              {isAr ? item.bodyAr : item.bodyEn}
            </Text>
          </View>
        )}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(idx);
        }}
      />

      <View style={[styles.footer, { paddingBottom: bottomPadding + 16 }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
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
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {isLast ? (isAr ? "ابدأ الآن" : "Get Started") : (isAr ? "التالي" : "Next")}
          </Text>
          {!isLast && (
            <MaterialIcons
              name={isAr ? "arrow-back" : "arrow-forward"}
              size={20}
              color="#fff"
            />
          )}
          {isLast && <MaterialIcons name="check" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipRow: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { fontSize: 14, fontWeight: "600" },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 28,
  },
  iconCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  slideTitle: { fontSize: 28, fontWeight: "800", textAlign: "center" },
  slideBody: { fontSize: 16, textAlign: "center", lineHeight: 26 },
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
