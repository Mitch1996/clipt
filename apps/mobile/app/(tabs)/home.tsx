import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Home tab. Placeholder for the algorithmic clip feed (Phase 5.1).
 * Today it just intros the app + lists "what's coming".
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-12">
        <Text className="text-muted-foreground font-mono text-xs uppercase tracking-[0.14em]">
          Home
        </Text>
        <Text className="text-foreground mt-3 text-4xl font-black tracking-tight">
          What&rsquo;s clipping{"\n"}
          right <Text className="text-accent">now.</Text>
        </Text>

        <View className="border-border bg-card mt-10 rounded-md border p-5">
          <Text className="text-accent font-mono text-[10px] uppercase tracking-[0.14em]">
            Coming soon
          </Text>
          <Text className="text-foreground mt-2 text-lg font-semibold">
            Discovery feed
          </Text>
          <Text className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Algorithmic feed of the best clips from streamers you follow
            + new creators worth your time. Tap any clip to watch
            vertical; double-tap to add to your queue.
          </Text>
        </View>

        <View className="border-border bg-card mt-3 rounded-md border p-5">
          <Text className="text-accent font-mono text-[10px] uppercase tracking-[0.14em]">
            Coming soon
          </Text>
          <Text className="text-foreground mt-2 text-lg font-semibold">
            Tap-to-clip live streams
          </Text>
          <Text className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Watch any connected streamer in-app and tap once to clip
            the last 30 seconds. The streamer gets credited + paid.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
