import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ChatSummary, type ChatThread } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  searching: "يبحث عن مندوب",
  accepted: "قبِل المندوب",
  picked_up: "جارٍ التوصيل",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-indigo-100 text-indigo-700",
  accepted: "bg-amber-100 text-amber-700",
  picked_up: "bg-blue-100 text-blue-700",
  on_way: "bg-emerald-100 text-emerald-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

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

// ─── Chat Thread Panel ────────────────────────────────────────────────────

function ChatThreadPanel({
  selected,
  onClose,
}: {
  selected: ChatSummary;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<ChatThread>({
    queryKey: ["admin", "chats", selected.orderId],
    queryFn: () => api.getChatThread(selected.orderId),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Thread header */}
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {selected.customerName ?? "عميل"} ←→ {selected.courierName ?? "مندوب"}
            </span>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-500"}`}>
              {STATUS_LABELS[selected.status] ?? selected.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            طلب #{selected.orderId.slice(-8)} · {formatFullTime(selected.orderCreatedAt)}
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

      {/* Order text */}
      {selected.orderText && (
        <div className="px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border-b shrink-0">
          <p className="text-xs text-muted-foreground">نص الطلب:</p>
          <p className="text-sm font-medium line-clamp-2">{selected.orderText}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {isLoading && (
          <div className="flex justify-center py-10">
            <p className="text-muted-foreground text-sm">جاري التحميل...</p>
          </div>
        )}
        {error && (
          <div className="flex justify-center py-10">
            <p className="text-red-500 text-sm">حدث خطأ أثناء تحميل المحادثة</p>
          </div>
        )}
        {data && data.messages.length === 0 && (
          <div className="flex justify-center py-10">
            <p className="text-muted-foreground text-sm">لا توجد رسائل</p>
          </div>
        )}
        {data?.messages.map((msg) => {
          const isCustomer = msg.senderRole === "customer";
          return (
            <div
              key={msg.id}
              className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isCustomer
                    ? "bg-orange-500 text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}
              >
                <p className="leading-relaxed break-words">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${isCustomer ? "text-orange-100" : "text-muted-foreground"}`}>
                  {isCustomer ? "عميل" : "مندوب"} · {formatFullTime(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Read-only notice */}
      <div className="px-4 py-2 border-t shrink-0 bg-muted/30">
        <p className="text-xs text-center text-muted-foreground">
          عرض للمراجعة فقط · لا يمكن إرسال رسائل من لوحة الإدارة
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function ChatMonitor() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<ChatSummary | null>(null);

  // Proper debounce using useEffect
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: chats = [], isLoading, dataUpdatedAt } = useQuery<ChatSummary[]>({
    queryKey: ["admin", "chats", debouncedSearch],
    queryFn: () => api.getChats(debouncedSearch || undefined),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">مراقبة المحادثات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            سجل المحادثات بين العملاء والمندوبين · قراءة فقط · تتحدث كل 30 ثانية
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
          placeholder="ابحث باسم العميل أو المندوب أو رقم الطلب..."
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

      {/* Layout: list + thread panel */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 520 }}>
        {/* List */}
        <div className={`flex flex-col gap-0 border rounded-xl overflow-hidden bg-card shadow-sm ${selected ? "hidden lg:flex lg:w-2/5 xl:w-1/3" : "w-full"}`}>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <p className="text-muted-foreground text-sm">جاري التحميل...</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <span className="text-4xl">💬</span>
              <p className="font-medium">لا توجد محادثات</p>
              {debouncedSearch && <p className="text-xs">جرب بحثاً مختلفاً</p>}
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {chats.map((chat) => {
                const isActive = selected?.orderId === chat.orderId;
                return (
                  <button
                    key={chat.orderId}
                    onClick={() => setSelected(chat)}
                    className={`w-full text-right px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${isActive ? "bg-orange-50 dark:bg-orange-950/20 border-r-2 border-r-orange-500" : ""}`}
                    dir="rtl"
                  >
                    {/* Row 1: order number + timestamp */}
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{chat.orderId.slice(-8)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(chat.lastMessageAt)}</span>
                    </div>
                    {/* Row 2: customer ←→ courier */}
                    <div className="flex items-center gap-1.5 min-w-0 mb-1">
                      <span className="text-sm font-semibold truncate">
                        {chat.customerName ?? "عميل مجهول"}
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">←→</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {chat.courierName ?? "لم يُسنَد"}
                      </span>
                    </div>
                    {/* Row 3: last message + status badge + message count */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {chat.lastMessageText ?? "—"}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[chat.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {STATUS_LABELS[chat.status] ?? chat.status}
                        </span>
                        <span className="text-xs bg-muted rounded-full px-1.5 py-0.5 font-mono">
                          {chat.messageCount}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Thread panel */}
        {selected ? (
          <div className="flex-1 min-w-0">
            <ChatThreadPanel selected={selected} onClose={() => setSelected(null)} />
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center border rounded-xl bg-card shadow-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <span className="text-5xl block">💬</span>
              <p className="font-medium">اختر محادثة لعرض رسائلها</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
