import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildImageUrl } from "@/lib/apiConfig";
import type { SelectedOption } from "@/context/CartContext";

const NOTE_MAX = 200;

export interface OptionGroupItem {
  id: string;
  nameAr: string;
  extraPrice: number;
  isDefault?: boolean;
}

export interface OptionGroup {
  id: string;
  nameAr: string;
  options: OptionGroupItem[];
}

interface ItemLike {
  image?: string | null;
  nameAr: string;
  descriptionAr?: string | null;
  price: number;
}

interface Props {
  visible: boolean;
  item: ItemLike | null;
  isDeal?: boolean;
  effectivePrice?: number;
  initialNote?: string;
  initialQty?: number;
  initialSelectedOptions?: SelectedOption[];
  optionGroups?: OptionGroup[];
  isEdit?: boolean;
  onClose: () => void;
  onAdd: (note: string, qty: number, selectedOptions: SelectedOption[]) => void;
}

export default function ItemNoteModal({
  visible,
  item,
  isDeal,
  effectivePrice,
  initialNote = "",
  initialQty = 1,
  initialSelectedOptions,
  optionGroups,
  isEdit = false,
  onClose,
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState(initialNote);
  const [qty, setQty] = useState(initialQty);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string>>({});
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setNote(initialNote);
    setQty(initialQty);

    // Initialise selection from initialSelectedOptions or defaults
    const initial: Record<string, string> = {};
    if (initialSelectedOptions && initialSelectedOptions.length > 0 && optionGroups) {
      for (const sel of initialSelectedOptions) {
        for (const g of optionGroups) {
          if (g.options.some((o) => o.id === sel.optionId)) {
            initial[g.id] = sel.optionId;
            break;
          }
        }
      }
    } else if (optionGroups) {
      for (const g of optionGroups) {
        const def = g.options.find((o) => o.isDefault);
        if (def) initial[g.id] = def.id;
      }
    }
    setSelectedByGroup(initial);
  }, [visible, initialNote, initialQty, initialSelectedOptions, optionGroups]);

  if (!item) return null;

  const basePrice = isDeal && effectivePrice != null ? effectivePrice : item.price;

  const optionsExtra = optionGroups
    ? optionGroups.reduce((sum, g) => {
        const selId = selectedByGroup[g.id];
        const opt = selId ? g.options.find((o) => o.id === selId) : undefined;
        return sum + (opt?.extraPrice ?? 0);
      }, 0)
    : 0;

  const unitPrice = basePrice + optionsExtra;
  const lineTotal = unitPrice * qty;

  const handleAdd = () => {
    const selOptions: SelectedOption[] = [];
    if (optionGroups) {
      for (const g of optionGroups) {
        const selId = selectedByGroup[g.id];
        if (selId) {
          const opt = g.options.find((o) => o.id === selId);
          if (opt) selOptions.push({ optionId: opt.id, nameAr: opt.nameAr, extraPrice: opt.extraPrice });
        }
      }
    }
    onAdd(note.trim(), qty, selOptions);
    onClose();
  };

  const toggleOption = (groupId: string, optionId: string) => {
    setSelectedByGroup((prev) => {
      if (prev[groupId] === optionId) {
        const next = { ...prev };
        delete next[groupId];
        return next;
      }
      return { ...prev, [groupId]: optionId };
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.kavWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.itemRow}>
              <Image
                source={{ uri: buildImageUrl(item.image ?? undefined) }}
                style={styles.itemImage}
                contentFit="cover"
              />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.foreground }]}>{item.nameAr}</Text>
                {item.descriptionAr ? (
                  <Text style={[styles.itemDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {item.descriptionAr}
                  </Text>
                ) : null}
                <View style={[styles.priceBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.priceText, { color: colors.primary }]}>
                    {basePrice.toLocaleString()} ل.س
                  </Text>
                </View>
              </View>
            </View>

            {optionGroups && optionGroups.length > 0 && optionGroups.map((group) => (
              <View key={group.id} style={[styles.optionGroupSection, { borderColor: colors.border }]}>
                <Text style={[styles.optionGroupLabel, { color: colors.foreground }]}>
                  {group.nameAr}
                </Text>
                <View style={styles.optionsList}>
                  {group.options.map((opt) => {
                    const isSelected = selectedByGroup[group.id] === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optionRow,
                          { borderColor: isSelected ? colors.primary : colors.border },
                          isSelected && { backgroundColor: colors.secondary },
                        ]}
                        onPress={() => toggleOption(group.id, opt.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.radioOuter, { borderColor: isSelected ? colors.primary : colors.mutedForeground }]}>
                          {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                        </View>
                        <Text style={[styles.optionName, { color: colors.foreground }]}>{opt.nameAr}</Text>
                        {opt.extraPrice > 0 && (
                          <Text style={[styles.optionPrice, { color: colors.primary }]}>
                            +{opt.extraPrice.toLocaleString()} ل.س
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={[styles.noteSection, { borderColor: colors.border }]}>
              <Text style={[styles.noteLabel, { color: colors.foreground }]}>
                {t("menu.note.title")}
              </Text>
              <View style={[styles.noteInputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.noteInput, { color: colors.foreground }]}
                  placeholder={t("menu.note.placeholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={note}
                  onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
                  multiline
                  textAlignVertical="top"
                  maxLength={NOTE_MAX}
                  returnKeyType="done"
                  blurOnSubmit
                  autoFocus={isEdit}
                />
                <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
                  {note.length}/{NOTE_MAX}
                </Text>
              </View>
            </View>

            {!isEdit && (
              <View style={styles.qtyRow}>
                <Text style={[styles.qtyLabel, { color: colors.foreground }]}>
                  {t("menu.note.qtyLabel")}
                </Text>
                <View style={[styles.qtyStepper, { backgroundColor: colors.secondary }]}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQty((q) => Math.max(1, q - 1))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons
                      name="remove"
                      size={18}
                      color={qty <= 1 ? colors.mutedForeground : colors.foreground}
                    />
                  </TouchableOpacity>
                  <Text style={[styles.qtyNum, { color: colors.foreground }]}>{qty}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQty((q) => Math.min(99, q + 1))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="add" size={18} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: (insets.bottom || 0) + 14 }]}>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={handleAdd}
              activeOpacity={0.85}
            >
              <MaterialIcons name={isEdit ? "check" : "add-shopping-cart"} size={20} color="#fff" />
              <Text style={styles.addBtnText}>
                {isEdit
                  ? t("menu.note.saveBtn")
                  : t("menu.note.addBtn", { total: lineTotal.toLocaleString() })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  kavWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 0,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    left: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  itemDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  priceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 13,
    fontWeight: "800",
  },
  optionGroupSection: {
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  optionGroupLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  optionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  optionPrice: {
    fontSize: 13,
    fontWeight: "700",
  },
  noteSection: {
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  noteInputWrap: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  noteInput: {
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
  },
  charCount: {
    fontSize: 11,
    textAlign: "left",
    fontWeight: "500",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  qtyStepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  qtyNum: {
    fontSize: 16,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "center",
  },
  footer: {
    paddingTop: 14,
    borderTopWidth: 1,
  },
  addBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
