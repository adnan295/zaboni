import React from "react";
import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface BackButtonProps {
  onPress: () => void;
  color?: string;
  style?: ViewStyle;
  size?: number;
}

export default function BackButton({ onPress, color, style, size = 22 }: BackButtonProps) {
  const { isRTL } = useLanguage();
  const colors = useColors();
  const iconColor = color ?? colors.foreground;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, style]}>
      <MaterialIcons
        name={isRTL ? "arrow-forward" : "arrow-back"}
        size={size}
        color={iconColor}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4, width: 40 },
});
