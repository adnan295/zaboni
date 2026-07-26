import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  Platform,
} from "react-native";
import {
  setFatalListener,
  getStoredFatal,
  clearStoredFatal,
  type FatalInfo,
} from "@/lib/crashReporter";

// Full-screen diagnostic overlay that appears when a fatal (otherwise-silent)
// error is captured — either live (via the global handler) or from the previous
// launch (persisted). Intentionally self-contained: it uses only core React
// Native primitives and hard-coded styles, so it still renders even if the
// theme / i18n / font providers are part of what failed.
export default function FatalErrorOverlay() {
  const [info, setInfo] = useState<FatalInfo | null>(null);

  useEffect(() => {
    setFatalListener((next) => setInfo(next));
    // Surface a crash that happened on the previous launch (if the process died
    // before the live listener could render it).
    getStoredFatal().then((stored) => {
      if (stored) setInfo((current) => current ?? stored);
    });
    return () => setFatalListener(null);
  }, []);

  if (!info) return null;

  const fullText =
    `زبوني — تقرير خطأ\n` +
    `الوقت: ${new Date(info.at).toISOString()}\n` +
    `fatal: ${info.isFatal}\n\n` +
    `Message:\n${info.message}\n\n` +
    `Stack:\n${info.stack}`;

  const dismiss = () => {
    clearStoredFatal();
    setInfo(null);
  };

  const share = () => {
    Share.share({ message: fullText }).catch(() => {});
  };

  return (
    <View style={styles.overlay}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <Text style={styles.title}>حدث خطأ — التقط صورة للشاشة وأرسلها</Text>
        <Text style={styles.subtitle}>
          هذه شاشة تشخيص مؤقتة. انسخ النص أو صوّر الشاشة وأرسلها للمطوّر لإصلاح
          المشكلة.
        </Text>

        <View style={styles.buttonsRow}>
          <Pressable onPress={share} style={[styles.button, styles.shareButton]}>
            <Text style={styles.buttonText}>مشاركة / نسخ النص</Text>
          </Pressable>
          <Pressable onPress={dismiss} style={[styles.button, styles.dismissButton]}>
            <Text style={styles.buttonText}>إغلاق</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Message</Text>
        <View style={styles.box}>
          <Text selectable style={styles.mono}>
            {info.message}
          </Text>
        </View>

        <Text style={styles.label}>Stack</Text>
        <View style={styles.box}>
          <Text selectable style={styles.mono}>
            {info.stack || "(no stack)"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1b1b1b",
    zIndex: 99999,
    elevation: 99999,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 12,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#d1d1d1",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  shareButton: { backgroundColor: "#DC2626" },
  dismissButton: { backgroundColor: "#3a3a3a" },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  label: {
    color: "#ff9d9d",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  box: {
    backgroundColor: "#000",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    padding: 10,
  },
  mono: {
    color: "#eaeaea",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: monoFont,
  },
});
