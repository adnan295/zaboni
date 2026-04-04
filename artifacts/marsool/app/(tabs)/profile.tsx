import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface MenuItem {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const menuItems: MenuItem[] = [
    { icon: "receipt-long", label: "طلباتي", onPress: () => router.push("/orders") },
    { icon: "location-on", label: "عناويني", onPress: () => {} },
    { icon: "payment", label: "طرق الدفع", onPress: () => {} },
    { icon: "notifications", label: "الإشعارات", onPress: () => {} },
    { icon: "help-outline", label: "المساعدة والدعم", onPress: () => {} },
    { icon: "info-outline", label: "عن التطبيق", onPress: () => {} },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={40} color="#fff" />
          </View>
        </View>
        <Text style={styles.name}>أحمد محمد</Text>
        <Text style={styles.phone}>+966 50 123 4567</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>12</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>طلب</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>4.8</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>تقييمك</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>3</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>مفضلة</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={item.danger ? colors.destructive : colors.primary}
                  />
                </View>
                <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>
                  {item.label}
                </Text>
                <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
              {idx < menuItems.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          مرسول · الإصدار 1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 20, fontWeight: "800", color: "#fff" },
  phone: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: "100%" },
  menuCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  divider: { height: 1, marginHorizontal: 16 },
  version: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 24,
  },
});
