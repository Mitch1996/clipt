import "../global.css";

import * as React from "react";
import { Redirect, Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";

import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";

/**
 * Root layout. Mounts global providers + decides which route group
 * (auth vs tabs) the user should be in based on session state.
 *
 * The auth gate lives here rather than in each route so deep links
 * (clipt://...) routed at the unauthenticated app still funnel
 * through the sign-in screen.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Gate() {
  const { session } = useAuth();
  const pathname = usePathname();

  // session === undefined → still hydrating from AsyncStorage. Render
  // a blank canvas so we don't flash sign-in for users with a
  // persisted session. AuthProvider resolves in <100ms typical.
  if (session === undefined) {
    return <View className="flex-1 bg-background" />;
  }

  // Signed out + currently inside the tabs → bounce to /sign-in.
  if (!session && !pathname.startsWith("/sign-in") && !pathname.startsWith("/sign-up")) {
    return <Redirect href="/sign-in" />;
  }

  // Signed in + on an auth screen → bounce into the tabs.
  if (session && (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Slot />;
}
