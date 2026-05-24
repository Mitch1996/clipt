import * as React from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

export default function SignInScreen() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setError(null);
    setPending(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPending(false);
    if (err) {
      setError(err.message);
      return;
    }
    // AuthProvider's onAuthStateChange listener picks up the new
    // session and the root layout's Gate redirects into /(tabs).
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-foreground text-4xl font-black tracking-tight">
          Clipt
          <Text className="text-accent">.</Text>
        </Text>
        <Text className="text-muted-foreground mt-3 text-base">
          Sign in to clip your favourite streamers.
        </Text>

        <View className="mt-10 gap-4">
          <View>
            <Text className="text-muted-foreground mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#666"
              className="border-border bg-card text-foreground rounded-md border px-4 py-3 text-base"
            />
          </View>
          <View>
            <Text className="text-muted-foreground mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#666"
              className="border-border bg-card text-foreground rounded-md border px-4 py-3 text-base"
            />
          </View>

          {error ? (
            <Text className="text-destructive text-sm" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={pending || !email || !password}
            className={`mt-2 flex-row items-center justify-center rounded-md py-3.5 ${
              pending || !email || !password ? "bg-accent/40" : "bg-accent"
            }`}
          >
            {pending ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-accent-foreground text-base font-semibold">
                Sign in
              </Text>
            )}
          </Pressable>
        </View>

        <Link href="/sign-up" className="mt-8 self-center">
          <Text className="text-muted-foreground text-sm">
            New to Clipt?{" "}
            <Text className="text-foreground underline">Create an account</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
