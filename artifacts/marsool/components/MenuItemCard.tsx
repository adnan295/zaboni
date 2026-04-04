import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { MenuItem } from "@/data/restaurants";
import { useCart } from "@/context/CartContext";

interface Props {
  item: MenuItem;
  restaurantName: string;
}

export default function MenuItemCard({ item, restaurantName }: Props) {
  const colors = useColors();
  const { items, addItem, updateQuantity } = useCart();
  const cartItem = items.find((i) => i.id === item.id);
  const quantity = cartItem?.quantity ?? 0;

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem({
      id: item.id,
      name: item.nameAr,
      nameAr: item.nameAr,
      price: item.price,
      image: item.image,
      restaurantId: item.restaurantId,
      restaurantName,
    });
  };

  const handleDecrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(item.id, quantity - 1);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.content}>
        {item.isPopular && (
          <View style={[styles.popularBadge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.popularText, { color: colors.primary }]}>الأكثر طلباً</Text>
          </View>
        )}
        <Text style={[styles.name, { color: colors.foreground }]}>{item.nameAr}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
          {item.descriptionAr}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.primary }]}>{item.price} ر.س</Text>
          {quantity === 0 ? (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={handleAdd}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={[styles.quantityControl, { borderColor: colors.primary }]}>
              <TouchableOpacity onPress={handleDecrease} style={styles.qtyBtn}>
                <MaterialIcons name="remove" size={18} color={colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.quantity, { color: colors.primary }]}>{quantity}</Text>
              <TouchableOpacity onPress={handleAdd} style={styles.qtyBtn}>
                <MaterialIcons name="add" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  popularBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  popularText: {
    fontSize: 10,
    fontWeight: "700",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    overflow: "hidden",
  },
  qtyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quantity: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 20,
    textAlign: "center",
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
});
