import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { buildImageUrl } from "@/lib/apiConfig";
import SkeletonBox from "@/components/SkeletonBox";
import { cardShadow } from "@/constants/colors";

interface HRestaurant {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  rating: number;
  deliveryTime: string;
  deliveryFee: number;
  isOpen: boolean;
  isLogo: boolean;
  discount: string | null;
  hasFlashDeal?: boolean;
  flashDealEndsAt?: string | null;
}

interface Props {
  restaurant: HRestaurant;
  onPress: () => void;
  variant?: "default" | "deal";
  badge?: string;
}

function getCountdown(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0 || Number.isNaN(ms)) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function FlashDealBadge({ endsAt }: { endsAt: string }) {
  const [countdown, setCountdown] = useState<string | null>(() => getCountdown(endsAt));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCountdown(getCountdown(endsAt));
    timerRef.current = setInterval(() => {
      const next = getCountdown(endsAt);
      setCountdown(next);
      if (next === null && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [endsAt]);

  if (countdown === null) return null;

  return (
    <View style={styles.flashBadgeWrap}>
      <View style={styles.flashBadge}>
        <Text style={styles.flashBadgeText}>عرض محدود</Text>
      </View>
      <View style={styles.countdownWrap}>
        <MaterialIcons name="timer" size={9} color="#fff" />
        <Text style={styles.countdownText}>ينتهي خلال {countdown}</Text>
      </View>
    </View>
  );
}

export function HorizontalRestaurantCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <SkeletonBox width={220} height={120} borderRadius={0} />
      <View style={[styles.info, { gap: 8 }]}>
        <SkeletonBox width={110} height={12} borderRadius={6} />
        <SkeletonBox width={80} height={10} borderRadius={6} />
      </View>
    </View>
  );
}

/** "30-45", "30-45 د" or "30-45 دقيقة" → "30-45": the word is added once, by the screen. */
export function minutesRange(deliveryTime: string | null | undefined): string {
  return String(deliveryTime ?? "").replace(/\s*(دقيقة|دقائق|د\.?|min\.?|mins)\s*$/i, "").trim();
}

/**
 * The range for display, kept left-to-right inside Arabic text so "30-45" never
 * shows up as "45-30" (Unicode isolate marks around it).
 */
export function minutesRangeText(deliveryTime: string | null | undefined): string {
  return `\u2066${minutesRange(deliveryTime)}\u2069`;
}

/** Ratings always with one decimal: 4 → "4.0", none yet → "جديد". */
export function formatRating(r: number | null | undefined): string {
  return r && r > 0 ? r.toFixed(1) : "جديد";
}

export default function HorizontalRestaurantCard({ restaurant, onPress, variant = "default", badge }: Props) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isDeal = variant === "deal";
  const hasFlashDeal = restaurant.hasFlashDeal ?? !!(restaurant as unknown as Record<string, unknown>)["hasFlashDeal"];
  const flashDealEndsAt = restaurant.flashDealEndsAt ?? (restaurant as unknown as Record<string, unknown>)["flashDealEndsAt"] as string | null | undefined;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.imageWrap,
          restaurant.isLogo && { backgroundColor: "#fff", alignItems: "center" as const, justifyContent: "center" as const },
        ]}
      >
        <Image
          source={{ uri: buildImageUrl(restaurant.image) }}
          style={restaurant.isLogo ? styles.logoImage : styles.image}
          contentFit={restaurant.isLogo ? "contain" : "cover"}
          transition={200}
        />
        {!restaurant.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>{t("restaurant.closed")}</Text>
          </View>
        )}
        {hasFlashDeal && flashDealEndsAt ? (
          <FlashDealBadge endsAt={flashDealEndsAt} />
        ) : hasFlashDeal ? (
          <View style={styles.flashBadgeStandalone}>
            <View style={styles.flashBadge}>
              <Text style={styles.flashBadgeText}>عرض محدود</Text>
            </View>
          </View>
        ) : null}
        {!!restaurant.discount && !hasFlashDeal && (
          <View style={[styles.badge, { backgroundColor: colors.offer }]}>
            <Text style={[styles.badgeText, { color: colors.offerForeground }]}>
              {restaurant.discount}
            </Text>
          </View>
        )}
        {!!badge && (
          <View style={styles.reorderBadge}>
            <MaterialIcons name="replay" size={9} color="#fff" />
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {isAr ? restaurant.nameAr : restaurant.name}
        </Text>
        {/* One line, same order everywhere: rating · time (the fee is on the big card and the page) */}
        <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
          <Text style={{ color: colors.warning }}>★</Text> {formatRating(restaurant.rating)}
          {"  ·  "}{minutesRangeText(restaurant.deliveryTime)} {t("restaurant.minutesLong", "دقيقة")}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    borderRadius: 16,
    overflow: "hidden",
    ...cardShadow,
  },
  imageWrap: { position: "relative", height: 120 },
  image: { width: "100%", height: 120 },
  logoImage: { width: "80%", height: "100%" },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reorderBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  flashBadgeWrap: {
    position: "absolute",
    top: 8,
    left: 8,
    gap: 4,
  },
  flashBadgeStandalone: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  flashBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  flashBadgeText: { fontSize: 11, fontWeight: "700", color: "#92400E" },
  countdownWrap: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countdownText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  info: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  name: { fontSize: 16, fontWeight: "700", textAlign: "left" },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 13, textAlign: "left" },
  sep: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 2 },
});
