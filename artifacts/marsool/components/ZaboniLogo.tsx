import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { default as Text } from "@/components/AppText";

type LogoSize = "small" | "medium" | "large";

interface ZaboniLogoProps {
  size?: LogoSize;
  showName?: boolean;
  nameColor?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZE_MAP: Record<LogoSize, { box: number; radius: number; name: number; shadow: number; gap: number }> = {
  small:  { box: 48,  radius: 14, name: 14, shadow: 8,  gap: 6  },
  medium: { box: 72,  radius: 20, name: 18, shadow: 12, gap: 10 },
  large:  { box: 100, radius: 28, name: 22, shadow: 16, gap: 14 },
};

const ICON = require("../assets/images/icon.png");

export default function ZaboniLogo({ size = "large", showName = false, nameColor = "#DC2626", style }: ZaboniLogoProps) {
  const s = SIZE_MAP[size];
  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={ICON}
        style={{
          width: s.box,
          height: s.box,
          borderRadius: s.radius,
          shadowColor: "#DC2626",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: s.shadow,
          elevation: 8,
        }}
        resizeMode="cover"
      />
      {showName && (
        <Text
          weight="extrabold"
          style={{ fontSize: s.name, color: nameColor, marginTop: s.gap, textAlign: "center", letterSpacing: 0.5 }}
        >
          زبوني
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
});
