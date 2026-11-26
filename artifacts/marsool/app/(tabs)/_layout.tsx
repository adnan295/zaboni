import { Tabs, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { useOrders } from "@/context/OrderContext";
import { getApiBaseUrl } from "@/lib/apiConfig";
import FloatingTabBar, { type FloatingTab } from "@/components/FloatingTabBar";

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
  sfDefault:       string;
  sfSelected:      string;
  feather:         string;
  materialDefault: keyof typeof MaterialIcons.glyphMap;
  materialFocused: keyof typeof MaterialIcons.glyphMap;
};

const TAB_DEF: Record<TabType, TabDef> = {
  home:      { sfDefault: "house",           sfSelected: "house.fill",      feather: "home",         materialDefault: "home",              materialFocused: "home"              },
  favorites: { sfDefault: "heart",           sfSelected: "heart.fill",      feather: "heart",        materialDefault: "favorite-border",   materialFocused: "favorite"          },
  orders:    { sfDefault: "bag",             sfSelected: "bag.fill",        feather: "package",      materialDefault: "receipt-long",      materialFocused: "receipt-long"      },
  profile:   { sfDefault: "person",          sfSelected: "person.fill",     feather: "user",         materialDefault: "person-outline",    materialFocused: "person"            },
  offers:    { sfDefault: "tag",             sfSelected: "tag.fill",        feather: "tag",          materialDefault: "local-offer",       materialFocused: "local-offer"       },
  search:    { sfDefault: "magnifyingglass", sfSelected: "magnifyingglass", feather: "search",       materialDefault: "search",            materialFocused: "search"            },
  errand:    { sfDefault: "bag.badge.plus",  sfSelected: "bag.badge.plus",  feather: "shopping-bag", materialDefault: "storefront",        materialFocused: "storefront"        },
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

function ClassicTabLayout({ config }: { config: TabBarItem[] }) {
  const { t } = useTranslation();
  const { orders } = useOrders();
  const router = useRouter();

  const activeTypes = useMemo(() => new Set(config.map((x) => x.type)), [config]);

  const labelFor = (item: TabBarItem) => {
    if (item.labelAr && item.labelAr.trim()) return item.labelAr;
    const translated = t(`tabs.${item.type}` as any);
    return translated && !translated.startsWith("tabs.") ? translated : item.type;
  };

  // Orders still on their way, shown as a number on «طلباتي».
  const inProgress = orders.filter((o) => !["delivered", "cancelled", "scheduled"].includes(o.status)).length;

  const floatingTabs: FloatingTab[] = config.map((item) => {
    const def = TAB_DEF[item.type];
    return {
      name: TAB_SCREEN_NAME[item.type],
      label: labelFor(item),
      icon: def.materialDefault,
      iconFocused: def.materialFocused,
      badge: item.type === "orders" && inProgress > 0 ? inProgress : undefined,
      // «اطلب» opens دليل حمص (which falls back to the typed free order while it is empty).
      onPress: item.type === "errand" ? () => router.push("/directory" as any) : undefined,
    };
  });

  const hiddenTypes = ALL_TAB_TYPES.filter((tp) => !activeTypes.has(tp));

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props: any) => <FloatingTabBar state={props.state} navigation={props.navigation} tabs={floatingTabs} />}
    >
      {config.map((item) => (
        <Tabs.Screen key={item.type} name={TAB_SCREEN_NAME[item.type]} options={{ title: labelFor(item) }} />
      ))}

      {/* Hidden screens — navigable but not in the bar */}
      {hiddenTypes.map((tp) => (
        <Tabs.Screen key={`hidden-${tp}`} name={TAB_SCREEN_NAME[tp]} options={{ href: null, title: "" }} />
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

  return <ClassicTabLayout config={tabConfig} />;
}
