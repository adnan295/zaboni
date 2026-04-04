import React, { createContext, useContext, useState, useCallback } from "react";

export interface ChatMessage {
  id: string;
  orderId: string;
  sender: "customer" | "courier";
  text: string;
  timestamp: number;
}

const COURIER_AUTO_REPLIES = [
  "إن شاء الله 🙏",
  "تمام يا باشا",
  "وصلت قريب",
  "عندك 5 دقايق",
  "أنا في الطريق",
  "ما في مشكلة",
];

const COURIER_GREETING = "أهلاً، استلمت طلبك وأنا في الطريق 🛵";

interface ChatContextValue {
  getMessages: (orderId: string) => ChatMessage[];
  sendCustomerMessage: (orderId: string, text: string) => void;
  triggerCourierGreeting: (orderId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messagesByOrder, setMessagesByOrder] = useState<Record<string, ChatMessage[]>>({});

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessagesByOrder((prev) => ({
      ...prev,
      [msg.orderId]: [...(prev[msg.orderId] ?? []), msg],
    }));
  }, []);

  const getMessages = useCallback(
    (orderId: string) => messagesByOrder[orderId] ?? [],
    [messagesByOrder]
  );

  const triggerCourierGreeting = useCallback(
    (orderId: string) => {
      setMessagesByOrder((prev) => {
        const existing = prev[orderId] ?? [];
        if (existing.some((m) => m.sender === "courier")) return prev;
        const msg: ChatMessage = {
          id: `g${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
          orderId,
          sender: "courier",
          text: COURIER_GREETING,
          timestamp: Date.now(),
        };
        return { ...prev, [orderId]: [...existing, msg] };
      });
    },
    []
  );

  const sendCustomerMessage = useCallback(
    (orderId: string, text: string) => {
      const msg: ChatMessage = {
        id: `m${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        orderId,
        sender: "customer",
        text,
        timestamp: Date.now(),
      };
      addMessage(msg);

      const delay = Math.floor(Math.random() * 1500) + 1500;
      setTimeout(() => {
        const reply = COURIER_AUTO_REPLIES[Math.floor(Math.random() * COURIER_AUTO_REPLIES.length)];
        addMessage({
          id: `r${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
          orderId,
          sender: "courier",
          text: reply,
          timestamp: Date.now(),
        });
      }, delay);
    },
    [addMessage]
  );

  return (
    <ChatContext.Provider value={{ getMessages, sendCustomerMessage, triggerCourierGreeting }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
