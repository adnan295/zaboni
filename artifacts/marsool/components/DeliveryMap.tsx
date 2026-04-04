import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { Coords } from "@/utils/geo";

interface DeliveryMapProps {
  userCoords: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  etaMinutes?: number | null;
  height?: number;
}

export function DeliveryMap({ userCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.gridBg}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 11}%` as unknown as number }]} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 11}%` as unknown as number }]} />
        ))}
      </View>

      <View style={styles.streetH} />
      <View style={styles.streetV} />

      {courierCoords && !isSearching && (
        <Animated.View style={[styles.courierPin, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.courierPinInner}>
            <MaterialIcons name="delivery-dining" size={20} color="#fff" />
          </View>
        </Animated.View>
      )}

      <View style={styles.userPin}>
        <View style={styles.userPinOuter}>
          <View style={styles.userPinInner} />
        </View>
      </View>

      {etaMinutes && !isSearching && (
        <View style={styles.etaBadge}>
          <MaterialIcons name="access-time" size={12} color="#fff" />
          <Text style={styles.etaText}>{etaMinutes} min</Text>
        </View>
      )}

      {userCoords && (
        <View style={styles.coordsOverlay}>
          <Text style={styles.coordsText}>
            {userCoords.latitude.toFixed(4)}, {userCoords.longitude.toFixed(4)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#e8f0e0",
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  gridBg: { ...StyleSheet.absoluteFillObject },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(180,200,160,0.5)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(180,200,160,0.5)",
  },
  streetH: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "60%",
    height: 14,
    backgroundColor: "rgba(200,215,185,0.8)",
  },
  streetV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "40%",
    width: 14,
    backgroundColor: "rgba(200,215,185,0.8)",
  },
  courierPin: {
    position: "absolute",
    top: "30%",
    left: "25%",
  },
  courierPinInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FF6B00",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  userPin: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -16 }, { translateY: -16 }],
  },
  userPinOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(59,130,246,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#3b82f6",
  },
  userPinInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
  },
  etaBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B00",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  etaText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  coordsOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  coordsText: { fontSize: 10, color: "#555" },
});
