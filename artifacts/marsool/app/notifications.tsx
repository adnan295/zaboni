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
import { useNotifications, AppNotification, NotifType } from "@/context/NotificationsContext";

const NOTIF_ICON: Record<NotifType, keyof typeof MaterialIcons.glyphMap> = {
  order_status: "delivery-dining",
  promo: "local-offer",
  rating_request: "star",
  system: "notifications",
};

const NOTIF_COLOR: Record<NotifType, string> = {
  order_status: "#2563eb",
  promo: "#d97706",
  rating_request: "#f59e0b",
  system: "#6b7280",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

function NotifCard({
  notif,
  onPress,
  onDelete,
}: {
  notif: AppNotification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const icon = NOTIF_ICON[notif.type];
  const iconColor = NOTIF_COLOR[notif.type];

  return (
    <View
      style={[
        styles.cardWrapper,
        {
          backgroundColor: notif.read ? colors.card : colors.primary + "0d",
          borderColor: notif.read ? colors.border : colors.primary + "33",
        },
      ]}
    >
      <TouchableOpacity style={styles.cardInner} onPress={onPress} activeOpacity={0.75}>
        <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
          <MaterialIcons name={icon} size={22} color={iconColor} />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {notif.title}
            </Text>
            {!notif.read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground }]} numberOfLines={2}>
            {notif.body}
          </Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(notif.createdAt)}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.deleteBtn, { backgroundColor: "#fee2e2" }]}
        onPress={onDelete}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
      </TouchableOpacity>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, markRead, markAllRead, deleteNotification, clearAll } = useNotifications();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-forward-ios" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>الإشعارات</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>قراءة الكل</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="notifications-off" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا توجد إشعارات</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            ستظهر هنا تحديثات طلباتك والعروض الخاصة
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding + 20 }}
          showsVerticalScrollIndicator={false}
        >
          {notifications.map((notif) => (
            <NotifCard
              key={notif.id}
              notif={notif}
              onPress={() => {
                markRead(notif.id);
                if (notif.orderId && (notif.type === "order_status" || notif.type === "rating_request")) {
                  router.push("/orders");
                }
              }}
              onDelete={() => deleteNotification(notif.id)}
            />
          ))}

          {notifications.length > 0 && (
            <TouchableOpacity
              style={[styles.clearBtn, { borderColor: colors.border }]}
              onPress={clearAll}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete-sweep" size={18} color={colors.mutedForeground} />
              <Text style={[styles.clearText, { color: colors.mutedForeground }]}>مسح كل الإشعارات</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  markAllBtn: { width: 72, alignItems: "flex-end" },
  markAllText: { fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyBody: { fontSize: 14, textAlign: "center" },
  cardWrapper: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: "center",
    overflow: "hidden",
  },
  cardInner: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    gap: 12,
    alignItems: "flex-start",
  },
  deleteBtn: {
    width: 44,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#fecaca",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontWeight: "700", flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  body: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 11 },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  clearText: { fontSize: 13 },
});
