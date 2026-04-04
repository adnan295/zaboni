import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CartItem } from "./CartContext";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "on_way" | "delivered";

export interface Order {
  id: string;
  items: CartItem[];
  totalPrice: number;
  restaurantName: string;
  status: OrderStatus;
  createdAt: number;
  address: string;
  estimatedMinutes: number;
}

interface OrderContextValue {
  orders: Order[];
  activeOrder: Order | null;
  placeOrder: (items: CartItem[], totalPrice: number, restaurantName: string, address: string) => Order;
  getOrder: (id: string) => Order | undefined;
  onStatusChange?: (order: Order, newStatus: OrderStatus) => void;
  setStatusChangeHandler: (handler: (order: Order, newStatus: OrderStatus) => void) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

const STATUS_SEQUENCE: OrderStatus[] = ["pending", "confirmed", "preparing", "on_way", "delivered"];

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const statusChangeHandler = useRef<((order: Order, newStatus: OrderStatus) => void) | null>(null);

  const setStatusChangeHandler = useCallback(
    (handler: (order: Order, newStatus: OrderStatus) => void) => {
      statusChangeHandler.current = handler;
    },
    []
  );

  const advanceStatus = useCallback((orderId: string) => {
    setOrders((prev) => {
      const order = prev.find((o) => o.id === orderId);
      if (!order) return prev;
      const currentIdx = STATUS_SEQUENCE.indexOf(order.status);
      if (currentIdx >= STATUS_SEQUENCE.length - 1) return prev;
      const nextStatus = STATUS_SEQUENCE[currentIdx + 1];
      const updated = { ...order, status: nextStatus };
      if (statusChangeHandler.current) {
        statusChangeHandler.current(updated, nextStatus);
      }
      return prev.map((o) => (o.id === orderId ? updated : o));
    });
  }, []);

  const placeOrder = useCallback(
    (items: CartItem[], totalPrice: number, restaurantName: string, address: string): Order => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newOrder: Order = {
        id,
        items,
        totalPrice,
        restaurantName,
        status: "pending",
        createdAt: Date.now(),
        address,
        estimatedMinutes: Math.floor(Math.random() * 20) + 25,
      };
      setOrders((prev) => [newOrder, ...prev]);

      const delays = [3000, 8000, 20000, 35000];
      delays.forEach((delay) => {
        setTimeout(() => advanceStatus(id), delay);
      });

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
