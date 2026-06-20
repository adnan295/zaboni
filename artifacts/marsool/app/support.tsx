import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/apiConfig";

interface SupportMessage {
  id: string;
  userId: string;
  text: string;
  senderRole: "customer" | "support";
  isRead: boolean;
  createdAt: string;
}

export default function SupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { token } = useAuth();

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadMessages = useCallback(async () => {
    try {
      const data = (await customFetch("/api/support/messages")) as SupportMessage[];
      setMessages(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async () => {
    try {
      await customFetch("/api/support/messages/mark-read", { method: "PATCH" });
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
      void markRead();
    }, [loadMessages, markRead]),
  );

  useEffect(() => {
    if (!token) return;
    const base = Platform.OS === "web" ? "" : getApiBaseUrl();
    const socketUrl =
      base || (typeof window !== "undefined" ? window?.location?.origin : "") || "";
    const socket: Socket = io(`${socketUrl}/orders`, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
    });
    socket.on("support_message", (msg: SupportMessage) => {
      setMessages((prev) => [...prev, msg]);
      void markRead();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, markRead]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText("");
    setSending(true);
    try {
      const msg = (await customFetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })) as SupportMessage;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" });

  const renderMessage = ({ item }: { item: SupportMessage }) => {
    const isCustomer = item.senderRole === "customer";
    return (
      <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        {!isCustomer && (
          <View style={[styles.agentAvatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="support-agent" size={14} color="#fff" />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isCustomer
              ? [styles.bubbleCustomer, { backgroundColor: colors.primary }]
              : [styles.bubbleSupport, { backgroundColor: colors.card, borderColor: colors.border }],
          ]}
        >
          {!isCustomer && (
            <Text style={[styles.agentLabel, { color: colors.primary }]}>
              {t("support.chat.agentLabel")}
            </Text>
          )}
          <Text style={[styles.bubbleText, { color: isCustomer ? "#fff" : colors.foreground }]}>
            {item.text}
          </Text>
          <Text
            style={[
              styles.bubbleTime,
              { color: isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedForeground },
            ]}
          >
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.agentDot} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t("support.title")}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.listContent, messages.length === 0 && styles.listEmpty]}
          onLayout={() => {
            if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="support-agent" size={52} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t("support.chat.emptyTitle")}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {t("support.chat.emptySub")}
              </Text>
            </View>
          }
        />
      )}

      <View
        style={[
          styles.inputBar,
          { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPadding + 8 },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t("support.chat.inputPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={2000}
          textAlign="right"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.border }]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
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
  },
  backBtn: { padding: 4, width: 40 },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: { textAlign: "center", fontSize: 18, fontWeight: "800" },
  agentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 },
  listEmpty: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 32 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubbleRowLeft: { justifyContent: "flex-start" },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  bubbleCustomer: { borderBottomRightRadius: 4 },
  bubbleSupport: { borderWidth: 1, borderBottomLeftRadius: 4 },
  agentLabel: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 11, marginTop: 2, textAlign: "right" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
