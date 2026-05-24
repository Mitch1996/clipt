import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

/**
 * Bottom-tab nav. Four tabs match the prompt-pack contract:
 *   Home   — discovery feed (placeholder, wires to Phase 5.1)
 *   Live   — currently-live connected channels (Phase 3.2 lights this up)
 *   Clips  — the user's own clips
 *   Profile — account, billing, log out
 *
 * Colours come from NativeWind tokens; this layout file uses inline
 * hex because Tabs accepts a `tabBarStyle` object rather than a
 * className. Keep these values in sync with tailwind.config.js's
 * background / accent / muted-foreground tokens.
 */
const BG = "#0a0a0a";
const BORDER = "#242424";
const ACCENT = "#FFE600";
const MUTED = "#a3a3a3";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: BORDER,
          borderTopWidth: 0.5,
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-outline" color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          title: "My Clips",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film-outline" color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size - 2} />
          ),
        }}
      />
    </Tabs>
  );
}
