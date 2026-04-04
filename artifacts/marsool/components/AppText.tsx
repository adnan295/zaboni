import React from "react";
import { Text, TextProps } from "react-native";
import { useTypography, FontWeight } from "@/hooks/useTypography";

interface AppTextProps extends TextProps {
  weight?: FontWeight;
}

export default function AppText({ weight = "regular", style, ...props }: AppTextProps) {
  const { ff } = useTypography();
  return (
    <Text
      {...props}
      style={[{ fontFamily: ff(weight) }, ...(Array.isArray(style) ? style : style != null ? [style] : [])]}
    />
  );
}
