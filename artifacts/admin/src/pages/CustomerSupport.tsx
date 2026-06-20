import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAdminToken, type SupportConversation, type SupportThread } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { io, type Socket } from "socket.io-client";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `منذ ${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return d.toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ar-SY");
}

function formatFullTime(iso: string) {
  return new Date(iso).toLocaleString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThreadPanel({
  conv,
  onClose,
}: {
  conv: SupportConversation;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<SupportThread>({
    queryKey: ["admin", "support", conv.userId],
    queryFn: () => api.getSupportThread(conv.userId),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  const replyMutation = useMutation({
    mutationFn: (text: string) => api.sendSupportReply(conv.userId, text),
    onSuccess: () => {
      setReplyText("");
      void qc.invalidateQueries({ queryKey: ["admin", "support", conv.userId] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-conversations"] });
    },
    onError: () => toast({ title: "فشل الإرسال", variant: "destructive" }),
  });

  const handleSend = () => {
    const text = replyText.trim();
    if (!text || replyMutation.isPending) return;
    replyMutation.mutate(text);
  };

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {conv.userName ?? "عميل"} · {conv.userPhone ?? ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conv.totalCount} رسالة · آخر نشاط {formatTime(conv.lastMessageAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground text-lg leading-none p-1"
          aria-label="إغلاق"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {isLoading && (
          <div className="flex justify-center py-10">
            <p className="text-muted-foreground text-sm">جاري التحميل...</p>
          </div>
        )}
        {data?.messages.map((msg) => {
          const isCustomer = msg.senderRole === "customer";
          return (
            <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
              {!isCustomer && (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs shrink-0 mr-2 mt-1">
                  د
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isCustomer
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}
              >
                {!isCustomer && (
                  <p className="text-[10px] font-bold text-primary mb-1">فريق الدعم</p>
                )}
                <p className="leading-relaxed break-words">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${isCustomer ? "text-red-100" : "text-muted-foreground"}`}>
                  {formatFullTime(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      <div className="px-4 py-3 border-t shrink-0 bg-background">
        <div className="flex gap-2">
          <textarea
            className="flex-1 border rounded-lg py-2 px-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-card"
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="اكتب ردك للعميل..."
            dir="rtl"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
            }}
          />
          <button
            onClick={handleSend}
            disabled={!replyText.trim() || replyMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
          >
            {replyMutation.isPending ? "..." : "إرسال"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter للإرسال</p>
      </div>
    </div>
  );
}

export default function CustomerSupport() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<SupportConversation | null>(null);
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = io("/orders", {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("support_message_new", ({ userId }: { userId: string }) => {
      void qc.invalidateQueries({ queryKey: ["admin", "support-conversations"] });
      void qc.invalidateQueries({ queryKey: ["admin", "support", userId] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-unread"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [qc]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: conversations = [], isLoading, dataUpdatedAt } = useQuery<SupportConversation[]>({
    queryKey: ["admin", "support-conversations"],
    queryFn: () => api.getSupportConversations(),
    refetchInterval: 15_000,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const filtered = debouncedSearch
    ? conversations.filter(
        (c) =>
          (c.userName ?? "").includes(debouncedSearch) ||
          (c.userPhone ?? "").includes(debouncedSearch),
      )
    : conversations;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            دعم العملاء
            {totalUnread > 0 && (
              <span className="text-sm font-bold bg-red-600 text-white rounded-full px-2 py-0.5">
                {totalUnread}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            محادثات الدعم المباشر مع العملاء · تتحدث كل 15 ثانية
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            آخر تحديث: {new Date(dataUpdatedAt).toLocaleTimeString("ar-SY")}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل أو رقم هاتفه..."
          className="w-full border rounded-lg py-2 pr-9 pl-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          dir="rtl"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Layout */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 520 }}>
        {/* Conversations list */}
        <div
          className={`flex flex-col gap-0 border rounded-xl overflow-hidden bg-card shadow-sm ${
            selected ? "hidden lg:flex lg:w-2/5 xl:w-1/3" : "w-full"
          }`}
        >
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <p className="text-muted-foreground text-sm">جاري التحميل...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <span className="text-4xl">🎧</span>
              <p className="font-medium">لا توجد محادثات دعم</p>
              {debouncedSearch && <p className="text-xs">جرب بحثاً مختلفاً</p>}
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filtered.map((conv) => {
                const isActive = selected?.userId === conv.userId;
                return (
                  <button
                    key={conv.userId}
                    onClick={() => setSelected(conv)}
                    className={`w-full text-right px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      isActive ? "bg-red-50 dark:bg-red-950/20 border-r-2 border-r-primary" : ""
                    }`}
                    dir="rtl"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold truncate">
                        {conv.userName ?? "عميل مجهول"}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {conv.lastMessageText}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 text-xs font-bold bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {conv.userPhone && (
                      <p className="text-xs text-muted-foreground mt-0.5">{conv.userPhone}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Thread panel */}
        {selected ? (
          <div className="flex-1 min-w-0">
            <ThreadPanel conv={selected} onClose={() => setSelected(null)} />
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center border rounded-xl bg-card shadow-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <span className="text-5xl block">🎧</span>
              <p className="font-medium">اختر محادثة للرد عليها</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
