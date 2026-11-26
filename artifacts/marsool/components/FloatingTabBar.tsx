import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { default as Text } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT, useTabBarBottomOffset } from "@/hooks/useTabBarSpace";

export interface FloatingTab {
  /** The route name inside (tabs). */
  name: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconFocused: keyof typeof MaterialIcons.glyphMap;
  badge?: number;
  /** Instead of switching tab, run this (e.g. open a stack screen). */
  onPress?: () => void;
}

interface Props {
  // BottomTabBarProps from react-navigation; typed loosely to avoid a direct dependency.
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { emit: (e: any) => { defaultPrevented: boolean }; navigate: (name: string) => void };
  tabs: FloatingTab[];
}

/**
 * زبوني's bottom bar: a white capsule floating above the content. The selected
 * tab sits on a light-red pill; every tab keeps its name under the icon so
 * nobody has to guess what an icon means.
 */
export default function FloatingTabBar({ state, navigation, tabs }: Props) {
  const colors = useColors();
  const bottom = useTabBarBottomOffset();
  const current = state.routes[state.index]?.name;

  return (
    <>
    {/* A soft fade so the list ends gently behind the bar instead of cutting under it. */}
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(246,246,247,0)", "rgba(246,246,247,0.92)", colors.background]}
      locations={[0, 0.55, 1]}
      style={[styles.fade, { height: bottom + TAB_BAR_HEIGHT + 28 }]}
    />
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          // "row" follows the layout direction: first tab on the right in Arabic.
          { backgroundColor: colors.card, flexDirection: "row" },
        ]}
      >
        {tabs.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          const focused = current === tab.name;
          const press = () => {
            void Haptics.selectionAsync().catch(() => {});
            if (tab.onPress) {
              tab.onPress();
              return;
            }
            if (!route) return;
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.badge ? `${tab.label}، ${tab.badge}` : tab.label}
              onPress={press}
              style={({ pressed }) => [
                styles.item,
                focused && { backgroundColor: colors.accent },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              <View>
                <MaterialIcons
                  name={focused ? tab.iconFocused : tab.icon}
                  size={23}
                  color={focused ? colors.primaryDark : colors.mutedForeground}
                />
                {!!tab.badge && (
                  <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                    <Text style={styles.badgeText}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: focused ? colors.primaryDark : colors.mutedForeground, fontWeight: focused ? "800" : "500" },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: "#F1F1F3",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  item: {
    flex: 1,
    height: 54,
    marginHorizontal: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: { fontSize: 11 },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
});
