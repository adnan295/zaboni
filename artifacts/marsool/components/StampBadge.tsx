import React from "react";
import { StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { default as Text } from "@/components/AppText";

/** The small «اطلب واربح» pill on the photo of a restaurant that runs stamp cards. */
export default function StampBadge({ style }: { style?: object }) {
  return (
    <View style={[styles.badge, style]} accessibilityLabel="اطلب واربح">
      <MaterialIcons name="card-giftcard" size={12} color="#B91C1C" />
      <Text style={styles.text}>اطلب واربح</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  text: { fontSize: 11, fontWeight: "800", color: "#B91C1C" },
});
