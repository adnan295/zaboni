import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCart } from "@/context/CartContext";
import { useOrders } from "@/context/OrderContext";
import { useAddresses } from "@/context/AddressContext";
import { useCoupons, COUPONS } from "@/context/CouponsContext";

export default function CartScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, totalItems, totalPrice, restaurantName, updateQuantity, clearCart } = useCart();
  const { placeOrder, orders } = useOrders();
  const { addresses, defaultAddress } = useAddresses();
  const completedOrderCount = orders.filter((o) => o.status === "delivered").length;
  const { appliedCoupon, couponError, discountAmount, applyCoupon, removeCoupon } = useCoupons();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null
  );
  const [note, setNote] = useState("");
  const [couponInput, setCouponInput] = useState("");

  useEffect(() => {
    if (!selectedAddressId && defaultAddress) {
      setSelectedAddressId(defaultAddress.id);
    }
  }, [defaultAddress]);

  const deliveryFee = totalPrice >= 50 ? 0 : 10;
  const discount = discountAmount(totalPrice);
  const total = totalPrice + deliveryFee - discount;

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? defaultAddress;

  const handleOrder = () => {
    if (items.length === 0) return;
    if (!selectedAddress) {
      Alert.alert("تنبيه", "يرجى اختيار عنوان التوصيل أولاً");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const order = placeOrder(items, total, restaurantName ?? "", selectedAddress.address);
    clearCart();
    removeCoupon();
    router.replace(`/order-tracking/${order.id}`);
  };

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    applyCoupon(couponInput, totalPrice, completedOrderCount);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  if (items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card }]}>
            <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>السلة</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="shopping-cart" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>السلة فارغة</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            أضف بعض الأصناف من المطاعم
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.browseBtnText}>تصفح المطاعم</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card }]}>
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>السلة ({totalItems})</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert("تفريغ السلة", "هل تريد تفريغ السلة؟", [
              { text: "إلغاء", style: "cancel" },
              { text: "تفريغ", style: "destructive", onPress: clearCart },
            ]);
          }}
        >
          <Text style={[styles.clearText, { color: colors.destructive }]}>تفريغ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Restaurant Name */}
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            <MaterialIcons name="restaurant" size={16} color={colors.primary} /> {restaurantName}
          </Text>
        </View>

        {/* Items */}
        <View style={styles.itemsList}>
          {items.map((item) => (
            <View key={item.id} style={[styles.cartItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image source={{ uri: item.image }} style={styles.itemImage} />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.foreground }]}>{item.nameAr}</Text>
                <Text style={[styles.itemPrice, { color: colors.primary }]}>{item.price} ر.س</Text>
              </View>
              <View style={[styles.qtyControl, { borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateQuantity(item.id, item.quantity - 1);
                  }}
                  style={styles.qtyBtn}
                >
                  <MaterialIcons
                    name={item.quantity === 1 ? "delete-outline" : "remove"}
                    size={18}
                    color={item.quantity === 1 ? colors.destructive : colors.foreground}
                  />
                </TouchableOpacity>
                <Text style={[styles.qtyNum, { color: colors.foreground }]}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateQuantity(item.id, item.quantity + 1);
                  }}
                  style={styles.qtyBtn}
                >
                  <MaterialIcons name="add" size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Address */}
        <View style={styles.sectionContainer}>
          <View style={styles.addressHeader}>
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              عنوان التوصيل
            </Text>
            <TouchableOpacity onPress={() => router.push("/addresses")}>
              <Text style={[styles.manageAddresses, { color: colors.primary }]}>إدارة العناوين</Text>
            </TouchableOpacity>
          </View>

          {addresses.length === 0 ? (
            <TouchableOpacity
              style={[styles.addAddressBtn, { borderColor: colors.primary, backgroundColor: colors.secondary }]}
              onPress={() => router.push("/addresses")}
            >
              <MaterialIcons name="add-location" size={20} color={colors.primary} />
              <Text style={[styles.addAddressText, { color: colors.primary }]}>إضافة عنوان توصيل</Text>
            </TouchableOpacity>
          ) : (
            addresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[
                  styles.addressCard,
                  {
                    backgroundColor: selectedAddressId === addr.id ? colors.secondary : colors.card,
                    borderColor: selectedAddressId === addr.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedAddressId(addr.id)}
              >
                <View style={[styles.addrRadio, { borderColor: selectedAddressId === addr.id ? colors.primary : colors.mutedForeground }]}>
                  {selectedAddressId === addr.id && (
                    <View style={[styles.addrRadioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <View style={styles.addrInfo}>
                  <View style={styles.addrLabelRow}>
                    <Text style={[styles.addrLabel, { color: colors.foreground }]}>{addr.label}</Text>
                    {addr.isDefault && (
                      <View style={[styles.defaultBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.defaultBadgeText, { color: colors.mutedForeground }]}>افتراضي</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.addrText, { color: colors.mutedForeground }]}>{addr.address}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Coupon Section */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>كوبون الخصم</Text>

          {appliedCoupon ? (
            <View style={[styles.couponApplied, { backgroundColor: "#f0fdf4", borderColor: colors.success }]}>
              <View style={styles.couponAppliedInfo}>
                <View style={[styles.couponIcon, { backgroundColor: "#dcfce7" }]}>
                  <MaterialIcons name="local-offer" size={18} color={colors.success} />
                </View>
                <View style={styles.couponAppliedText}>
                  <Text style={[styles.couponCode, { color: colors.success }]}>{appliedCoupon.code}</Text>
                  <Text style={[styles.couponDesc, { color: colors.mutedForeground }]}>{appliedCoupon.description}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  removeCoupon();
                  setCouponInput("");
                }}
              >
                <MaterialIcons name="close" size={20} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.couponRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.couponInput, { color: colors.foreground }]}
                  placeholder="أدخل كود الخصم..."
                  placeholderTextColor={colors.mutedForeground}
                  value={couponInput}
                  onChangeText={(t) => { setCouponInput(t); }}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={handleApplyCoupon}
                  textAlign="right"
                />
                <TouchableOpacity
                  style={[styles.couponApplyBtn, { backgroundColor: couponInput.trim() ? colors.primary : colors.muted }]}
                  onPress={handleApplyCoupon}
                  disabled={!couponInput.trim()}
                >
                  <Text style={[styles.couponApplyText, { color: couponInput.trim() ? "#fff" : colors.mutedForeground }]}>
                    تطبيق
                  </Text>
                </TouchableOpacity>
              </View>

              {couponError && (
                <View style={styles.couponErrorRow}>
                  <MaterialIcons name="error-outline" size={14} color={colors.destructive} />
                  <Text style={[styles.couponError, { color: colors.destructive }]}>{couponError}</Text>
                </View>
              )}

              {/* Quick coupon suggestions */}
              <View style={styles.couponSuggestions}>
                <Text style={[styles.couponSuggestLabel, { color: colors.mutedForeground }]}>كوبونات متاحة:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.couponChips}>
                  {COUPONS.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.couponChip, { backgroundColor: colors.secondary, borderColor: colors.accent }]}
                      onPress={() => {
                        setCouponInput(c.code);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <MaterialIcons name="local-offer" size={12} color={colors.primary} />
                      <Text style={[styles.couponChipCode, { color: colors.primary }]}>{c.code}</Text>
                      <Text style={[styles.couponChipLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </>
          )}
        </View>

        {/* Note */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>ملاحظات إضافية</Text>
          <TextInput
            style={[styles.noteInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="مثال: بدون بصل، إضافة صلصة حارة..."
            placeholderTextColor={colors.mutedForeground}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlign="right"
            textAlignVertical="top"
          />
        </View>

        {/* Price Summary */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>ملخص الطلب</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>المجموع الجزئي</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalPrice} ر.س</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>رسوم التوصيل</Text>
            <Text style={[styles.summaryValue, { color: deliveryFee === 0 ? colors.success : colors.foreground }]}>
              {deliveryFee === 0 ? "مجاني" : `${deliveryFee} ر.س`}
            </Text>
          </View>
          {discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.success }]}>
                خصم الكوبون ({appliedCoupon?.code})
              </Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                -{discount} ر.س
              </Text>
            </View>
          )}
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>الإجمالي</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{total} ر.س</Text>
          </View>
        </View>
      </ScrollView>

      {/* Order Button */}
      <View style={[styles.orderContainer, { paddingBottom: bottomPadding + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: colors.primary }]}
          onPress={handleOrder}
          activeOpacity={0.85}
        >
          <Text style={styles.orderBtnText}>
            تأكيد الطلب · {total} ر.س
          </Text>
          {discount > 0 && (
            <Text style={styles.orderBtnSaving}>وفرت {discount} ر.س</Text>
          )}
        </TouchableOpacity>
      </View>
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
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  clearText: { fontSize: 14, fontWeight: "600" },
  section: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  itemsList: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  itemImage: { width: 56, height: 56, borderRadius: 10 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 14, fontWeight: "600" },
  itemPrice: { fontSize: 14, fontWeight: "700" },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  qtyBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  qtyNum: { fontSize: 14, fontWeight: "700", minWidth: 24, textAlign: "center" },
  sectionContainer: { paddingHorizontal: 16, marginBottom: 16 },
  addressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionHeading: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  manageAddresses: { fontSize: 13, fontWeight: "600" },
  addAddressBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  addAddressText: { fontSize: 14, fontWeight: "600" },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
    gap: 12,
  },
  addrRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  addrRadioInner: { width: 10, height: 10, borderRadius: 5 },
  addrInfo: { flex: 1 },
  addrLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  addrLabel: { fontSize: 14, fontWeight: "700" },
  defaultBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  defaultBadgeText: { fontSize: 10, fontWeight: "600" },
  addrText: { fontSize: 12, marginTop: 2 },
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  couponInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  couponApplyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    margin: 4,
    borderRadius: 10,
  },
  couponApplyText: { fontSize: 14, fontWeight: "700" },
  couponErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  couponError: { fontSize: 12 },
  couponSuggestions: { gap: 8 },
  couponSuggestLabel: { fontSize: 12 },
  couponChips: { gap: 8 },
  couponChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  couponChipCode: { fontSize: 12, fontWeight: "800" },
  couponChipLabel: { fontSize: 11 },
  couponApplied: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  couponAppliedInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  couponIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  couponAppliedText: { gap: 2 },
  couponCode: { fontSize: 15, fontWeight: "800" },
  couponDesc: { fontSize: 12 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    minHeight: 80,
  },
  summary: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 16, fontWeight: "700" },
  totalValue: { fontSize: 18, fontWeight: "800" },
  orderContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  orderBtn: { borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  orderBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  orderBtnSaving: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptySubtitle: { fontSize: 14, textAlign: "center" },
  browseBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  browseBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
