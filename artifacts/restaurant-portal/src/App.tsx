import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getToken, clearToken } from "@/lib/api";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Menu from "@/pages/Menu";
import Orders from "@/pages/Orders";
import Hours from "@/pages/Hours";
import Settings from "@/pages/Settings";
import PromoImages from "@/pages/PromoImages";
import Analytics from "@/pages/Analytics";
import Ratings from "@/pages/Ratings";
import Promos from "@/pages/Promos";
import FlashDeals from "@/pages/FlashDeals";
import NotFound from "@/pages/not-found";
import { useRestaurantSocket } from "@/hooks/useRestaurantSocket";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function Router({ restaurantName, onLogout }: { restaurantName: string; onLogout: () => void }) {
  const { newOrderCount, clearNewOrderCount, soundEnabled, toggleSound } = useRestaurantSocket(true);
  return (
    <Layout restaurantName={restaurantName} onLogout={onLogout} newOrderCount={newOrderCount} onOrdersViewed={clearNewOrderCount} soundEnabled={soundEnabled} onToggleSound={toggleSound}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/menu" component={Menu} />
        <Route path="/orders" component={Orders} />
        <Route path="/hours" component={Hours} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/ratings" component={Ratings} />
        <Route path="/promos" component={Promos} />
        <Route path="/flash-deals" component={FlashDeals} />
        <Route path="/promo" component={PromoImages} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());
  const [restaurantName, setRestaurantName] = useState<string>(() => {
    try {
      return localStorage.getItem("restaurant_portal_name") ?? "مطعمي";
    } catch {
      return "مطعمي";
    }
  });

  useEffect(() => {
    if (!getToken()) setAuthed(false);
  }, []);

  function handleLogin() {
    setAuthed(true);
  }

  function handleLogout() {
    clearToken();
    localStorage.removeItem("restaurant_portal_name");
    setAuthed(false);
    queryClient.clear();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {authed ? (
            <Router restaurantName={restaurantName} onLogout={handleLogout} />
          ) : (
            <Login
              onLogin={(name?: string) => {
                if (name) {
                  setRestaurantName(name);
                  localStorage.setItem("restaurant_portal_name", name);
                }
                handleLogin();
              }}
            />
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
