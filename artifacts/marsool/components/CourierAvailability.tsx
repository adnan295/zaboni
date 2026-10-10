import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import Text from "@/components/AppText";

/** Draw the thumb relative to the track centre so RTL cannot detach it. */
export function CourierAvailability({ online, busy, onToggle }: {
  online: boolean;
  busy: boolean;
  onToggle: () => Promise<void>;
}) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const disabled = busy || pending;
  const toggle = async () => {
    if (locked.current || busy) return;
    locked.current = true;
    setPending(true);
    try { await onToggle(); }
    finally { locked.current = false; setPending(false); }
  };
  return (
    <TouchableOpacity
      accessibilityRole="switch"
      aria-checked={online}
      aria-busy={disabled}
      accessibilityLabel="استقبال الطلبات"
      accessibilityHint={online ? "إيقاف استقبال الطلبات الجديدة" : "تشغيل استقبال الطلبات الجديدة"}
      accessibilityState={{ checked: online, disabled, busy: disabled }}
      onPress={toggle}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.card, { borderColor: online ? "#B9DDCC" : "#DCE3EA", opacity: disabled ? 0.75 : 1 }]}
    >
      <View style={styles.copy}>
        <Text weight="bold" style={styles.title}>{online ? "متاح لاستقبال الطلبات" : "استقبال الطلبات متوقف"}</Text>
        <Text style={styles.subtitle}>{disabled ? "جاري تحديث الحالة…" : online ? "الاستقبال شغّال • اضغط للإيقاف" : "اضغط للتشغيل وبدء استقبال الطلبات"}</Text>
      </View>
      <View pointerEvents="none" style={styles.control}>
        <View style={[styles.track, { backgroundColor: online ? "#16805C" : "#687888" }]}>
          <View style={[styles.thumb, { transform: [{ translateX: online ? 12 : -12 }] }]}>
            {disabled ? <ActivityIndicator size="small" color="#16805C" /> : null}
          </View>
        </View>
        <Text style={[styles.state, { color: online ? "#116345" : "#596B7A" }]}>{online ? "شغّال" : "متوقف"}</Text>
      </View>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 20, borderWidth: 1, backgroundColor: "#fff", minHeight: 96 },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  title: { color: "#172B3A", fontSize: 16, textAlign: "right", lineHeight: 24 },
  subtitle: { color: "#596B7A", fontSize: 12, textAlign: "right", lineHeight: 19 },
  control: { width: 56, alignItems: "center", gap: 5, flexShrink: 0 },
  track: { width: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", direction: "ltr" },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  state: { fontSize: 12 },
});
