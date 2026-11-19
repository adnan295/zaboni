import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Text from "@/components/AppText";
import { useForwardIcon } from "@/hooks/useTypography";
import { K } from "@/constants/kitchenTheme";
import { fetchKitchenConfig } from "@/lib/kitchenApi";

/**
 * The door from the main app into the "بيتي وصحّي" section. Renders nothing until the
 * admin switches the section on, so shipping it in a build changes nothing by itself.
 */
export default function KitchenDoorCard() {
  const router = useRouter();
  const { t } = useTranslation();
  const forwardIcon = useForwardIcon();
  const { data } = useQuery({ queryKey: ["kitchen-config"], queryFn: fetchKitchenConfig, staleTime: 5 * 60 * 1000 });
  if (!data?.enabled) return null;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => router.push("/kitchen")}>
      <View style={styles.leaf}>
        <MaterialCommunityIcons name="leaf" size={26} color={K.green} />
      </View>
      <View style={styles.body}>
        <Text weight="extrabold" style={styles.title}>{data.title || t("kitchen.defaultTitle")}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{t("kitchen.door.subtitle")}</Text>
      </View>
      <View style={styles.cta}>
        <Text weight="bold" style={styles.ctaText}>{t("kitchen.door.cta")}</Text>
        <MaterialIcons name={forwardIcon} size={16} color={K.green} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 18,
    backgroundColor: K.green, flexDirection: "row", alignItems: "center", gap: 12,
  },
  leaf: { width: 48, height: 48, borderRadius: 24, backgroundColor: K.sage, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  title: { color: "#fff", fontSize: 18, textAlign: "left" },
  subtitle: { color: "#CFE0D2", fontSize: 12.5, marginTop: 2, textAlign: "left" },
  cta: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: K.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  ctaText: { color: K.green, fontSize: 13 },
});
