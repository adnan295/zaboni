import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, useColorScheme, ActivityIndicator, TouchableOpacity } from "react-native";
import { default as Text } from "@/components/AppText";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

type SubStatusResult =
  | { state: "active" }
  | { state: "inactive" }
  | { state: "error" };

async function checkCourierSubStatus(token: string): Promise<SubStatusResult> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/courier/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { state: "error" };
    const body = await res.json();
    return body?.isActive === true ? { state: "active" } : { state: "inactive" };
  } catch {
    return { state: "error" };
  }
}

export default function CourierTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const { fontMedium, fontBold } = useTypography();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { token } = useAuth();

  const [gateState, setGateState] = useState<"loading" | "allowed" | "blocked" | "error">("loading");

  const checkSub = () => {
    if (!token) {
      setGateState("blocked");
      return;
    }
    setGateState("loading");
    checkCourierSubStatus(token).then((result) => {
      if (result.state === "active") {
        setGateState("allowed");
      } else if (result.state === "inactive") {
        router.replace("/courier-subscribe" as never);
      } else {
        setGateState("error");
      }
    });
  };

  useEffect(() => {
    checkSub();
  }, [token]);

  if (gateState === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (gateState === "blocked") {
    // No auth token — a logged-out user should never reach the courier tabs.
    // Render nothing and let the root AuthGate redirect to auth/onboarding
    // instead of mounting the courier screens, which require a token.
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }} />
    );
  }

  if (gateState === "error") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 32 }}>
        <MaterialIcons name="wifi-off" size={56} color={colors.mutedForeground} />
        <Text style={{ color: colors.foreground, fontFamily: fontBold, fontSize: 18, textAlign: "center", marginTop: 16, marginBottom: 8 }}>
          تعذّر التحقق من الاشتراك
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: fontMedium, fontSize: 14, textAlign: "center", marginBottom: 24 }}>
          تأكد من اتصالك بالإنترنت ثم حاول مجدداً
        </Text>
        <TouchableOpacity
          onPress={checkSub}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 }}
        >
          <Text style={{ color: "#fff", fontFamily: fontBold, fontSize: 15 }}>إعادة المحاولة</Text>
        </TouchableOpacity>
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
