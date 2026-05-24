import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

interface Clip {
  id: string;
  title: string | null;
  status: string;
  processing_step: string | null;
  created_at: string;
  duration_seconds: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function ClipsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<Clip[] | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("clips")
        .select("id, title, status, processing_step, created_at, duration_seconds")
        .eq("clipper_profile_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) setRows((data ?? []) as Clip[]);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-12">
        <Text className="text-muted-foreground font-mono text-xs uppercase tracking-[0.14em]">
          My clips
        </Text>
        <Text className="text-foreground mt-3 text-3xl font-black tracking-tight">
          Everything you&rsquo;ve clipped.
        </Text>

        {rows === null ? (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#FFE600" />
          </View>
        ) : rows.length === 0 ? (
          <View className="border-border bg-card mt-8 rounded-md border border-dashed p-6">
            <Text className="text-muted-foreground text-sm">
              You haven&rsquo;t clipped anything yet. Tap-to-clip lands in
              the next mobile drop; for now you can create clips on the
              web at clipt.live.
            </Text>
          </View>
        ) : (
          <View className="mt-8 gap-2">
            {rows.map((c) => (
              <View
                key={c.id}
                className="border-border bg-card rounded-md border p-4"
              >
                <Text className="text-foreground text-base font-medium">
                  {c.title ?? "Untitled clip"}
                </Text>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.14em]">
                    {STATUS_LABEL[c.status] ?? c.status}
                    {c.processing_step ? ` · ${c.processing_step}` : ""}
                  </Text>
                  <Text className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {c.duration_seconds ? `${Math.round(c.duration_seconds)}s` : ""}
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
