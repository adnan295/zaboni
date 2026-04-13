import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Platform } from "react-native";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { useAuth } from "@/context/AuthContext";

export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderRole: "customer" | "courier";
  text: string;
  createdAt: string | Date;
}

interface ChatContextValue {
  getMessages: (orderId: string) => ChatMessage[];
  isOtherPartyTyping: (orderId: string, myRole: "customer" | "courier") => boolean;
  sendMessage: (orderId: string, text: string) => void;
  sendTyping: (orderId: string) => void;
  sendStopTyping: (orderId: string) => void;
  joinOrder: (orderId: string) => Promise<void>;
  isConnected: boolean;
  sendCustomerMessage: (orderId: string, text: string) => void;
  triggerCourierGreeting: (orderId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [messagesByOrder, setMessagesByOrder] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [typingBySenderRole, setTypingBySenderRole] = useState<
    Record<string, string | null>
  >({});
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const typingTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  useEffect(() => {
    if (!token || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      joinedRoomsRef.current.clear();
      return;
    }

    const baseUrl = Platform.OS === "web" ? undefined : getApiBaseUrl();

    const socketUrl = baseUrl ? `${baseUrl}/chat` : "/chat";
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      joinedRoomsRef.current.forEach((orderId) => {
        socket.emit("join", { orderId });
      });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("history", (messages: ChatMessage[]) => {
      if (messages.length === 0) return;
      const orderId = messages[0].orderId;
      setMessagesByOrder((prev) => ({ ...prev, [orderId]: messages }));
    });

    socket.on("message", (msg: ChatMessage) => {
      setMessagesByOrder((prev) => {
        const existing = prev[msg.orderId] ?? [];
        const alreadyExists = existing.some((m) => m.id === msg.id);
        if (alreadyExists) return prev;
        return { ...prev, [msg.orderId]: [...existing, msg] };
      });
    });

    socket.on(
      "typing",
      ({ orderId, senderRole }: { senderId: string; senderRole: string; orderId: string }) => {
        if (!orderId || !senderRole) return;
        setTypingBySenderRole((prev) => ({ ...prev, [orderId]: senderRole }));
      }
    );

    socket.on(
      "stop-typing",
      ({ orderId, senderRole }: { senderId: string; senderRole?: string; orderId: string }) => {
        if (!orderId) return;
        setTypingBySenderRole((prev) => {
          if (senderRole && prev[orderId] !== senderRole) return prev;
          return { ...prev, [orderId]: null };
        });
      }
    );

    socket.on("error", (err: { message: string }) => {
      console.warn("Chat socket error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joinedRoomsRef.current.clear();
    };
  }, [token, user?.id]);

  const joinOrder = useCallback(async (orderId: string) => {
    joinedRoomsRef.current.add(orderId);

    if (token) {
      try {
        const baseUrl = Platform.OS === "web" ? "" : getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/chat/${orderId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: ChatMessage[] = await res.json();
          if (data.length > 0) {
            setMessagesByOrder((prev) => ({ ...prev, [orderId]: data }));
          }
        }
      } catch {
      }
    }

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("join", { orderId });
    }
  }, [token]);

  const getMessages = useCallback(
    (orderId: string): ChatMessage[] => messagesByOrder[orderId] ?? [],
    [messagesByOrder]
  );

  const isOtherPartyTyping = useCallback(
    (orderId: string, myRole: "customer" | "courier"): boolean => {
      const typingRole = typingBySenderRole[orderId];
      if (!typingRole) return false;
      return typingRole !== myRole;
    },
    [typingBySenderRole]
  );

  const sendMessage = useCallback((orderId: string, text: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("message", { orderId, text });
  }, []);

  const sendTyping = useCallback((orderId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("typing", { orderId });
    if (typingTimerRef.current[orderId]) {
      clearTimeout(typingTimerRef.current[orderId]);
    }
    typingTimerRef.current[orderId] = setTimeout(() => {
      socket.emit("stop-typing", { orderId });
    }, 3000);
  }, []);

  const sendStopTyping = useCallback((orderId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (typingTimerRef.current[orderId]) {
      clearTimeout(typingTimerRef.current[orderId]);
    }
    socket.emit("stop-typing", { orderId });
  }, []);

  const sendCustomerMessage = useCallback(
    (orderId: string, text: string) => {
      sendMessage(orderId, text);
    },
    [sendMessage]
  );

  const triggerCourierGreeting = useCallback(
    (_orderId: string) => {
    },
    []
  );

  return (
    <ChatContext.Provider
      value={{
        getMessages,
        isOtherPartyTyping,
        sendMessage,
        sendTyping,
        sendStopTyping,
        joinOrder,
        isConnected,
        sendCustomerMessage,
        triggerCourierGreeting,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
