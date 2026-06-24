import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, useColorScheme, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

async function fetchCourierSubStatus(token: string): Promise<{ isActive: boolean } | null> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/courier/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function CourierTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const { fontMedium } = useTypography();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { token } = useAuth();
  const [subChecked, setSubChecked] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchCourierSubStatus(token).then((status) => {
      if (status && !status.isActive) {
        router.replace("/courier-subscribe" as never);
      }
      setSubChecked(true);
    });
  }, [token, router]);

  if (!subChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const tabBarHeight = isAndroid ? 56 + insets.bottom : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
          ...(isAndroid ? { height: tabBarHeight, paddingBottom: insets.bottom } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          fontFamily: fontMedium,
        },
      }}
    >
      <Tabs.Screen
        name="available"
        options={{
          title: t("courierTabs.available"),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="list-alt" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: t("courierTabs.active"),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="delivery-dining" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("courierTabs.profile"),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
