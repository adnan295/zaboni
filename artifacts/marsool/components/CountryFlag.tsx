import React from "react";
import Svg, { Rect, Polygon } from "react-native-svg";
import Text from "@/components/AppText";
import type { CountryCode } from "@/data/countryCodes";

// Draw Syria explicitly: system flag emoji can still show an older design.
export default function CountryFlag({ country }: { country: CountryCode }) {
  if (country.country !== "SY") {
    return <Text style={{ fontSize: 20 }}>{country.flag}</Text>;
  }
  return (
    <Svg width={30} height={20} viewBox="0 0 90 60" accessible accessibilityLabel="علم سوريا بثلاث نجوم حمراء">
      <Rect width={90} height={20} fill="#007A3D" />
      <Rect y={20} width={90} height={20} fill="#FFFFFF" />
      <Rect y={40} width={90} height={20} fill="#000000" />
      {[22.5, 45, 67.5].map((x) => (
        <Polygon key={x} translateX={x} translateY={30} fill="#CE1126"
          points="0,-8 1.796,-2.472 7.608,-2.472 2.906,0.944 4.702,6.472 0,3.056 -4.702,6.472 -2.906,0.944 -7.608,-2.472 -1.796,-2.472" />
      ))}
    </Svg>
  );
}
