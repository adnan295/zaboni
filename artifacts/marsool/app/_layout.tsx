import "@/i18n";
import { initApiClient } from "@/lib/apiConfig";
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
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { ONBOARDING_SEEN_KEY } from "./onboarding";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OrderProvider } from "@/context/OrderContext";
import { ChatProvider } from "@/context/ChatContext";
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

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isCourierMode, isCourier } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((val) => {
      setHasSeenOnboarding(!!val);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (isLoading || !onboardingChecked) return;
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
  }, [user, isLoading, segments, isCourierMode, isCourier, hasSeenOnboarding, onboardingChecked]);

  if (isLoading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F8F8" }}>
        <ActivityIndicator size="large" color="#FF6B00" />
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
          <Stack.Screen name="chat/[orderId]" options={{ headerShown: false }} />
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
                        <OrderProvider>
                          <ChatProvider>
                            <CourierProvider>
                              <GestureHandlerRootView>
                                <KeyboardProvider>
                                  <PushNotificationSetup />
                                  <OrderNotificationBridge />
                                  <RootLayoutNav />
                                </KeyboardProvider>
                              </GestureHandlerRootView>
                            </CourierProvider>
                          </ChatProvider>
                        </OrderProvider>
                      </AddressProvider>
                    </FavoritesProvider>
                  </RatingsProvider>
                </NotificationsProvider>
              </AuthProvider>
            </LanguageGate>
          </LanguageProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
