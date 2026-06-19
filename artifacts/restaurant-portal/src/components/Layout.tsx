import { useState } from "react";
import { Link, useLocation } from "wouter";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  restaurantName: string;
}

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: "📊" },
  { href: "/menu", label: "قائمة الطعام", icon: "🍽️" },
  { href: "/orders", label: "الطلبات", icon: "📦" },
  { href: "/hours", label: "أوقات العمل", icon: "🕐" },
  { href: "/promo", label: "بوستر ترويجي", icon: "✨" },
  { href: "/settings", label: "إعدادات المطعم", icon: "⚙️" },
];

export default function Layout({ children, onLogout, restaurantName }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background" dir="rtl">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <button
        onClick={() => setMobileOpen(true)}
        className={cn("fixed top-3 right-3 z-50 p-2 rounded-md bg-sidebar text-sidebar-foreground shadow-lg lg:hidden", mobileOpen && "hidden")}
      >
        ☰
      </button>

      <aside className={cn(
        "fixed inset-y-0 right-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-all duration-200",
        "lg:relative lg:translate-x-0",
        mobileOpen ? "translate-x-0 w-64" : "translate-x-full lg:translate-x-0",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate text-sidebar-foreground">🍽️ {restaurantName}</p>
              <p className="text-xs text-sidebar-foreground/60">بوابة المطعم</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:block p-1 rounded hover:bg-sidebar-accent transition-colors text-sidebar-foreground/70">
            {collapsed ? "→" : "←"}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map(item => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors mx-2 rounded-lg",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-900/20 transition-colors",
              collapsed && "justify-center"
            )}
          >
            <span>🚪</span>
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="font-semibold text-foreground">
              {navItems.find(n => n.href === location || (n.href !== "/" && location.startsWith(n.href)))?.label ?? "بوابة المطعم"}
            </h1>
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block">{restaurantName}</span>
        </header>
        <div className="flex-1 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
