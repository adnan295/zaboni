import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAdminToken } from "@/lib/api";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Restaurants from "@/pages/Restaurants";
import Orders from "@/pages/Orders";
import Users from "@/pages/Users";
import Couriers from "@/pages/Couriers";
import Ratings from "@/pages/Ratings";
import Promos from "@/pages/Promos";
import Notifications from "@/pages/Notifications";
import Financial from "@/pages/Financial";
import DeliveryZones from "@/pages/DeliveryZones";
import Subscriptions from "@/pages/Subscriptions";
import WalletRequests from "@/pages/WalletRequests";
import Settings from "@/pages/Settings";
import CourierApplications from "@/pages/CourierApplications";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function Router({ onLogout }: { onLogout: () => void }) {
  return (
    <Layout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/restaurants" component={Restaurants} />
        <Route path="/orders" component={Orders} />
        <Route path="/couriers" component={Couriers} />
        <Route path="/users" component={Users} />
        <Route path="/ratings" component={Ratings} />
        <Route path="/promos" component={Promos} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/financial" component={Financial} />
        <Route path="/delivery-zones" component={DeliveryZones} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/wallet-requests" component={WalletRequests} />
        <Route path="/settings" component={Settings} />
        <Route path="/courier-applications" component={CourierApplications} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!getAdminToken());

  useEffect(() => {
    if (!getAdminToken()) setAuthed(false);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {authed ? (
              <Router
                onLogout={() => {
                  setAuthed(false);
                  queryClient.clear();
                }}
              />
            ) : (
              <Login onLogin={() => setAuthed(true)} />
            )}
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
