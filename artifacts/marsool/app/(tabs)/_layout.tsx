import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, useRouter } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { I18nManager, Platform, StyleSheet, TouchableOpacity, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useTypography } from "@/hooks/useTypography";
import { useOrders } from "@/context/OrderContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

const BADGE_RED = "#DC2626";

type TabType = "home" | "favorites" | "orders" | "profile" | "offers" | "search" | "errand";

type TabBarItem = {
  type: TabType;
  labelAr: string;
  order: number;
};

const DEFAULT_TAB_BAR: TabBarItem[] = [
  { type: "home",      labelAr: "الرئيسية", order: 0 },
  { type: "favorites", labelAr: "المفضلة",  order: 1 },
  { type: "orders",    labelAr: "طلباتي",   order: 2 },
  { type: "errand",    labelAr: "اطلب",     order: 3 },
  { type: "profile",   labelAr: "حسابي",    order: 4 },
];

const TAB_SCREEN_NAME: Record<TabType, string> = {
  home:      "index",
  favorites: "favorites",
  orders:    "orders",
  profile:   "profile",
  offers:    "offers",
  search:    "search",
  errand:    "errand",
};

type TabDef = {
  sfDefault:  string;
  sfSelected: string;
  feather:    string;
};

const TAB_DEF: Record<TabType, TabDef> = {
  home:      { sfDefault: "house",             sfSelected: "house.fill",              feather: "home"          },
  favorites: { sfDefault: "heart",             sfSelected: "heart.fill",              feather: "heart"         },
  orders:    { sfDefault: "bag",               sfSelected: "bag.fill",                feather: "package"       },
  profile:   { sfDefault: "person",            sfSelected: "person.fill",             feather: "user"          },
  offers:    { sfDefault: "tag",               sfSelected: "tag.fill",                feather: "tag"           },
  search:    { sfDefault: "magnifyingglass",   sfSelected: "magnifyingglass",         feather: "search"        },
  errand:    { sfDefault: "bag.badge.plus",    sfSelected: "bag.badge.plus",          feather: "shopping-bag"  },
};

const ALL_TAB_TYPES: TabType[] = ["home", "favorites", "orders", "profile", "offers", "search", "errand"];

async function fetchTabBarConfig(): Promise<TabBarItem[]> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/config/tab-bar`);
    if (!res.ok) return DEFAULT_TAB_BAR;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : DEFAULT_TAB_BAR;
  } catch {
    return DEFAULT_TAB_BAR;
  }
}

function NativeTabLayout({ config }: { config: TabBarItem[] }) {
  const { t } = useTranslation();
  const { activeOrder } = useOrders();

  const labelFor = (item: TabBarItem) => {
    if (item.labelAr && item.labelAr.trim()) return item.labelAr;
    const translated = t(`tabs.${item.type}` as any);
    return translated && !translated.startsWith("tabs.") ? translated : item.type;
  };

  return (
    <NativeTabs>
      {config.map((item) => {
        const def = TAB_DEF[item.type];
        const name = TAB_SCREEN_NAME[item.type];
        const badge = item.type === "orders" ? (activeOrder ? "!" : undefined) : undefined;
        return (
          <NativeTabs.Trigger key={item.type} name={name} badge={badge}>
            <Icon sf={{ default: def.sfDefault, selected: def.sfSelected }} />
            <Label>{labelFor(item)}</Label>
          </NativeTabs.Trigger>
        );
      })}
    </NativeTabs>
  );
}

function ClassicTabLayout({ config }: { config: TabBarItem[] }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const { fontMedium } = useTypography();
  const { activeOrder } = useOrders();
  const router = useRouter();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const activeTypes = useMemo(
    () => new Set(config.map((x) => x.type)),
    [config]
  );

  const labelFor = (item: TabBarItem) => {
    if (item.labelAr && item.labelAr.trim()) return item.labelAr;
    const translated = t(`tabs.${item.type}` as any);
    return translated && !translated.startsWith("tabs.") ? translated : item.type;
  };

  const hiddenTypes = ALL_TAB_TYPES.filter((tp) => !activeTypes.has(tp));

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
          flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
          ...(isWeb ? { height: 84 } : {}),
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
      {/* Active tabs in config order */}
      {config.map((item) => {
        const def = TAB_DEF[item.type];
        const name = TAB_SCREEN_NAME[item.type];
        const isErrand = item.type === "errand";
        return (
          <Tabs.Screen
            key={item.type}
            name={name}
            options={{
              title: labelFor(item),
              tabBarBadge: item.type === "orders" && activeOrder ? "!" : undefined,
              tabBarBadgeStyle:
                item.type === "orders"
                  ? { backgroundColor: BADGE_RED, fontSize: 10, minWidth: 16, height: 16 }
                  : undefined,
              tabBarIcon: ({ color, focused }) =>
                isErrand ? (
                  <Feather name="shopping-bag" size={22} color="#ea580c" />
                ) : isIOS ? (
                  <SymbolView
                    name={focused ? def.sfSelected : def.sfDefault}
                    tintColor={color}
                    size={24}
                  />
                ) : (
                  <Feather name={def.feather as any} size={22} color={color} />
                ),
              tabBarActiveTintColor: isErrand ? "#ea580c" : undefined,
              ...(isErrand
                ? {
                    tabBarButton: (props: any) => (
                      <TouchableOpacity
                        {...props}
                        onPress={() => router.push("/errand-request" as any)}
                        activeOpacity={0.7}
                      />
                    ),
                  }
                : {}),
            }}
          />
        );
      })}

      {/* Hidden screens — still navigable but not in tab bar */}
      {hiddenTypes.map((tp) => (
        <Tabs.Screen
          key={`hidden-${tp}`}
          name={TAB_SCREEN_NAME[tp]}
          options={{ tabBarButton: () => null, title: "" }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  const { data: tabConfig = DEFAULT_TAB_BAR } = useQuery<TabBarItem[]>({
    queryKey: ["tabBarConfig"],
    queryFn: fetchTabBarConfig,
    staleTime: 2 * 60 * 1000,
    placeholderData: DEFAULT_TAB_BAR,
  });

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout config={tabConfig} />;
  }
  return <ClassicTabLayout config={tabConfig} />;
}
