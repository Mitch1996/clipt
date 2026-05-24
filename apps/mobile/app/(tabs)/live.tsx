import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

/**
 * Live tab. Lists channels the user has connected that are
 * currently broadcasting. Phase 3.2 turns each row into a tap target
 * that opens the in-app viewer; for the scaffold we just render the
 * list so the data path is exercised.
 *
 * Reads from `channels` filtered by `is_live = true` + owner. The
 * live worker scheduler keeps `is_live` fresh on a 30s tick (see
 * workers/live/app/scheduler.py).
 */

interface LiveChannel {
  id: string;
  platform: string;
  platform_username: string | null;
  last_live_at: string | null;
}

export default function LiveScreen() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<LiveChannel[] | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, platform, platform_username, last_live_at")
        .eq("owner_id", user.id)
        .eq("is_live", true)
        .order("last_live_at", { ascending: false });
      if (mounted) setRows((data ?? []) as LiveChannel[]);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-12">
        <Text className="text-muted-foreground font-mono text-xs uppercase tracking-[0.14em]">
          Live now
        </Text>
        <Text className="text-foreground mt-3 text-3xl font-black tracking-tight">
          Your channels.
        </Text>

        {rows === null ? (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#FFE600" />
          </View>
        ) : rows.length === 0 ? (
          <View className="border-border bg-card mt-8 rounded-md border border-dashed p-6">
            <Text className="text-muted-foreground text-sm">
              No connected channels are live right now. Connect a channel
              on the web at clipt.live/dashboard/channels and check back
              while they&rsquo;re streaming.
            </Text>
          </View>
        ) : (
          <View className="mt-8 gap-2">
            {rows.map((c) => (
              <View
                key={c.id}
                className="border-border bg-card flex-row items-center justify-between rounded-md border p-4"
              >
                <View>
                  <Text className="text-foreground text-base font-semibold">
                    @{c.platform_username ?? "unknown"}
                  </Text>
                  <Text className="text-muted-foreground mt-1 font-mono text-[10px] uppercase tracking-[0.14em]">
                    {c.platform} · live now
                  </Text>
                </View>
                <View className="bg-destructive/15 rounded-full px-2.5 py-1">
                  <Text className="text-destructive font-mono text-[10px] uppercase tracking-[0.14em]">
                    ● Live
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
