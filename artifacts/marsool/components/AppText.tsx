import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { useTypography, FontWeight } from "@/hooks/useTypography";

interface AppTextProps extends TextProps {
  weight?: FontWeight;
}

export default function AppText({ weight = "regular", style, ...props }: AppTextProps) {
  const { ff } = useTypography();
  return (
    <Text
      {...props}
      style={[{ fontFamily: ff(weight) }, StyleSheet.flatten(style) ?? {}]}
    />
  );
}
