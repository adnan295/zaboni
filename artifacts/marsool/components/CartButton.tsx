import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCart } from "@/context/CartContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CartButton() {
  const colors = useColors();
  const { totalItems, totalPrice } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (totalItems === 0) return null;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: colors.primary, bottom: insets.bottom + (Platform.OS === "web" ? 50 : 16) },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/cart");
      }}
      activeOpacity={0.9}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{totalItems}</Text>
      </View>
      <Text style={styles.label}>عرض السلة</Text>
      <Text style={styles.price}>{totalPrice} ر.س</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  label: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  price: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "700",
  },
});
