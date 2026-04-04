import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useOrders } from "@/context/OrderContext";
import { useChat, ChatMessage } from "@/context/ChatContext";

export default function ChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getOrder } = useOrders();
  const { getMessages, sendCustomerMessage, triggerCourierGreeting } = useChat();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const order = getOrder(orderId ?? "");
  const messages = getMessages(orderId ?? "");

  useEffect(() => {
    if (!orderId) return;
    const timer = setTimeout(() => {
      triggerCourierGreeting(orderId);
    }, 800);
    return () => clearTimeout(timer);
  }, [orderId, triggerCourierGreeting]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim() || !orderId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendCustomerMessage(orderId, text.trim());
    setText("");
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.foreground }}>الطلب غير موجود</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="delivery-dining" size={20} color="#fff" />
          </View>
          <View>
            <Text style={[styles.courierName, { color: colors.foreground }]}>{order.courierName}</Text>
            <View style={styles.onlineRow}>
              <View style={[styles.onlineDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.onlineText, { color: colors.mutedForeground }]}>متصل الآن</Text>
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

      {/* Order context banner */}
      <View style={[styles.orderBanner, { backgroundColor: colors.secondary }]}>
        <MaterialIcons name="receipt" size={14} color={colors.primary} />
        <Text style={[styles.orderBannerText, { color: colors.primary }]} numberOfLines={1}>
          {order.orderText}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.messagesList, { paddingBottom: bottomPadding + 90 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isCustomer = item.sender === "customer";
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
                  {formatTime(item.timestamp)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="chat-bubble-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyChatTitle, { color: colors.foreground }]}>
              ستبدأ المحادثة قريباً
            </Text>
            <Text style={[styles.emptyChatSub, { color: colors.mutedForeground }]}>
              المندوب سيتواصل معك بعد قبول الطلب
            </Text>
          </View>
        }
      />

      {/* Input */}
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
          placeholder="اكتب رسالة..."
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
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
  onlineText: { fontSize: 11 },
  trackIconBtn: { padding: 4, width: 40, alignItems: "center" },
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  orderBannerText: { flex: 1, fontSize: 12, fontWeight: "500" },
  messagesList: { paddingHorizontal: 16, paddingTop: 16 },
  messageRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end", gap: 6 },
  messageRowRight: { justifyContent: "flex-end" },
  messageRowLeft: { justifyContent: "flex-start" },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "72%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleCustomer: { borderBottomRightRadius: 4 },
  bubbleCourier: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: "right" },
  emptyChat: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyChatTitle: { fontSize: 16, fontWeight: "700" },
  emptyChatSub: { fontSize: 13, textAlign: "center" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
