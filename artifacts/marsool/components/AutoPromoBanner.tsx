import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { default as Text } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

// One eligible auto-apply promo as returned by GET /api/promos/eligible.
type EligiblePromo = {
  id: string;
  titleAr: string | null;
  appliesTo: string;
  target: "food" | "delivery";
  type: string; // "percent" | "fixed"
  value: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  restaurantId: string | null;
  firstOrderOnly: boolean;
  discountAmount: number;
};

// A human Arabic headline when the admin didn't set an explicit titleAr, so the
// banner always reads naturally. Mirrors how evaluatePromo interprets the promo.
function headlineFor(p: EligiblePromo): string {
  if (p.titleAr && p.titleAr.trim()) return p.titleAr.trim();
  const isFreeDelivery =
    p.target === "delivery" && p.type === "percent" && p.value >= 100;
  if (isFreeDelivery) return "توصيل مجاني";
  const onWhat = p.target === "delivery" ? "على التوصيل" : "على طلبك";
  if (p.type === "percent") return `خصم ${p.value}% ${onWhat}`;
  return `خصم ${p.value} ل.س ${onWhat}`;
}

function subtitleFor(p: EligiblePromo): string | null {
  const parts: string[] = [];
  if (p.firstOrderOnly) parts.push("لأول طلب");
  if (p.minOrderValue && p.minOrderValue > 0)
    parts.push(`بطلب من ${p.minOrderValue} ل.س`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Advertises the auto-apply promos the signed-in user is eligible for RIGHT NOW
 * (e.g. "توصيل مجاني لأول طلب"), so they see the offer BEFORE ordering. The
 * server already applies these at checkout; this is display-only and never
 * blocks the screen if the request fails.
 *
 * Pass `restaurantId` on a restaurant screen to also show that restaurant's
 * food promos; omit it on the home screen to show only global promos.
 */
export default function AutoPromoBanner({
  restaurantId,
  itemsTotal,
  deliveryFee,
}: {
  restaurantId?: string;
  itemsTotal?: number;
  deliveryFee?: number;
}) {
  const colors = useColors();
  const { token } = useAuth();
  const [promos, setPromos] = useState<EligiblePromo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) {
          setPromos([]);
          setLoading(false);
        }
        return;
      }
      try {
        const base = getApiBaseUrl();
        const params = new URLSearchParams();
        if (restaurantId) params.set("restaurantId", restaurantId);
        if (itemsTotal != null) params.set("itemsTotal", String(itemsTotal));
        if (deliveryFee != null) params.set("deliveryFee", String(deliveryFee));
        const qs = params.toString();
        const res = await fetch(
          `${base}/api/promos/eligible${qs ? "?" + qs : ""}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error("fetch failed");
        const data: { promos: EligiblePromo[] } = await res.json();
        if (!cancelled) setPromos(Array.isArray(data.promos) ? data.promos : []);
      } catch {
        if (!cancelled) setPromos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, restaurantId, itemsTotal, deliveryFee]);

  if (loading || promos.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {promos.map((p) => {
          const icon =
            p.target === "delivery" ? "local-shipping" : "local-offer";
          const subtitle = subtitleFor(p);
          return (
            <LinearGradient
              key={p.id}
              colors={["#DC2626", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.iconCircle}>
                <MaterialIcons name={icon} size={22} color="#FFFFFF" />
              </View>
              <View style={styles.textCol}>
                <Text weight="bold" style={styles.title}>
                  {headlineFor(p)}
                </Text>
                {subtitle ? (
                  <Text style={styles.subtitle}>{subtitle}</Text>
                ) : (
                  <Text style={styles.subtitle}>يُطبَّق تلقائيًا عند الدفع</Text>
                )}
              </View>
              <View style={styles.autoBadge}>
                <MaterialIcons name="bolt" size={12} color="#DC2626" />
                <Text weight="bold" style={styles.autoBadgeText}>
                  تلقائي
                </Text>
              </View>
            </LinearGradient>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 260,
    maxWidth: 320,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    textAlign: "right",
  },
  subtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  autoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 7,
    gap: 2,
    marginRight: 8,
  },
  autoBadgeText: {
    color: "#DC2626",
    fontSize: 11,
  },
});
