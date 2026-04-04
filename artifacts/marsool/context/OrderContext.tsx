import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type OrderStatus = "searching" | "accepted" | "on_way" | "delivered";

export interface Order {
  id: string;
  orderText: string;
  restaurantName: string;
  status: OrderStatus;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  createdAt: number;
  address: string;
  estimatedMinutes: number;
}

const MOCK_COURIERS = [
  { id: "c1", name: "أحمد الزهراني", phone: "+966 50 123 4567", rating: 4.9 },
  { id: "c2", name: "علي المطيري", phone: "+966 55 234 5678", rating: 4.8 },
  { id: "c3", name: "محمد القحطاني", phone: "+966 54 345 6789", rating: 4.7 },
  { id: "c4", name: "سعد العتيبي", phone: "+966 56 456 7890", rating: 4.9 },
  { id: "c5", name: "عبدالله الشمري", phone: "+966 57 567 8901", rating: 5.0 },
  { id: "c6", name: "خالد الدوسري", phone: "+966 58 678 9012", rating: 4.8 },
];

interface OrderContextValue {
  orders: Order[];
  activeOrder: Order | null;
  placeOrder: (orderText: string, restaurantName: string, address: string) => Order;
  getOrder: (id: string) => Order | undefined;
  setStatusChangeHandler: (handler: (order: Order, newStatus: OrderStatus) => void) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const statusChangeHandler = useRef<((order: Order, newStatus: OrderStatus) => void) | null>(null);

  const setStatusChangeHandler = useCallback(
    (handler: (order: Order, newStatus: OrderStatus) => void) => {
      statusChangeHandler.current = handler;
    },
    []
  );

  const advanceStatus = useCallback((orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (!order) return prev;
      const updated = { ...order, status: newStatus };
      if (statusChangeHandler.current) {
        statusChangeHandler.current(updated, newStatus);
      }
      return prev.map((o) => (o.id === orderId ? updated : o));
    });
  }, []);

  const placeOrder = useCallback(
    (orderText: string, restaurantName: string, address: string): Order => {
      const id = `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
      const courier = MOCK_COURIERS[Math.floor(Math.random() * MOCK_COURIERS.length)];
      const newOrder: Order = {
        id,
        orderText,
        restaurantName,
        status: "searching",
        courierName: courier.name,
        courierPhone: courier.phone,
        courierRating: courier.rating,
        courierId: courier.id,
        createdAt: Date.now(),
        address,
        estimatedMinutes: Math.floor(Math.random() * 15) + 20,
      };
      setOrders((prev) => [newOrder, ...prev]);

      const searchDelay = Math.floor(Math.random() * 3000) + 4000;
      setTimeout(() => advanceStatus(id, "accepted"), searchDelay);
      setTimeout(() => advanceStatus(id, "on_way"), searchDelay + 90000);
      setTimeout(() => advanceStatus(id, "delivered"), searchDelay + 90000 + 300000);

      return newOrder;
    },
    [advanceStatus]
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders]
  );

  const activeOrder = orders.find((o) => o.status !== "delivered") ?? null;

  return (
    <OrderContext.Provider value={{ orders, activeOrder, placeOrder, getOrder, setStatusChangeHandler }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
