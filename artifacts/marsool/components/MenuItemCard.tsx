import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { MenuItem } from "@/data/restaurants";

interface Props {
  item: MenuItem;
}

export default function MenuItemCard({ item }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.content}>
        {item.isPopular && (
          <View style={[styles.popularBadge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.popularText, { color: colors.primary }]}>{t("restaurant.popular")}</Text>
          </View>
        )}
        <Text style={[styles.name, { color: colors.foreground }]}>{item.nameAr}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
          {item.descriptionAr}
        </Text>
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
    gap: 6,
    justifyContent: "center",
  },
  popularBadge: {
    alignSelf: "flex-end",
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
    textAlign: "right",
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right",
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
});
