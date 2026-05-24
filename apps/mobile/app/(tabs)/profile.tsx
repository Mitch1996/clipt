import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "@/features/auth/AuthProvider";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "https://clipt.live";

/**
 * Profile tab. Minimum useful version: identity + log out + deep
 * links to web pages that don't have a mobile equivalent yet
 * (billing, channel connections). Real billing/channels screens are
 * separate prompt-pack items (Phase 3.3+).
 */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-muted-foreground font-mono text-xs uppercase tracking-[0.14em]">
          Profile
        </Text>
        <Text className="text-foreground mt-3 text-3xl font-black tracking-tight">
          Your account.
        </Text>

        <View className="border-border bg-card mt-8 gap-2 rounded-md border p-5">
          <Text className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.14em]">
            Signed in as
          </Text>
          <Text className="text-foreground text-base">
            {user?.email ?? "(unknown)"}
          </Text>
        </View>

        <View className="mt-6 gap-2">
          <LinkRow
            label="Billing & subscription"
            href={`${APP_URL}/dashboard/billing`}
          />
          <LinkRow
            label="Connected channels"
            href={`${APP_URL}/dashboard/channels`}
          />
          <LinkRow label="Terms" href={`${APP_URL}/terms`} />
          <LinkRow label="Privacy" href={`${APP_URL}/privacy`} />
        </View>

        <Pressable
          onPress={signOut}
          className="border-destructive/40 bg-destructive/10 mt-10 rounded-md border px-4 py-3.5"
        >
          <Text className="text-destructive text-center text-base font-semibold">
            Log out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(href)}
      className="border-border bg-card flex-row items-center justify-between rounded-md border px-4 py-3.5"
    >
      <Text className="text-foreground text-base">{label}</Text>
      <Text className="text-muted-foreground font-mono text-xs">↗</Text>
    </Pressable>
  );
}
