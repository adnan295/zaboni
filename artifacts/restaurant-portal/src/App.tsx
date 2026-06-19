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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function Router({ restaurantName, onLogout }: { restaurantName: string; onLogout: () => void }) {
  return (
    <Layout restaurantName={restaurantName} onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/menu" component={Menu} />
        <Route path="/orders" component={Orders} />
        <Route path="/hours" component={Hours} />
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
