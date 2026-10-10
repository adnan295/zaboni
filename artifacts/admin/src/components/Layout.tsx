import { useState, useEffect, useRef } from "react";
import { Activity, Package, Building2, Bike, Headphones, Sparkles, TrendingUp, Settings, Search, ChevronLeft } from "lucide-react";
import { navigationGroups, findNavigation, searchNavigation } from "@/lib/navigation";
import "./workspace.css";
import { Link, useLocation } from "wouter";
import { clearAdminToken, getAdminToken, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import WhatsAppAlertBanner from "@/components/WhatsAppAlertBanner";
import { useWhatsAppAccounts, summarizeWhatsApp } from "@/lib/whatsappStatus";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

const groupIcons = { Activity, Package, Building2, Bike, Headphones, Sparkles, TrendingUp, Settings };

export default function Layout({ children, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const current = findNavigation(location);
  const currentGroup = current?.group ?? navigationGroups[0];
  const matches = searchNavigation(navSearch);
  useEffect(() => { setNavSearch(""); setMobileOpen(false); }, [location]);
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
      void qc.invalidateQueries({ queryKey: ["admin", "support-unread"] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-conversations"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [qc]);

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });

  const { data: slaAlerts = [] } = useQuery({
    queryKey: ["admin", "sla-alerts", 10],
    queryFn: () => api.getSlaAlerts(10),
    refetchInterval: 30_000,
  });

  const { data: supportUnread } = useQuery({
    queryKey: ["admin", "support-unread"],
    queryFn: api.getSupportUnreadCount,
    refetchInterval: 15_000,
  });
  const supportUnreadCount = supportUnread?.count ?? 0;

  const { data: pendingSubRequests } = useQuery({
    queryKey: ["admin", "pending-sub-requests"],
    queryFn: api.getPendingSubscriptionRequestsCount,
    refetchInterval: 30_000,
  });
  const pendingSubCount = pendingSubRequests?.count ?? 0;

  const { data: waAccounts, isError: waError, isLoading: waLoading } = useWhatsAppAccounts();
  const waSummary = waAccounts ? summarizeWhatsApp(waAccounts) : null;
  const waAlert =
    waSummary?.health === "down" || waSummary?.health === "none"
      ? "down"
      : waSummary?.health === "degraded"
        ? "degraded"
        : null;

  const activeOrders =
    stats?.ordersByStatus
      .filter((s) => s.status !== "delivered" && s.status !== "cancelled")
      .reduce((sum, s) => sum + Number(s.count), 0) ?? 0;

  const slaAlertCount = slaAlerts.length;

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const isDark = theme === "dark";

  return (
    <div className="admin-workspace flex h-dvh overflow-hidden bg-background" dir="rtl">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed top-3 right-3 z-50 p-2 rounded-md bg-sidebar text-sidebar-foreground shadow-lg lg:hidden",
          mobileOpen && "hidden",
        )}
        aria-label="فتح القائمة"
      >
        ☰
      </button>

      <aside
        className={cn(
          "flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col z-40 transition-all duration-200",
          "fixed lg:relative inset-y-0 right-0",
          mobileOpen ? "w-56 translate-x-0" : "w-56 translate-x-full",
          "lg:translate-x-0",
          collapsed ? "lg:w-14" : "lg:w-56",
        )}
      >
        <div
          className={cn(
            "px-4 py-5 border-b border-sidebar-border flex items-center",
            collapsed ? "lg:justify-center px-0" : "justify-between",
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0">
                ز
              </div>
              <div>
                <p className="font-bold text-sm leading-tight text-sidebar-foreground">زبوني</p>
                <p className="text-[10px] text-sidebar-foreground/50 leading-tight">لوحة الإدارة</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
              ز
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground lg:hidden mr-auto"
            aria-label="إغلاق القائمة"
          >
            ✕
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex mr-auto text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors p-1 rounded"
            aria-label={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect y="1" width="14" height="2" rx="1" fill="currentColor" />
              <rect y="6" width="14" height="2" rx="1" fill="currentColor" />
              <rect y="11" width="14" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>

        <nav aria-label="الأقسام الرئيسية" className="workspace-navigation flex-1 overflow-y-auto">
          {navigationGroups.map(group => {
            const Icon = groupIcons[group.icon];
            const count = group.id === "orders" ? activeOrders : group.id === "live" ? slaAlertCount : group.id === "drivers" ? pendingSubCount : group.id === "customers" ? supportUnreadCount : 0;
            return <Link key={group.id} href={group.items[0].href} aria-current={group.id === currentGroup.id ? "true" : undefined} title={group.label} onClick={() => setMobileOpen(false)} className={cn("workspace-nav-link", group.id === currentGroup.id && "selected", collapsed && "compact")}>
              <Icon size={20} aria-hidden="true" />
              <span>{group.label}</span>
              {count > 0 && <b className="workspace-count" aria-label={`${count} بحاجة للمتابعة`}>{count}</b>}
              {group.id === "settings" && (waAlert || waError) && <i className="workspace-warning" title="تحقق من حالة واتساب" />}
            </Link>;
          })}
        </nav>

        <div
          className={cn(
            "px-2 py-4 border-t border-sidebar-border space-y-0.5",
          )}
        >
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "وضع فاتح" : "وضع داكن"}
            title={collapsed ? (isDark ? "وضع فاتح" : "وضع داكن") : undefined}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
              collapsed ? "lg:justify-center lg:px-0" : "",
            )}
          >
            <span className="text-base flex-shrink-0">{isDark ? "☀️" : "🌙"}</span>
            {!collapsed && <span>{isDark ? "وضع فاتح" : "وضع داكن"}</span>}
          </button>
          <button
            onClick={handleLogout}
            aria-label="تسجيل الخروج"
            title={collapsed ? "تسجيل الخروج" : undefined}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
              collapsed ? "lg:justify-center lg:px-0" : "",
            )}
          >
            <span className="text-base flex-shrink-0">🚪</span>
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      <main className="workspace-main flex-1 min-w-0 overflow-y-auto">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb"><span>زبوني</span><ChevronLeft size={14}/><strong>{currentGroup.label}</strong></div>
          <div className="workspace-nav-search">
            <Search size={17} aria-hidden="true"/>
            <input aria-label="ابحث عن قسم في الإدارة" placeholder="ابحث عن قسم…" value={navSearch} onChange={e=>setNavSearch(e.target.value)} onKeyDown={e=>{if(e.key === "Escape") setNavSearch("");}} />
            {navSearch.trim() && <div className="workspace-search-results" aria-label="نتائج البحث عن الأقسام">
              {matches.length ? matches.map(item=><Link key={item.href} href={item.href} onClick={()=>setNavSearch("")}><span>{item.label}</span><small>{item.groupLabel}</small></Link>) : <p>لا يوجد قسم بهذا الاسم</p>}
            </div>}
          </div>
          <Link href="/whatsapp" className={cn("workspace-wa", !waError && (waSummary?.health === "ok" || waSummary?.health === "no_backup") && "connected")}>
            <i/>{waLoading ? "واتساب: جارٍ الفحص" : waError ? "واتساب: تعذّر التحقق" : waSummary ? `واتساب ${waSummary.connected}/${waSummary.total}` : "واتساب: غير معروف"}
          </Link>
        </header>
        <div className="workspace-content max-w-7xl mx-auto">
          <div className="workspace-section-heading"><p>{currentGroup.description}</p></div>
          <nav className="workspace-section-tabs" aria-label={`أقسام ${currentGroup.label}`}>
            {currentGroup.items.map(item=><Link key={item.href} href={item.href} aria-current={current?.item.href === item.href ? "page" : undefined} className={cn(current?.item.href === item.href && "selected")}>{item.label}</Link>)}
          </nav>
          <WhatsAppAlertBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
