import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Props {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function SkeletonBox({ width, height, borderRadius = 8, style }: Props) {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [translateX]);

  const baseColor = colors.card === "#ffffff" || colors.card === "#fff" ? "#E8E8E8" : "#2A2A2A";
  const shimmerColor = colors.card === "#ffffff" || colors.card === "#fff" ? "#F4F4F4" : "#383838";

  const shimmerTranslate = translateX.interpolate({
    inputRange: [-1, 1],
    outputRange: typeof width === "number"
      ? [-width, width]
      : [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: baseColor, overflow: "hidden" },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: shimmerTranslate }] },
        ]}
      >
        <LinearGradient
          colors={[baseColor, shimmerColor, shimmerColor, baseColor]}
          locations={[0, 0.35, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
