import { useState } from "react";
import { Link, useLocation } from "wouter";
import { clearAdminToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: "📊" },
  { href: "/restaurants", label: "المطاعم", icon: "🍽️" },
  { href: "/orders", label: "الطلبات", icon: "📦" },
  { href: "/couriers", label: "المندوبون", icon: "🚴" },
  { href: "/live-map", label: "الخريطة الحية", icon: "🗺️" },
  { href: "/content", label: "المحتوى", icon: "🖼️" },
  { href: "/courier-applications", label: "طلبات الانضمام", icon: "📋" },
  { href: "/users", label: "المستخدمون", icon: "👤" },
  { href: "/ratings", label: "التقييمات", icon: "⭐" },
  { href: "/promos", label: "أكواد الخصم", icon: "🎟️" },
  { href: "/notifications", label: "الإشعارات", icon: "🔔" },
  { href: "/financial", label: "التقارير المالية", icon: "💰" },
  { href: "/delivery-zones", label: "نطاقات التوصيل", icon: "📍" },
  { href: "/subscriptions", label: "الاشتراكات", icon: "💳" },
  { href: "/wallet-requests", label: "طلبات المحفظة", icon: "👛" },
  { href: "/settings", label: "الإعدادات", icon: "⚙️" },
];

export default function Layout({ children, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });

  const activeOrders =
    stats?.ordersByStatus
      .filter((s) => s.status !== "delivered" && s.status !== "cancelled")
      .reduce((sum, s) => sum + Number(s.count), 0) ?? 0;

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const isDark = theme === "dark";

  return (
    <div className="flex h-screen overflow-hidden bg-background" dir="rtl">
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
                م
              </div>
              <div>
                <p className="font-bold text-sm leading-tight text-sidebar-foreground">مرسول</p>
                <p className="text-[10px] text-sidebar-foreground/50 leading-tight">لوحة الإدارة</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
              م
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
            aria-label="طي القائمة الجانبية"
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect y="1" width="14" height="2" rx="1" fill="currentColor" />
              <rect y="6" width="14" height="2" rx="1" fill="currentColor" />
              <rect y="11" width="14" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? location === "/" || location === ""
                : location.startsWith(item.href);
            const showBadge = item.href === "/orders" && activeOrders > 0;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    collapsed ? "lg:justify-center lg:px-0" : "",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span className="text-base flex-shrink-0 relative">
                    {item.icon}
                    {showBadge && collapsed && (
                      <span className="absolute -top-1 -left-1 w-2 h-2 bg-orange-500 rounded-full" />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 lg:block">{item.label}</span>
                      {showBadge && (
                        <span className="flex items-center gap-1 text-xs font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                          </span>
                          {activeOrders}
                        </span>
                      )}
                    </>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "px-2 py-4 border-t border-sidebar-border space-y-0.5",
          )}
        >
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
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

      <main className="flex-1 overflow-y-auto">
        <div className="h-14 lg:hidden" />
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
