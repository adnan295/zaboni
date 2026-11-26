import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet,
  TextInput, TouchableOpacity, View,
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@workspace/api-client-react";
import { default as Text } from "@/components/AppText";
import AddressPreviewMap from "@/components/AddressPreviewMap";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { cardShadow } from "@/constants/colors";
import { callAboutOrder } from "@/utils/companyCall";
import { chatErrorText, markChatRead, useOrderChat, useSendChat, type ChatMessage } from "@/hooks/useOrderChat";

const QUICK_REPLIES = ["وصلت 👋", "أنا تحت البناية", "دقيقتين وبكون عندك"];
const ASK_LOCATION = "فيك تبعتلي موقعك الدقيق من زر «ابعت موقعي»؟";

function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "ص" : "م"}`;
}

/** Turn-by-turn to the pin in the phone's own maps app. */
function openInMaps(lat: number, lon: number) {
  const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
  const native = Platform.OS === "ios" ? `maps://?daddr=${ll}&dirflg=d` : `google.navigation:q=${ll}`;
  Linking.openURL(native).catch(() => Linking.openURL(web).catch(() => {}));
}

/**
 * «محادثة الطلب» between the customer and the courier of one order. Same screen
 * for both: the server says which side this phone is. No numbers are ever shown,
 * and a number typed into a message is hidden by the server.
 */
