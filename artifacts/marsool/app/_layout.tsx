import "@/i18n";
import { initApiClient } from "@/lib/apiConfig";
import { installCrashReporter, setCrashContext } from "@/lib/crashReporter";
installCrashReporter();
initApiClient();
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
  useFonts as useTajawalFonts,
} from "@expo-google-fonts/tajawal";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  useFonts as useInterFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useNavigationContainerRef, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AppUpdatePrompt from "@/components/AppUpdatePrompt";
import React, { useEffect, useState } from "react";
import { ONBOARDING_SEEN_KEY } from "./onboarding";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FatalErrorOverlay from "@/components/FatalErrorOverlay";
import { OrderProvider } from "@/context/OrderContext";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { AddressProvider } from "@/context/AddressContext";
import { RatingsProvider } from "@/context/RatingsContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { CourierProvider } from "@/context/CourierContext";
import OrderNotificationBridge from "@/components/OrderNotificationBridge";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import ToastBanner from "@/components/ToastBanner";

SplashScreen.preventAutoHideAsync();

// Anchor the root navigator to the customer tabs. Without an explicit
// `app/index.tsx`, the `/` route is served from inside the `(tabs)` group,
// and on a cold start Expo Router would otherwise fall back to the
// alphabetically-first sibling group — `(courier)` — dropping a freshly
// installed, logged-out user straight onto the (broken, token-less) courier
// screen. Pinning the anchor to `(tabs)` makes the entry deterministic; the
// AuthGate below then redirects to onboarding / auth / courier as needed.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isCourierMode, isCourier } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  // Redirecting before the root navigator is ready throws "Attempted to navigate
  // before mounting the Root Layout component". The router decides that with
  // `navigationRef.isReady()`, so the same check is used here. It flips without a
  // render of its own, hence the short poll once the Stack below is on screen.
  const navigationRef = useNavigationContainerRef();
  const [navigationReady, setNavigationReady] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((val) => {
      setHasSeenOnboarding(!!val);
      setOnboardingChecked(true);
    });
  }, []);

  const stackMounted = !isLoading && onboardingChecked;
  useEffect(() => {
    if (!stackMounted || navigationReady) return;
    if (navigationRef.isReady()) {
      setNavigationReady(true);
      return;
    }
    const id = setInterval(() => {
      if (navigationRef.isReady()) {
        clearInterval(id);
        setNavigationReady(true);
      }
    }, 30);
    return () => clearInterval(id);
  }, [stackMounted, navigationReady, navigationRef]);

  useEffect(() => {
    setCrashContext({
      route: "/" + segments.join("/"),
      role: isCourier && isCourierMode ? "courier" : user ? "customer" : "guest",
    });
  }, [segments, user, isCourier, isCourierMode]);

  useEffect(() => {
    if (isLoading || !onboardingChecked || !navigationReady || !navigationRef.isReady()) return;
    const inAuthGroup = segments[0] === "auth";
    const inCourierGroup = segments[0] === "(courier)";
    const inTabsGroup = segments[0] === "(tabs)";
    const inOnboarding = segments[0] === "onboarding";
    const inLegal = segments[0] === "legal";

    if (!user && !inAuthGroup && !inOnboarding && !inLegal) {
      if (!hasSeenOnboarding) {
        router.replace("/onboarding");
      } else {
        router.replace("/auth/phone");
      }
    } else if (user && inAuthGroup) {
      if (isCourier && isCourierMode) {
        router.replace("/(courier)/available");
      } else {
        router.replace("/(tabs)");
      }
    } else if (user && inOnboarding) {
      router.replace("/(tabs)");
    } else if (user && isCourier && isCourierMode && inTabsGroup) {
      router.replace("/(courier)/available");
    } else if (user && (!isCourier || !isCourierMode) && inCourierGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments, isCourierMode, isCourier, hasSeenOnboarding, onboardingChecked, navigationReady]);

  // While the session loads only the spinner is shown: mounting the screens early
  // would let them call the API before the stored token is in place. The navigator
  // therefore first mounts in the same render that wants to redirect, which is why
  // the redirect above waits for `navigationReady` and re-runs when it flips.
  if (isLoading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F8F8" }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  return <>{children}</>;
}

function LanguageGate({ children }: { children: React.ReactNode }) {
  const { isReady } = useLanguage();
  if (!isReady) return null;
  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <View style={layoutStyles.root}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(courier)" options={{ headerShown: false }} />
          <Stack.Screen name="auth/phone" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
          <Stack.Screen name="auth/name" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[id]" options={{ headerShown: false, presentation: "card" }} />
          <Stack.Screen name="order-request" options={{ headerShown: false }} />
          <Stack.Screen name="order-tracking/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="order-chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="orders" options={{ headerShown: false }} />
          <Stack.Screen name="favorites" options={{ headerShown: false }} />
          <Stack.Screen name="addresses" options={{ headerShown: false }} />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="rate-order" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
          <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
          <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
      <ToastBanner />
      <AppUpdatePrompt />
    </View>
  );
}

const layoutStyles = StyleSheet.create({
  root: { flex: 1 },
});

export default function RootLayout() {
  const [tajawalLoaded, tajawalError] = useTajawalFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  });
  const [interLoaded, interError] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  const fontsLoaded = tajawalLoaded && interLoaded;
  const fontError = tajawalError || interError;

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <LanguageGate>
              <AuthProvider>
                <NotificationsProvider>
                  <RatingsProvider>
                    <FavoritesProvider>
                      <AddressProvider>
                        <CartProvider>
                        <OrderProvider>
                          <CourierProvider>
                            <GestureHandlerRootView style={{ flex: 1, direction: "rtl" }}>
                              <KeyboardProvider>
                                <PushNotificationSetup />
                                <OrderNotificationBridge />
                                <RootLayoutNav />
                              </KeyboardProvider>
                            </GestureHandlerRootView>
                          </CourierProvider>
                        </OrderProvider>
                        </CartProvider>
                      </AddressProvider>
                    </FavoritesProvider>
                  </RatingsProvider>
                </NotificationsProvider>
              </AuthProvider>
            </LanguageGate>
          </LanguageProvider>
        </QueryClientProvider>
      </ErrorBoundary>
      {/* Diagnostic overlay — renders above everything to surface otherwise-silent
          fatal errors (async/global) that <ErrorBoundary> cannot catch. */}
      <FatalErrorOverlay />
    </SafeAreaProvider>
  );
}
