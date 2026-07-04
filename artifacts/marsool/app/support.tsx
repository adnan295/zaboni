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
  ScrollView,
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

type SupportScreenState = "landing" | "issue_picker" | "resolution" | "chat";
type SupportTicketCategory = "order_delayed" | "wrong_items" | "damaged" | "payment" | "other";

interface RecentOrder {
  id: string;
  restaurantName: string;
  status: string;
  totalPrice: number | null;
  deliveryFee: number;
  estimatedMinutes: number;
  createdAt: string;
}

interface TicketSummary {
  id: string;
  category: SupportTicketCategory;
  status: "open" | "resolved";
  createdAt: string;
  orderId: string | null;
  orderRef: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface TicketMessage {
  id: string;
  ticketId: string | null;
  text: string;
  senderRole: "customer" | "support";
  isRead: boolean;
  createdAt: string;
}

const CATEGORY_ICONS: Record<SupportTicketCategory, keyof typeof MaterialIcons.glyphMap> = {
  order_delayed: "schedule",
  wrong_items: "error-outline",
  damaged: "broken-image",
  payment: "credit-card",
  other: "help-outline",
};

const ORDER_STATUS_MAP: Record<string, string> = {
  searching: "جاري البحث عن سائق",
  accepted: "السائق في طريقه للمطعم",
  picked_up: "السائق استلم طلبك",
  on_way: "السائق في الطريق إليك",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

export default function SupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { token } = useAuth();

  const [screenState, setScreenState] = useState<SupportScreenState>("landing");
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loadingLanding, setLoadingLanding] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<RecentOrder | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SupportTicketCategory | null>(null);
  const [activeTicket, setActiveTicket] = useState<TicketSummary | null>(null);

  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Load landing data ──────────────────────────────────────────────────
  const loadLanding = useCallback(async () => {
    setLoadingLanding(true);
    try {
      const [orders, tix] = await Promise.all([
        customFetch("/api/support/recent-orders") as Promise<RecentOrder[]>,
        customFetch("/api/support/tickets") as Promise<TicketSummary[]>,
      ]);
      setRecentOrders(orders);
      setTickets(tix);
    } catch {
      // ignore
    } finally {
      setLoadingLanding(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLanding();
    }, [loadLanding]),
  );

  // ── Load messages for active ticket ───────────────────────────────────
  useEffect(() => {
    if (!activeTicket || screenState !== "chat") return;
    setLoadingMessages(true);
    (customFetch(`/api/support/tickets/${activeTicket.id}/messages`) as Promise<TicketMessage[]>)
      .then((data) => {
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoadingMessages(false));
  }, [activeTicket, screenState]);

  // ── Socket for real-time chat ─────────────────────────────────────────
  useEffect(() => {
    if (!token || !activeTicket || screenState !== "chat") return;
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
    socket.on("support_message", (msg: TicketMessage) => {
      if (msg.ticketId !== activeTicket.id) return;
      setMessages((prev) => [...prev, msg]);
      // Mark as read silently
      customFetch(`/api/support/tickets/${activeTicket.id}/messages`).catch(() => {/* ignore */});
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, activeTicket, screenState]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSelectOrder = (order: RecentOrder) => {
    setSelectedOrder(order);
    setScreenState("issue_picker");
  };

  const handleGeneralTopic = () => {
    setSelectedOrder(null);
    setScreenState("issue_picker");
  };

  const handleSelectCategory = async (cat: SupportTicketCategory) => {
    setSelectedCategory(cat);
    if (cat === "other") {
      // Skip resolution, create ticket directly
      await handleContactSupport(cat);
    } else {
      setScreenState("resolution");
    }
  };

  const handleContactSupport = async (catOverride?: SupportTicketCategory) => {
    const category = catOverride ?? selectedCategory;
    if (!category) return;
    setCreatingTicket(true);
    try {
      const ticket = (await customFetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, orderId: selectedOrder?.id ?? null }),
      })) as TicketSummary;
      setActiveTicket(ticket);
      setMessages([]);
      setScreenState("chat");
    } catch {
      // ignore
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleOpenTicket = (ticket: TicketSummary) => {
    setActiveTicket(ticket);
    setSelectedOrder(null);
    setSelectedCategory(ticket.category);
    setMessages([]);
    setScreenState("chat");
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || !activeTicket) return;
    setInputText("");
    setSending(true);
    try {
      const msg = (await customFetch(`/api/support/tickets/${activeTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })) as TicketMessage;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    if (screenState === "chat") {
      void loadLanding();
      setActiveTicket(null);
      setSelectedOrder(null);
      setSelectedCategory(null);
      setMessages([]);
      setScreenState("landing");
    } else if (screenState === "resolution") {
      setScreenState("issue_picker");
    } else if (screenState === "issue_picker") {
      setSelectedOrder(null);
      setScreenState("landing");
    } else {
      router.back();
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ar-SY", { month: "short", day: "numeric" });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" });

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "الآن";
    if (diff < 3_600_000) return `منذ ${Math.floor(diff / 60_000)} د`;
    if (diff < 86_400_000) return formatTime(iso);
    return formatDate(iso);
  };

  const categoryLabel = (cat: SupportTicketCategory): string => {
    const labels: Record<SupportTicketCategory, string> = {
      order_delayed: t("support.categories.order_delayed"),
      wrong_items: t("support.categories.wrong_items"),
      damaged: t("support.categories.damaged"),
      payment: t("support.categories.payment"),
      other: t("support.categories.other"),
    };
    return labels[cat];
  };

  // ── Render functions ──────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: TicketMessage }) => {
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

  // ── LANDING ────────────────────────────────────────────────────────────
  const renderLanding = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.landingContent, { paddingBottom: bottomPadding + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {loadingLanding ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Prompt */}
          <View style={styles.landingHero}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primary + "18" }]}>
              <MaterialIcons name="support-agent" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {t("support.landing.heroTitle")}
            </Text>
            <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
              {t("support.landing.heroSub")}
            </Text>
          </View>

          {/* Recent orders */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {t("support.landing.recentOrders")}
          </Text>
          {recentOrders.length === 0 ? (
            <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
              {t("support.landing.noOrders")}
            </Text>
          ) : (
            recentOrders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSelectOrder(order)}
                activeOpacity={0.75}
              >
                <View style={styles.orderCardLeft}>
                  <MaterialIcons name="restaurant" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderCardRestaurant, { color: colors.foreground }]}>
                    {order.restaurantName}
                  </Text>
                  <Text style={[styles.orderCardStatus, { color: colors.mutedForeground }]}>
                    {ORDER_STATUS_MAP[order.status] ?? order.status} · {formatDate(order.createdAt)}
                  </Text>
                </View>
                <MaterialIcons name={backIcon === "arrow-back" ? "arrow-forward" : "arrow-back"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))
          )}

          {/* General topic */}
          <TouchableOpacity
            style={[styles.generalBtn, { borderColor: colors.primary }]}
            onPress={handleGeneralTopic}
            activeOpacity={0.75}
          >
            <MaterialIcons name="help-outline" size={18} color={colors.primary} />
            <Text style={[styles.generalBtnText, { color: colors.primary }]}>
              {t("support.landing.generalTopic")}
            </Text>
          </TouchableOpacity>

          {/* Previous tickets */}
          {tickets.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>
                {t("support.landing.myTickets")}
              </Text>
              {tickets.map((ticket) => (
                <TouchableOpacity
                  key={ticket.id}
                  style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleOpenTicket(ticket)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.ticketCardHeader}>
                      <Text style={[styles.ticketCategory, { color: colors.foreground }]}>
                        {categoryLabel(ticket.category)}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: ticket.status === "open" ? "#22c55e22" : "#94a3b822" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: ticket.status === "open" ? "#16a34a" : "#64748b" },
                          ]}
                        >
                          {ticket.status === "open"
                            ? t("support.tickets.open")
                            : t("support.tickets.resolved")}
                        </Text>
                      </View>
                    </View>
                    {ticket.lastMessage && (
                      <Text
                        style={[styles.ticketLastMsg, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {ticket.lastMessage}
                      </Text>
                    )}
                  </View>
                  <View style={styles.ticketCardRight}>
                    {ticket.unreadCount > 0 && (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.unreadBadgeText}>{ticket.unreadCount}</Text>
                      </View>
                    )}
                    {ticket.lastMessageAt && (
                      <Text style={[styles.ticketTime, { color: colors.mutedForeground }]}>
                        {formatRelative(ticket.lastMessageAt)}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );

  // ── ISSUE PICKER ───────────────────────────────────────────────────────
  const CATEGORIES: { key: SupportTicketCategory; descAr: string }[] = [
    { key: "order_delayed", descAr: t("support.categories.order_delayed") },
    { key: "wrong_items", descAr: t("support.categories.wrong_items") },
    { key: "damaged", descAr: t("support.categories.damaged") },
    { key: "payment", descAr: t("support.categories.payment") },
    { key: "other", descAr: t("support.categories.other") },
  ];

  const renderIssuePicker = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.issuePickerContent, { paddingBottom: bottomPadding + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {selectedOrder && (
        <View style={[styles.orderContextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="receipt-long" size={16} color={colors.primary} />
          <Text style={[styles.orderContextText, { color: colors.mutedForeground }]}>
            {t("support.issuePicker.orderRef", { restaurant: selectedOrder.restaurantName })}
          </Text>
        </View>
      )}
      <Text style={[styles.issuePickerTitle, { color: colors.foreground }]}>
        {t("support.issuePicker.title")}
      </Text>
      {CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.key}
          style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => void handleSelectCategory(cat.key)}
          activeOpacity={0.75}
        >
          <View style={[styles.categoryIcon, { backgroundColor: colors.primary + "18" }]}>
            <MaterialIcons name={CATEGORY_ICONS[cat.key]} size={22} color={colors.primary} />
          </View>
          <Text style={[styles.categoryLabel, { color: colors.foreground }]}>{cat.descAr}</Text>
          <MaterialIcons
            name={backIcon === "arrow-back" ? "arrow-forward-ios" : "arrow-back-ios"}
            size={14}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // ── RESOLUTION ────────────────────────────────────────────────────────
  const renderResolution = () => {
    const cat = selectedCategory!;
    const order = selectedOrder;

    const getContent = () => {
      if (cat === "order_delayed" && order) {
        const statusText = ORDER_STATUS_MAP[order.status] ?? order.status;
        return (
          <View>
            <View style={[styles.resolutionInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.resolutionInfoLabel, { color: colors.mutedForeground }]}>
                {t("support.resolution.orderStatus")}
              </Text>
              <Text style={[styles.resolutionInfoValue, { color: colors.foreground }]}>
                {statusText}
              </Text>
              {(order.status === "on_way" || order.status === "accepted") && (
                <>
                  <Text style={[styles.resolutionInfoLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                    {t("support.resolution.estimatedTime")}
                  </Text>
                  <Text style={[styles.resolutionInfoValue, { color: colors.primary }]}>
                    {order.estimatedMinutes} {t("support.resolution.minutes")}
                  </Text>
                </>
              )}
            </View>
            <Text style={[styles.resolutionNote, { color: colors.mutedForeground }]}>
              {t("support.resolution.order_delayed.note")}
            </Text>
          </View>
        );
      }
      if (cat === "payment" && order) {
        const total = (order.totalPrice ?? 0) + order.deliveryFee;
        return (
          <View>
            <View style={[styles.resolutionInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.resolutionInfoLabel, { color: colors.mutedForeground }]}>
                {t("support.resolution.orderTotal")}
              </Text>
              <Text style={[styles.resolutionInfoValue, { color: colors.foreground }]}>
                {total.toLocaleString("ar-SY")} ل.س
              </Text>
              <Text style={[styles.resolutionInfoLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                {t("support.resolution.paymentMethod")}
              </Text>
              <Text style={[styles.resolutionInfoValue, { color: colors.foreground }]}>
                {t("support.resolution.cashOnDelivery")}
              </Text>
            </View>
            <Text style={[styles.resolutionNote, { color: colors.mutedForeground }]}>
              {t("support.resolution.payment.note")}
            </Text>
          </View>
        );
      }
      const noteKey =
        cat === "wrong_items"
          ? "support.resolution.wrong_items.note"
          : cat === "damaged"
            ? "support.resolution.damaged.note"
            : "support.resolution.other.note";
      return (
        <Text style={[styles.resolutionNote, { color: colors.mutedForeground }]}>
          {t(noteKey)}
        </Text>
      );
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.resolutionContent, { paddingBottom: bottomPadding + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.resolutionHeader, { backgroundColor: colors.primary + "12" }]}>
          <MaterialIcons name={CATEGORY_ICONS[cat]} size={28} color={colors.primary} />
          <Text style={[styles.resolutionTitle, { color: colors.foreground }]}>
            {categoryLabel(cat)}
          </Text>
        </View>

        {getContent()}

        <View style={styles.resolutionDivider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
            {t("support.resolution.stillNeedHelp")}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <TouchableOpacity
          style={[styles.contactBtn, { backgroundColor: colors.primary }]}
          onPress={() => void handleContactSupport()}
          disabled={creatingTicket}
          activeOpacity={0.8}
        >
          {creatingTicket ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="chat" size={18} color="#fff" />
              <Text style={styles.contactBtnText}>{t("support.resolution.contactSupport")}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── CHAT ──────────────────────────────────────────────────────────────
  const renderChat = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Context card */}
      {activeTicket && (
        <View style={[styles.chatContextCard, { backgroundColor: colors.primary + "12", borderBottomColor: colors.border }]}>
          <MaterialIcons name={CATEGORY_ICONS[activeTicket.category]} size={14} color={colors.primary} />
          <Text style={[styles.chatContextText, { color: colors.primary }]}>
            {categoryLabel(activeTicket.category)}
            {activeTicket.orderRef ? ` · ${activeTicket.orderRef}` : ""}
          </Text>
          {activeTicket.status === "resolved" && (
            <View style={[styles.resolvedBadge, { backgroundColor: "#94a3b844" }]}>
              <Text style={[styles.resolvedBadgeText, { color: "#64748b" }]}>
                {t("support.tickets.resolved")}
              </Text>
            </View>
          )}
        </View>
      )}

      {loadingMessages ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listEmpty,
          ]}
          onLayout={() => {
            if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="support-agent" size={48} color={colors.primary} />
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

      {activeTicket?.status !== "resolved" && (
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
      )}
    </KeyboardAvoidingView>
  );

  // ── Header ─────────────────────────────────────────────────────────────
  const getHeaderTitle = () => {
    if (screenState === "issue_picker") return t("support.issuePicker.headerTitle");
    if (screenState === "resolution") return categoryLabel(selectedCategory ?? "other");
    if (screenState === "chat") return t("support.title");
    return t("support.title");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {screenState === "chat" && <View style={styles.agentDot} />}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {getHeaderTitle()}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {screenState === "landing" && renderLanding()}
      {screenState === "issue_picker" && renderIssuePicker()}
      {screenState === "resolution" && renderResolution()}
      {screenState === "chat" && renderChat()}
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
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: { textAlign: "center", fontSize: 18, fontWeight: "800" },
  agentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" },

  // Landing
  landingContent: { paddingHorizontal: 16, paddingTop: 8 },
  landingHero: { alignItems: "center", paddingVertical: 20, gap: 8 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  heroSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 4 },
  emptyNote: { fontSize: 14, textAlign: "center", paddingVertical: 12 },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  orderCardLeft: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  orderCardRestaurant: { fontSize: 15, fontWeight: "700" },
  orderCardStatus: { fontSize: 13, marginTop: 2 },
  generalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  generalBtnText: { fontSize: 15, fontWeight: "700" },
  ticketCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  ticketCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  ticketCategory: { fontSize: 14, fontWeight: "700", flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  ticketLastMsg: { fontSize: 13 },
  ticketCardRight: { alignItems: "flex-end", gap: 4 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  ticketTime: { fontSize: 11 },

  // Issue picker
  issuePickerContent: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
  orderContextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  orderContextText: { fontSize: 13, flex: 1 },
  issuePickerTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  categoryIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  categoryLabel: { flex: 1, fontSize: 15, fontWeight: "600" },

  // Resolution
  resolutionContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  resolutionHeader: {
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  resolutionTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  resolutionInfo: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 4 },
  resolutionInfoLabel: { fontSize: 13 },
  resolutionInfoValue: { fontSize: 16, fontWeight: "700" },
  resolutionNote: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  resolutionDivider: { flexDirection: "row", alignItems: "center", gap: 8 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  contactBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Chat
  chatContextCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  chatContextText: { flex: 1, fontSize: 13, fontWeight: "600" },
  resolvedBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  resolvedBadgeText: { fontSize: 11, fontWeight: "700" },
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