export default function OrderChatScreen() {
  const { id, name, sub, phone, masked } = useLocalSearchParams<{ id: string; name?: string; sub?: string; phone?: string; masked?: string }>();
  const orderId = String(id ?? "");
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backIcon = useBackIcon();
  const { data, isLoading, isError, refetch } = useOrderChat(orderId, { live: true });
  const send = useSendChat(orderId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const me = data?.role;
  const isCustomer = me === "customer";
  const count = data?.messages.length ?? 0;
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (unread > 0) void markChatRead(orderId).then(() => refetch());
  }, [unread, orderId]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [count]);

  const sendBody = async (body: { text: string } | { lat: number; lon: number; accuracy: number | null }) => {
    setError(null);
    try {
      await send.mutateAsync(body);
      void Haptics.selectionAsync().catch(() => {});
      return true;
    } catch (e) {
      const code = e instanceof ApiError ? (e.data as { error?: string } | null)?.error : undefined;
      setError(chatErrorText(code));
      return false;
    }
  };

  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    if (await sendBody({ text: t })) setDraft("");
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const title = name || (isCustomer ? "مندوبك" : "الزبون");
  const open = data?.open ?? true;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.round, { backgroundColor: colors.muted }]} onPress={() => router.back()} accessibilityLabel="رجوع">
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <MaterialIcons name={isCustomer ? "delivery-dining" : "person"} size={24} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{sub}</Text>}
        </View>
        {!!phone && (
          <TouchableOpacity
            style={[styles.round, { backgroundColor: colors.primary }]}
            onPress={() => void callAboutOrder(orderId, String(phone), masked === "1")}
            accessibilityLabel="اتصال"
          >
            <MaterialIcons name="phone" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>ما قدرنا نفتح المحادثة</Text>
          <TouchableOpacity onPress={() => refetch()}><Text style={{ color: colors.primaryDark, fontWeight: "700" }}>جرّب مرة تانية</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View style={[styles.sys, { backgroundColor: colors.muted }]}>
            <Text style={[styles.sysText, { color: colors.mutedForeground }]}>
              {isCustomer
                ? "المحادثة لهالطلب بس · بتتسكّر بعد التسليم"
                : "ما فيك تشوف رقم الزبون · الاتصال من زر الاتصال"}
            </Text>
          </View>
          {data?.messages.map((m) => (
            <Bubble key={m.id} m={m} mine={m.from === me} viewerIsCourier={me === "courier"} />
          ))}
          {!open && (
            <View style={[styles.sys, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sysText, { color: colors.mutedForeground }]}>انتهى الطلب، المحادثة صارت للقراءة بس</Text>
            </View>
          )}
        </ScrollView>
      )}

      {open && !isLoading && !isError && (
        <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
          {!!error && <Text style={[styles.error, { color: colors.primaryDark }]}>{error}</Text>}
          {isCustomer ? (
            <TouchableOpacity style={[styles.locBtn, { backgroundColor: colors.secondary }]} onPress={() => setLocOpen(true)} activeOpacity={0.8}>
              <MaterialIcons name="my-location" size={20} color={colors.primaryDark} />
              <Text style={[styles.locBtnText, { color: colors.primaryDark }]}>ابعت موقعي الدقيق</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              <TouchableOpacity style={[styles.chip, { borderColor: colors.primary }]} onPress={() => void sendText(ASK_LOCATION)}>
                <MaterialIcons name="place" size={16} color={colors.primaryDark} />
                <Text style={[styles.chipText, { color: colors.primaryDark }]}>ابعتلي موقعك</Text>
              </TouchableOpacity>
              {QUICK_REPLIES.map((q) => (
                <TouchableOpacity key={q} style={[styles.chip, { borderColor: colors.border }]} onPress={() => void sendText(q)}>
                  <Text style={[styles.chipText, { color: colors.foreground }]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={isCustomer ? "اكتب رسالة… (مثلاً: بدّلوا الكولا بعصير)" : "اكتب رسالة…"}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
              maxLength={500}
              multiline
              textAlign="right"
            />
            <TouchableOpacity
              style={[styles.send, { backgroundColor: draft.trim() ? colors.primary : colors.border }]}
              onPress={() => void sendText(draft)}
              disabled={!draft.trim() || send.isPending}
              accessibilityLabel="إرسال"
            >
              {send.isPending ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="send" size={20} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <SendLocationSheet
        visible={locOpen}
        onClose={() => setLocOpen(false)}
        onSend={async (p) => {
          const ok = await sendBody(p);
          if (ok) setLocOpen(false);
          return ok;
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine, viewerIsCourier }: { m: ChatMessage; mine: boolean; viewerIsCourier: boolean }) {
  const colors = useColors();
  const time = clock(m.createdAt);
  if (m.kind === "location" && m.lat != null && m.lon != null) {
    return (
      <View style={[styles.locBubble, mine ? styles.mine : styles.theirs, { backgroundColor: colors.card, borderColor: mine ? colors.primary : colors.card }, cardShadow]}>
        <AddressPreviewMap latitude={m.lat} longitude={m.lon} height={110} pinColor={colors.primary} />
        <View style={{ padding: 10, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialIcons name="place" size={18} color={colors.primary} />
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{mine ? "موقعي الدقيق" : "موقع الزبون الدقيق"}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "left" }}>
            {m.accuracy != null ? `دقة الموقع ±${m.accuracy} م · ` : ""}{time}
          </Text>
          {mine && <Text style={{ fontSize: 12, color: colors.success, fontWeight: "700", textAlign: "left" }}>✓ وصل للمندوب</Text>}
          {viewerIsCourier && m.sentToWhatsapp && (
            <Text style={{ fontSize: 12, color: colors.success, fontWeight: "700", textAlign: "left" }}>✓ انبعت عواتسابك كمان</Text>
          )}
          {viewerIsCourier && (
            <TouchableOpacity style={[styles.mapsBtn, { backgroundColor: colors.primary }]} onPress={() => openInMaps(m.lat!, m.lon!)}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>افتح بالخرائط</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 4, alignSelf: mine ? "flex-start" : "flex-end", maxWidth: "80%" }}>
      <View style={[styles.bubble, mine ? [styles.mine, styles.mineShape, { backgroundColor: colors.primary }] : [styles.theirs, styles.theirsShape, { backgroundColor: colors.card }, cardShadow]]}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: mine ? "#fff" : colors.foreground, textAlign: "left" }}>{m.text}</Text>
        <Text style={{ fontSize: 11, color: mine ? "rgba(255,255,255,0.85)" : colors.mutedForeground, alignSelf: "flex-end" }}>
          {time}{mine && m.readAt ? "  ✓✓" : ""}
        </Text>
      </View>
      {m.masked && (
        <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: mine ? "left" : "right" }}>🔒 خبّينا الرقم. تواصلوا من هون أو بزر الاتصال</Text>
      )}
    </View>
  );
}

type Fix = { lat: number; lon: number; accuracy: number | null };

function SendLocationSheet({ visible, onClose, onSend }: { visible: boolean; onClose: () => void; onSend: (p: Fix) => Promise<boolean> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [fix, setFix] = useState<Fix | null>(null);
  const [state, setState] = useState<"locating" | "ready" | "denied" | "failed">("locating");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setFix(null);
    setState("locating");
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") { if (!cancelled) setState("denied"); return; }
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        if (cancelled) return;
        setFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy != null ? Math.round(p.coords.accuracy) : null });
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const quality = fix?.accuracy == null ? null : fix.accuracy <= 25 ? "دقة ممتازة" : fix.accuracy <= 80 ? "دقة منيحة" : "الدقة ضعيفة، اطلع لمكان مفتوح";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.grip, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>ابعت موقعك الدقيق؟</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "left" }}>المندوب بيوصلو دبوس عالخريطة وبيجي لعندك مباشرة</Text>
        <View style={[styles.sheetMap, { borderColor: colors.border }]}>
          {fix ? (
            <AddressPreviewMap latitude={fix.lat} longitude={fix.lon} height={170} pinColor={colors.primary} />
          ) : (
            <View style={{ height: 170, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted, gap: 8 }}>
              {state === "locating" ? <ActivityIndicator color={colors.primary} /> : <MaterialIcons name="location-off" size={28} color={colors.mutedForeground} />}
              <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", paddingHorizontal: 16 }}>
                {state === "locating" ? "عم نحدد مكانك…" : state === "denied" ? "لازم تسمح للتطبيق يعرف موقعك من الإعدادات" : "ما قدرنا نحدد مكانك، جرّب مرة تانية"}
              </Text>
            </View>
          )}
          {fix && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>إنت هون هلق</Text>
              {!!quality && <Text style={{ fontSize: 13, fontWeight: "700", color: (fix.accuracy ?? 999) <= 80 ? colors.success : colors.warning }}>{quality}{fix.accuracy != null ? ` ±${fix.accuracy} م` : ""}</Text>}
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sheetBtn, { backgroundColor: fix ? colors.primary : colors.border }]}
          disabled={!fix || sending}
          onPress={async () => {
            if (!fix) return;
            setSending(true);
            await onSend(fix);
            setSending(false);
          }}
        >
          {sending ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialIcons name="place" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>ابعت الموقع</Text>
            </>
          )}
        </TouchableOpacity>
        {state === "denied" && (
          <TouchableOpacity onPress={() => Linking.openSettings().catch(() => {})} style={{ alignSelf: "center", padding: 8 }}>
            <Text style={{ color: colors.primaryDark, fontWeight: "700" }}>افتح الإعدادات</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose} style={{ alignSelf: "center", padding: 10 }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "700", fontSize: 15 }}>مو هلق</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>موقعك بيروح لمندوب هالطلب بس</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 17, fontWeight: "800", textAlign: "left" },
  sub: { fontSize: 13, textAlign: "left" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  list: { padding: 16, gap: 10 },
  sys: { alignSelf: "center", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  sysText: { fontSize: 12, textAlign: "center" },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, gap: 2 },
  // In RTL "flex-start" is the right edge: my messages sit on the right, theirs on the left.
  mine: { alignSelf: "flex-start" },
  theirs: { alignSelf: "flex-end" },
  mineShape: { borderRadius: 18, borderBottomRightRadius: 6 },
  theirsShape: { borderRadius: 18, borderBottomLeftRadius: 6 },
  locBubble: { width: 240, borderRadius: 18, overflow: "hidden", borderWidth: 2 },
  mapsBtn: { marginTop: 6, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  error: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  locBtn: { height: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locBtnText: { fontSize: 15, fontWeight: "800" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 4 },
  chipText: { fontSize: 14, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  dim: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  grip: { width: 40, height: 5, borderRadius: 999, alignSelf: "center" },
  sheetTitle: { fontSize: 20, fontWeight: "800", textAlign: "left" },
  sheetMap: { borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  sheetBtn: { height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
