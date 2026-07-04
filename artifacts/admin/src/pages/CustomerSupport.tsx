import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  getAdminToken,
  type AdminTicket,
  type AdminTicketDetail,
  type SupportTicketCategory,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { io, type Socket } from "socket.io-client";

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  order_delayed: "طلب متأخر",
  wrong_items: "عناصر خاطئة",
  damaged: "طلب تالف",
  payment: "مشكلة دفع",
  other: "أخرى",
};

const CATEGORY_COLORS: Record<SupportTicketCategory, { bg: string; text: string }> = {
  order_delayed: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  wrong_items: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400" },
  damaged: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  payment: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400" },
  other: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400" },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  searching: "جاري البحث",
  accepted: "بالطريق للمطعم",
  picked_up: "استلم الطلب",
  on_way: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغى",
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

function CategoryBadge({ category }: { category: SupportTicketCategory }) {
  const colors = CATEGORY_COLORS[category];
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function StatusBadge({ status }: { status: "open" | "resolved" }) {
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        status === "open"
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {status === "open" ? "مفتوحة" : "محلولة"}
    </span>
  );
}

function ThreadPanel({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: AdminTicket;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<AdminTicketDetail>({
    queryKey: ["admin", "support-ticket", ticket.id],
    queryFn: () => api.getAdminTicket(ticket.id),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  const replyMutation = useMutation({
    mutationFn: (text: string) => api.sendAdminTicketReply(ticket.id, text),
    onSuccess: () => {
      setReplyText("");
      void qc.invalidateQueries({ queryKey: ["admin", "support-ticket", ticket.id] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
    },
    onError: () => toast({ title: "فشل الإرسال", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveAdminTicket(ticket.id),
    onSuccess: () => {
      toast({ title: "تم إغلاق التذكرة" });
      void qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
      onResolved();
    },
    onError: () => toast({ title: "فشل الإغلاق", variant: "destructive" }),
  });

  const handleSend = () => {
    const text = replyText.trim();
    if (!text || replyMutation.isPending) return;
    replyMutation.mutate(text);
  };

  const order = data?.ticket.order;

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-semibold text-sm truncate">
              {ticket.userName ?? "عميل"} · {ticket.userPhone ?? ""}
            </span>
            <CategoryBadge category={ticket.category} />
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ticket.status === "open" && (
              <button
                onClick={() => resolveMutation.mutate()}
                disabled={resolveMutation.isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {resolveMutation.isPending ? "..." : "✓ إغلاق التذكرة"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-lg leading-none p-1"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Order context card */}
        {order && (
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" dir="rtl">
            <span>
              <span className="text-muted-foreground">مطعم: </span>
              <span className="font-semibold">{order.restaurantName}</span>
            </span>
            <span>
              <span className="text-muted-foreground">حالة الطلب: </span>
              <span className="font-semibold">{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
            </span>
            {order.totalPrice !== null && (
              <span>
                <span className="text-muted-foreground">المبلغ: </span>
                <span className="font-semibold">
                  {(order.totalPrice + order.deliveryFee).toLocaleString("ar-SY")} ل.س
                </span>
              </span>
            )}
            <span>
              <span className="text-muted-foreground">تاريخ: </span>
              <span className="font-semibold">{formatTime(order.createdAt)}</span>
            </span>
          </div>
        )}
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
      {ticket.status === "open" && (
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
      )}
      {ticket.status === "resolved" && (
        <div className="px-4 py-3 border-t shrink-0 text-center text-sm text-muted-foreground">
          هذه التذكرة محلولة · تم إغلاقها في {ticket.resolvedAt ? formatTime(ticket.resolvedAt) : ""}
        </div>
      )}
    </div>
  );
}

const ALL_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "", label: "كل الفئات" },
  { key: "order_delayed", label: "طلب متأخر" },
  { key: "wrong_items", label: "عناصر خاطئة" },
  { key: "damaged", label: "طلب تالف" },
  { key: "payment", label: "مشكلة دفع" },
  { key: "other", label: "أخرى" },
];

export default function CustomerSupport() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "">( "open");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<AdminTicket | null>(null);
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

    socket.on("support_message_new", () => {
      void qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
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

  const { data: tickets = [], isLoading, dataUpdatedAt } = useQuery<AdminTicket[]>({
    queryKey: ["admin", "support-tickets", statusFilter, categoryFilter],
    queryFn: () =>
      api.getAdminTickets({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      }),
    refetchInterval: 15_000,
  });

  const totalUnread = tickets.reduce((sum, t) => sum + t.unreadCount, 0);

  const filtered = debouncedSearch
    ? tickets.filter(
        (t) =>
          (t.userName ?? "").includes(debouncedSearch) ||
          (t.userPhone ?? "").includes(debouncedSearch) ||
          (t.orderRef ?? "").includes(debouncedSearch),
      )
    : tickets;

  const handleResolved = () => {
    setSelected(null);
  };

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
            تذاكر الدعم مرتّبة حسب الأحدث · تتحدث كل 15 ثانية
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            آخر تحديث: {new Date(dataUpdatedAt).toLocaleTimeString("ar-SY")}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status filter */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            onClick={() => setStatusFilter("open")}
            className={`px-3 py-1.5 font-semibold transition-colors ${
              statusFilter === "open"
                ? "bg-primary text-white"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            مفتوحة
          </button>
          <button
            onClick={() => setStatusFilter("")}
            className={`px-3 py-1.5 font-semibold transition-colors border-r ${
              statusFilter === ""
                ? "bg-primary text-white"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            الكل
          </button>
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border rounded-lg py-1.5 px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          dir="rtl"
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم هاتفه..."
            className="w-full border rounded-lg py-1.5 pr-9 pl-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
      </div>

      {/* Layout */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 520 }}>
        {/* Ticket list */}
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
              <p className="font-medium">لا توجد تذاكر دعم</p>
              {debouncedSearch && <p className="text-xs">جرب بحثاً مختلفاً</p>}
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filtered.map((ticket) => {
                const isActive = selected?.id === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelected(ticket)}
                    className={`w-full text-right px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      isActive ? "bg-red-50 dark:bg-red-950/20 border-r-2 border-r-primary" : ""
                    }`}
                    dir="rtl"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold truncate">
                        {ticket.userName ?? "عميل مجهول"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ticket.unreadCount > 0 && (
                          <span className="text-xs font-bold bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
                            {ticket.unreadCount}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(ticket.lastMessageAt ?? ticket.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <CategoryBadge category={ticket.category} />
                      <StatusBadge status={ticket.status} />
                      {ticket.orderRef && (
                        <span className="text-[11px] text-muted-foreground">· {ticket.orderRef}</span>
                      )}
                    </div>
                    {ticket.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate">{ticket.lastMessage}</p>
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
            <ThreadPanel
              ticket={selected}
              onClose={() => setSelected(null)}
              onResolved={handleResolved}
            />
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center border rounded-xl bg-card shadow-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <span className="text-5xl block">🎧</span>
              <p className="font-medium">اختر تذكرة للرد عليها</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
