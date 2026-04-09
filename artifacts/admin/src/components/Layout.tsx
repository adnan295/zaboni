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
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/restaurants", label: "Restaurants", icon: "🍽️" },
  { href: "/orders", label: "Orders", icon: "📦" },
  { href: "/couriers", label: "Couriers", icon: "🚴" },
  { href: "/users", label: "Users", icon: "👤" },
];

export default function Layout({ children, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });

  const activeOrders =
    stats?.ordersByStatus
      .filter((s) => s.status !== "delivered")
      .reduce((sum, s) => sum + Number(s.count), 0) ?? 0;

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const isDark = theme === "dark";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 left-3 z-50 p-2 rounded-md bg-sidebar text-sidebar-foreground shadow-lg lg:hidden"
          aria-label="Open sidebar"
        >
          ☰
        </button>
      )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col z-40 transition-all duration-200",
          "fixed lg:relative inset-y-0 left-0",
          sidebarOpen ? "w-56 translate-x-0" : "w-56 -translate-x-full lg:translate-x-0 lg:w-56",
        )}
      >
        <div className="px-4 py-5 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
              م
            </div>
            <div>
              <p className="font-bold text-sm leading-tight text-sidebar-foreground">مرسول</p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
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
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="flex items-center gap-1 text-xs font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                      </span>
                      {activeOrders}
                    </span>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="px-2 py-4 border-t border-sidebar-border space-y-0.5">
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <span className="text-base">{isDark ? "☀️" : "🌙"}</span>
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <span className="text-base">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden h-14" />
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:flex fixed top-3 left-3 z-50 p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect y="2" width="16" height="2" rx="1" fill="currentColor" />
          <rect y="7" width="16" height="2" rx="1" fill="currentColor" />
          <rect y="12" width="16" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
