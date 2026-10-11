import React from "react";
import { Modal, View, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { default as Text } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";

// Keep in sync with CANCEL_REASONS in api-server routes/orders.ts.
export const CANCEL_REASONS = ["too_slow", "changed_mind", "wrong_order", "found_elsewhere", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

const ICONS: Record<CancelReason, keyof typeof MaterialIcons.glyphMap> = {
  too_slow: "hourglass-bottom",
  changed_mind: "sentiment-neutral",
  wrong_order: "edit-note",
  found_elsewhere: "storefront",
  other: "more-horiz",
};

interface Props {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSelect: (reason: CancelReason) => void;
}

/**
 * Bottom sheet shown when a customer cancels an order that is still searching.
 * Picking a reason confirms the cancellation in one tap; "keep waiting" is the
 * prominent default so a hesitant customer stays.
 */
export default function CancelReasonSheet({ visible, busy, onClose, onSelect }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text weight="bold" style={[styles.title, { color: colors.foreground }]}>
          {t("orderTracking.cancelOrder.reasonTitle")}
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {t("orderTracking.cancelOrder.reasonSub")}
        </Text>

        {CANCEL_REASONS.map((r) => (
          <TouchableOpacity
            key={r}
            disabled={busy}
            activeOpacity={0.7}
            onPress={() => onSelect(r)}
            style={[styles.option, { borderColor: colors.border }]}
          >
            <MaterialIcons name={ICONS[r]} size={22} color={colors.primary} />
            <Text weight="medium" style={[styles.optionText, { color: colors.foreground }]}>
              {t(`orderTracking.cancelOrder.reasons.${r}`)}
            </Text>
            <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          disabled={busy}
          activeOpacity={0.85}
          onPress={onClose}
          style={[styles.keep, { backgroundColor: colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text weight="bold" style={[styles.keepText, { color: colors.primaryForeground }]}>
              {t("orderTracking.cancelOrder.keepWaiting")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  // A Modal renders outside the app root that sets direction: "rtl", so set it here.
  sheet: { direction: "rtl", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, marginBottom: 14 },
  title: { fontSize: 18, textAlign: "center" },
  sub: { fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 14 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 8,
  },
  optionText: { flex: 1, fontSize: 15, textAlign: "right" },
  keep: { marginTop: 8, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  keepText: { fontSize: 16 },
});
