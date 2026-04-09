import React from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import type { MenuItem } from "@workspace/api-client-react";

interface Props {
  item: MenuItem;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

export default function MenuItemCard({ item, quantity = 0, onAdd, onRemove }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  const scaleRef = React.useRef(new Animated.Value(1)).current;

  const handleAdd = () => {
    if (!onAdd) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scaleRef, { toValue: 1.12, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleRef, { toValue: 1, useNativeDriver: true, speed: 60 }),
    ]).start();
    onAdd();
  };

  const handleRemove = () => {
    if (!onRemove) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove();
  };

  const hasPrice = item.price != null && item.price > 0;
  const inCart = quantity > 0;

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: inCart ? colors.primary : colors.border, transform: [{ scale: scaleRef }] }]}>
      <View style={styles.content}>
        <View style={styles.topRow}>
          {item.isPopular && (
            <View style={[styles.popularBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.popularText, { color: colors.primary }]}>{t("restaurant.popular")}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{item.nameAr}</Text>
        {item.descriptionAr ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
            {item.descriptionAr}
          </Text>
        ) : null}

        <View style={styles.bottomRow}>
          {hasPrice && (
            <View style={[styles.priceBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.price, { color: colors.primary }]}>
                {item.price.toLocaleString()} ل.س
              </Text>
            </View>
          )}

          {onAdd ? (
            inCart ? (
              <View style={[styles.qtyControl, { backgroundColor: colors.primary }]}>
                <TouchableOpacity onPress={handleRemove} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="remove" size={16} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{quantity}</Text>
                <TouchableOpacity onPress={handleAdd} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={handleAdd}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </View>

      <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 5,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  popularBadge: {
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularText: {
    fontSize: 10,
    fontWeight: "700",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  price: {
    fontSize: 13,
    fontWeight: "800",
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 8,
  },
  qtyBtn: {
    padding: 2,
  },
  qtyText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    minWidth: 16,
    textAlign: "center",
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
});
