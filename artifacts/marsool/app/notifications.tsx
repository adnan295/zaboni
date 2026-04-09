import React from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
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

function formatTimestamp(ts: number, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const date = new Date(ts);
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (mins < 1) return t("notifications.timeAgo.justNow");
  if (mins < 60) return `${t("notifications.timeAgo.minutes", { count: mins })} · ${timeStr}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${t("notifications.timeAgo.hours", { count: hrs })} · ${timeStr}`;
  return `${dateStr} · ${timeStr}`;
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
  const { t } = useTranslation();

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
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatTimestamp(notif.createdAt, t)}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        {!notif.read && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]}
            onPress={onPress}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <MaterialIcons name="mark-email-read" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]}
          onPress={onDelete}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <MaterialIcons name="delete-outline" size={16} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { notifications, markRead, markAllRead, deleteNotification, clearAll } = useNotifications();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("notifications.title")}</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>{t("notifications.markAllRead")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="notifications-off" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("notifications.empty.title")}</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {t("notifications.empty.body")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding + 20 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: notif }) => (
            <NotifCard
              notif={notif}
              onPress={() => {
                markRead(notif.id);
                if (notif.orderId && (notif.type === "order_status" || notif.type === "rating_request")) {
                  router.push({ pathname: "/order-tracking/[id]", params: { id: notif.orderId } });
                }
              }}
              onDelete={() => deleteNotification(notif.id)}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={[styles.clearBtn, { borderColor: colors.border }]}
              onPress={clearAll}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete-sweep" size={18} color={colors.mutedForeground} />
              <Text style={[styles.clearText, { color: colors.mutedForeground }]}>{t("notifications.clearAll")}</Text>
            </TouchableOpacity>
          }
        />
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
  cardActions: {
    flexDirection: "column",
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
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
