import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useOrders, Order, OrderStatus } from "@/context/OrderContext";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "في الانتظار",
  confirmed: "مؤكد",
  preparing: "جاري التحضير",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  preparing: "#8b5cf6",
  on_way: "#FF6B00",
  delivered: "#22c55e",
};

export default function OrdersScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orders } = useOrders();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>طلباتي</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="receipt-long" size={64} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا توجد طلبات بعد</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              ابدأ بطلب وجبتك المفضلة
            </Text>
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={styles.startBtnText}>اطلب الآن</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/order-tracking/${order.id}`)}
                activeOpacity={0.9}
              >
                <View style={styles.orderTop}>
                  <Text style={[styles.restaurantName, { color: colors.foreground }]}>
                    {order.restaurantName}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + "20" }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
                      {STATUS_LABELS[order.status]}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.items, { color: colors.mutedForeground }]}>
                  {order.items.map((i) => `${i.nameAr} ×${i.quantity}`).join(", ")}
                </Text>

                <View style={[styles.orderBottom, { borderTopColor: colors.border }]}>
                  <Text style={[styles.date, { color: colors.mutedForeground }]}>
                    {new Date(order.createdAt).toLocaleDateString("ar-SA", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={[styles.total, { color: colors.primary }]}>
                    {order.totalPrice} ر.س
                  </Text>
                </View>

                {order.status !== "delivered" && (
                  <View style={[styles.trackRow, { backgroundColor: colors.secondary }]}>
                    <MaterialIcons name="delivery-dining" size={14} color={colors.primary} />
                    <Text style={[styles.trackText, { color: colors.primary }]}>
                      تتبع الطلب
                    </Text>
                    <MaterialIcons name="chevron-left" size={16} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptySubtitle: { fontSize: 14, textAlign: "center" },
  startBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  orderCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    gap: 8,
  },
  orderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  restaurantName: { fontSize: 15, fontWeight: "700" },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  items: { fontSize: 12, lineHeight: 18 },
  orderBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  date: { fontSize: 12 },
  total: { fontSize: 15, fontWeight: "700" },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    gap: 6,
  },
  trackText: { flex: 1, fontSize: 12, fontWeight: "600" },
});
