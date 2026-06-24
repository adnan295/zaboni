import { useState } from "react";
import { Link, useLocation } from "wouter";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart2,
  Star,
  UtensilsCrossed,
  ClipboardList,
  Clock,
  Zap,
  Tag,
  Sparkles,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  restaurantName: string;
  newOrderCount?: number;
  onOrdersViewed?: () => void;
}

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/analytics", label: "التقارير", icon: BarChart2 },
  { href: "/ratings", label: "التقييمات", icon: Star },
  { href: "/menu", label: "قائمة الطعام", icon: UtensilsCrossed },
  { href: "/orders", label: "الطلبات", icon: ClipboardList, badgeKey: true },
  { href: "/hours", label: "أوقات العمل", icon: Clock },
  { href: "/flash-deals", label: "عروض فلاش", icon: Zap },
  { href: "/promos", label: "أكواد الخصم", icon: Tag },
  { href: "/promo", label: "بوستر ترويجي", icon: Sparkles },
  { href: "/settings", label: "إعدادات المطعم", icon: Settings },
];

export default function Layout({ children, onLogout, restaurantName, newOrderCount = 0, onOrdersViewed }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    if (href === "/orders" && onOrdersViewed) {
      onOrdersViewed();
    }
  };

  const currentLabel = navItems.find(n => n.href === location || (n.href !== "/" && location.startsWith(n.href)))?.label ?? "بوابة المطعم";

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30" dir="rtl">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <button
        onClick={() => setMobileOpen(true)}
        className={cn("fixed top-3 right-3 z-50 p-2 rounded-lg bg-sidebar text-sidebar-foreground shadow-lg lg:hidden", mobileOpen && "hidden")}
      >
        <Menu size={18} />
      </button>

      <aside className={cn(
        "fixed inset-y-0 right-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground border-l border-sidebar-border transition-all duration-200",
        "lg:relative lg:translate-x-0",
        mobileOpen ? "translate-x-0 w-64" : "translate-x-full lg:translate-x-0",
        collapsed ? "lg:w-[68px]" : "lg:w-64"
      )}>
        <div className="flex items-center justify-between px-4 py-[18px] border-b border-sidebar-border">
          {!collapsed && (
            <div className="overflow-hidden flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <UtensilsCrossed size={16} className="text-primary-foreground" />
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-sm truncate text-sidebar-foreground leading-tight">{restaurantName}</p>
                <p className="text-[11px] text-sidebar-foreground/50 leading-tight">بوابة المطعم</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <UtensilsCrossed size={16} className="text-primary-foreground" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-6 h-6 rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground"
          >
            {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {navItems.map(item => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const showBadge = item.badgeKey && newOrderCount > 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 relative",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <span className="relative shrink-0">
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {showBadge && collapsed && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {newOrderCount > 9 ? "9+" : newOrderCount}
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between">
                    {item.label}
                    {showBadge && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none animate-pulse">
                        {newOrderCount > 99 ? "99+" : newOrderCount}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-400 transition-colors",
              collapsed && "justify-center"
            )}
          >
            <LogOut size={18} />
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="font-semibold text-base text-foreground">{currentLabel}</h1>
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block font-medium">{restaurantName}</span>
        </header>
        <div className="flex-1 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
