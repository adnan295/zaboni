import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/api";

function playNotificationSound(): void {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);
  } catch {
  }
}

export interface RestaurantSocketResult {
  newOrderCount: number;
  clearNewOrderCount: () => void;
}

export function useRestaurantSocket(enabled: boolean): RestaurantSocketResult {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);

  const clearNewOrderCount = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const token = getToken();
    if (!token) return;

    const socket = io("/orders", {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on("new_restaurant_order", (order: { orderText?: string; id?: string }) => {
      playNotificationSound();
      toast({
        title: "🔔 طلب جديد!",
        description: order.orderText
          ? `${order.orderText.slice(0, 60)}${order.orderText.length > 60 ? "…" : ""}`
          : "وصل طلب جديد",
        duration: 8000,
      });
      setNewOrderCount(n => n + 1);
      void queryClient.invalidateQueries({ queryKey: ["portal-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["portal-stats"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, queryClient, toast]);

  return { newOrderCount, clearNewOrderCount };
}
