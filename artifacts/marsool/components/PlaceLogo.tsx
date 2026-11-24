import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { default as Text } from "@/components/AppText";
import { buildImageUrl } from "@/lib/apiConfig";

/** A place's round logo; the first letter of its name when it has none (or it fails to load). */
export default function PlaceLogo({ logo, name, size = 44 }: { logo?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = logo && !failed ? buildImageUrl(logo) : undefined;
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.base, box]} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[styles.base, styles.fallback, box]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{name.trim().charAt(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: "#fee2e2", borderWidth: 2, borderColor: "#fff" },
  fallback: { backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  letter: { color: "#fff", fontWeight: "800" },
});
