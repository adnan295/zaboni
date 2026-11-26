import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface ChatMessage {
  id: string;
  from: "customer" | "courier";
  kind: "text" | "location";
  text: string | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  masked: boolean;
  sentToWhatsapp: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface OrderChat {
  role: "customer" | "courier";
  open: boolean;
  unread: number;
  messages: ChatMessage[];
}

const key = (orderId: string) => ["order-chat", orderId];

/**
 * «محادثة الطلب». Polls while it is in use: fast inside the chat, slower for the
 * unread badge on the tracking and delivery screens.
 */
export function useOrderChat(orderId: string | undefined, opts: { enabled?: boolean; live?: boolean } = {}) {
  return useQuery({
    queryKey: key(orderId ?? ""),
    enabled: !!orderId && opts.enabled !== false,
    queryFn: () => customFetch(`/api/orders/${orderId}/messages`) as Promise<OrderChat>,
    refetchInterval: opts.live ? 4000 : 10000,
    retry: false,
  });
}

export function useSendChat(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string } | { lat: number; lon: number; accuracy: number | null }) =>
      customFetch(`/api/orders/${orderId}/messages`, { method: "POST", body: JSON.stringify(body) }) as Promise<{ message: ChatMessage }>,
    onSuccess: ({ message }) => {
      qc.setQueryData<OrderChat>(key(orderId), (old) =>
        old ? { ...old, messages: [...old.messages.filter((m) => m.id !== message.id), message] } : old);
    },
  });
}

/** The other side's messages are read once the chat is on screen. */
export async function markChatRead(orderId: string): Promise<void> {
  await customFetch(`/api/orders/${orderId}/messages/read`, { method: "POST" }).catch(() => {});
}

/** Server error codes → what the person sees. */
export function chatErrorText(code: string | undefined): string {
  switch (code) {
    case "chat_closed": return "انتهى الطلب، فالمحادثة صارت للقراءة بس";
    case "too_many_messages": return "استنّى شوي قبل ما تبعت رسالة تانية";
    case "message_too_long": return "الرسالة طويلة، اختصرها شوي";
    default: return "ما انبعتت الرسالة، جرّب مرة تانية";
  }
}
