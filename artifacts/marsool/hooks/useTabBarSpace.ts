import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the floating tab bar capsule. */
export const TAB_BAR_HEIGHT = 68;

/** How far the capsule floats above the bottom edge (above the home indicator). */
export function useTabBarBottomOffset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "web") return 16;
  return Math.max(insets.bottom, 12) + 6;
}

/**
 * Bottom padding a tab screen's scroll content needs so its last item is not
 * hidden under the floating tab bar.
 */
export function useTabBarSpace(): number {
  return TAB_BAR_HEIGHT + useTabBarBottomOffset() + 16;
}
