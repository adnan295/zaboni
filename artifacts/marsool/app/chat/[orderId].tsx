import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useOrders } from "@/context/OrderContext";
import { useChat, ChatMessage } from "@/context/ChatContext";

export default function ChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { getOrder } = useOrders();
  const {
    getMessages,
    sendMessage,
    sendTyping,
    sendStopTyping,
    joinOrder,
    isCourierTyping,
    isConnected,
  } = useChat();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const order = getOrder(orderId ?? "");
  const messages = getMessages(orderId ?? "");
  const courierIsTyping = isCourierTyping(orderId ?? "");

  useEffect(() => {
    if (!orderId) return;
    joinOrder(orderId);
  }, [orderId, joinOrder]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, courierIsTyping]);

  const handleSend = () => {
    if (!text.trim() || !orderId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(orderId, text.trim());
    sendStopTyping(orderId);
    setText("");
  };

  const handleTextChange = (val: string) => {
    setText(val);
    if (orderId && val.length > 0) {
      sendTyping(orderId);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const formatTime = (ts: string | Date | number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.foreground }}>{t("chat.notFound")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="delivery-dining" size={20} color="#fff" />
          </View>
          <View>
            <Text style={[styles.courierName, { color: colors.foreground }]}>{order.courierName}</Text>
            <View style={styles.onlineRow}>
              <View style={[styles.onlineDot, { backgroundColor: isConnected ? "#22c55e" : "#94a3b8" }]} />
              <Text style={[styles.onlineText, { color: colors.mutedForeground }]}>
                {isConnected ? t("chat.onlineNow") : t("chat.connecting")}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/order-tracking/[id]",
              params: { id: orderId },
            })
          }
          style={styles.trackIconBtn}
        >
          <MaterialIcons name="my-location" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.orderBanner, { backgroundColor: colors.secondary }]}>
        <MaterialIcons name="receipt" size={14} color={colors.primary} />
        <Text style={[styles.orderBannerText, { color: colors.primary }]} numberOfLines={1}>
          {order.orderText}
        </Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.messagesList, { paddingBottom: bottomPadding + 90 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isCustomer = item.senderRole === "customer";
          return (
            <View style={[styles.messageRow, isCustomer ? styles.messageRowRight : styles.messageRowLeft]}>
              {!isCustomer && (
                <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="delivery-dining" size={14} color="#fff" />
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  isCustomer
                    ? [styles.bubbleCustomer, { backgroundColor: colors.primary }]
                    : [styles.bubbleCourier, { backgroundColor: colors.card, borderColor: colors.border }],
                ]}
              >
                <Text style={[styles.bubbleText, { color: isCustomer ? "#fff" : colors.foreground }]}>
                  {item.text}
                </Text>
                <Text style={[styles.bubbleTime, { color: isCustomer ? "rgba(255,255,255,0.65)" : colors.mutedForeground }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          courierIsTyping ? (
            <View style={[styles.messageRow, styles.messageRowLeft, { marginTop: 8 }]}>
              <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="delivery-dining" size={14} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleCourier, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "row", gap: 4, paddingVertical: 10, paddingHorizontal: 14 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t("chat.typing")}</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="chat-bubble-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyChatTitle, { color: colors.foreground }]}>
              {t("chat.empty.title")}
            </Text>
            <Text style={[styles.emptyChatSub, { color: colors.mutedForeground }]}>
              {t("chat.empty.sub")}
            </Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPadding + 8 }]}>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}
          onPress={handleSend}
          disabled={!text.trim()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="send" size={20} color={text.trim() ? "#fff" : colors.mutedForeground} />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={handleTextChange}
          textAlign="right"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          multiline
        />
      </View>
    </KeyboardAvoidingView>
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
    gap: 8,
  },
  backBtn: { padding: 4, width: 40 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  courierName: { fontSize: 15, fontWeight: "700" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12 },
  trackIconBtn: { padding: 4, width: 40, alignItems: "flex-end" },
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  orderBannerText: { flex: 1, fontSize: 12, fontWeight: "600" },
  messagesList: { padding: 16, gap: 12 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageRowRight: { justifyContent: "flex-end" },
  messageRowLeft: { justifyContent: "flex-start" },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  bubble: { maxWidth: "75%", borderRadius: 16, padding: 12, gap: 4 },
  bubbleCustomer: { borderBottomRightRadius: 4 },
  bubbleCourier: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 10, textAlign: "right" },
  emptyChat: { alignItems: "center", gap: 12, paddingTop: 80 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyChatTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyChatSub: { fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  inputBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  input: { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
});
