import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAddresses, Address } from "@/context/AddressContext";

type EditingAddress = { id?: string; label: string; address: string };

export default function AddressesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { addresses, addAddress, updateAddress, deleteAddress, setDefault } = useAddresses();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EditingAddress>({ label: "", address: "" });

  const labelSuggestions = t("addresses.labelSuggestions", { returnObjects: true }) as string[];

  const openAdd = () => {
    setEditing({ label: "", address: "" });
    setModalVisible(true);
  };

  const openEdit = (addr: Address) => {
    setEditing({ id: addr.id, label: addr.label, address: addr.address });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!editing.label.trim() || !editing.address.trim()) {
      Alert.alert(t("addresses.alerts.missing"), t("addresses.alerts.missingMsg"));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (editing.id) {
      updateAddress(editing.id, editing.label.trim(), editing.address.trim());
    } else {
      addAddress(editing.label.trim(), editing.address.trim());
    }
    setModalVisible(false);
  };

  const handleDelete = (addr: Address) => {
    Alert.alert(t("addresses.alerts.deleteTitle"), `${addr.label}؟`, [
      { text: t("addresses.alerts.deleteCancel"), style: "cancel" },
      {
        text: t("addresses.alerts.deleteConfirm"),
        style: "destructive",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteAddress(addr.id);
        },
      },
    ]);
  };

  const handleSetDefault = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDefault(id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("addresses.title")}</Text>
        <TouchableOpacity
          style={[styles.addHeaderBtn, { backgroundColor: colors.primary }]}
          onPress={openAdd}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="location-off" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {t("addresses.empty.title")}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {t("addresses.empty.subtitle")}
            </Text>
            <TouchableOpacity
              style={[styles.addEmptyBtn, { backgroundColor: colors.primary }]}
              onPress={openAdd}
            >
              <Text style={styles.addEmptyBtnText}>{t("addresses.empty.add")}</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: addr }) => (
          <View style={[styles.addrCard, { backgroundColor: colors.card, borderColor: addr.isDefault ? colors.primary : colors.border }]}>
            <View style={[styles.addrIconBox, { backgroundColor: addr.isDefault ? colors.secondary : colors.muted }]}>
              <MaterialIcons
                name={addr.label === "المنزل" || addr.label === "Home" ? "home" : addr.label === "العمل" || addr.label === "Work" ? "business" : "location-on"}
                size={22}
                color={addr.isDefault ? colors.primary : colors.mutedForeground}
              />
            </View>
            <View style={styles.addrInfo}>
              <View style={styles.addrLabelRow}>
                <Text style={[styles.addrLabel, { color: colors.foreground }]}>{addr.label}</Text>
                {addr.isDefault && (
                  <View style={[styles.defaultBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>{t("addresses.default")}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.addrText, { color: colors.mutedForeground }]} numberOfLines={2}>
                {addr.address}
              </Text>
            </View>
            <View style={styles.addrActions}>
              {!addr.isDefault && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                  onPress={() => handleSetDefault(addr.id)}
                >
                  <MaterialIcons name="check-circle-outline" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                onPress={() => openEdit(addr)}
              >
                <MaterialIcons name="edit" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#fff0f0" }]}
                onPress={() => handleDelete(addr)}
              >
                <MaterialIcons name="delete-outline" size={18} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {addresses.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, bottom: bottomPadding + 24 }]}
          onPress={openAdd}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={24} color="#fff" />
          <Text style={styles.fabText}>{t("addresses.empty.add")}</Text>
        </TouchableOpacity>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBg}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editing.id ? t("addresses.modal.editTitle") : t("addresses.modal.addTitle")}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsRow}
            >
              {labelSuggestions.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.suggestionChip,
                    {
                      backgroundColor: editing.label === s ? colors.primary : colors.muted,
                    },
                  ]}
                  onPress={() => setEditing((e) => ({ ...e, label: s }))}
                >
                  <Text
                    style={[
                      styles.suggestionText,
                      { color: editing.label === s ? "#fff" : colors.foreground },
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              placeholder={t("addresses.modal.labelPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={editing.label}
              onChangeText={(text) => setEditing((e) => ({ ...e, label: text }))}
              textAlign="right"
              maxLength={30}
            />

            <TextInput
              style={[styles.input, styles.inputMultiline, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              placeholder={t("addresses.modal.addressPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={editing.address}
              onChangeText={(text) => setEditing((e) => ({ ...e, address: text }))}
              textAlign="right"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={200}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>{t("addresses.modal.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>{t("addresses.modal.save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  addHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, gap: 12 },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptySubtitle: { fontSize: 14, textAlign: "center" },
  addEmptyBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addEmptyBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  addrCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  addrIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addrInfo: { flex: 1, gap: 4 },
  addrLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addrLabel: { fontSize: 15, fontWeight: "700" },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: "700" },
  addrText: { fontSize: 12, lineHeight: 18 },
  addrActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  suggestionsRow: { gap: 8, paddingBottom: 4 },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  suggestionText: { fontSize: 13, fontWeight: "600" },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
