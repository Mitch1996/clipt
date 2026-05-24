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

export default function SignUpScreen() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = React.useState(false);

  async function submit() {
    if (pending) return;
    setError(null);
    setPending(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setPending(false);
    if (err) {
      setError(err.message);
      return;
    }
    // Supabase email-confirmation flow: data.session is null until the
    // user clicks the confirm link. Show a "check your email" state
    // rather than silently sitting on the form.
    if (!data.session) {
      setNeedsConfirm(true);
    }
    // If session IS set (confirmations disabled in dev), AuthProvider
    // picks it up and the root layout redirects automatically.
  }

  if (needsConfirm) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-foreground text-2xl font-bold tracking-tight">
          Check your inbox.
        </Text>
        <Text className="text-muted-foreground mt-3 text-center text-base">
          We sent a confirmation link to{"\n"}
          <Text className="text-foreground">{email.trim()}</Text>.{"\n\n"}
          Tap the link to finish creating your account.
        </Text>
        <Link href="/sign-in" className="mt-10">
          <Text className="text-accent text-sm underline">
            Back to sign in
          </Text>
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-foreground text-4xl font-black tracking-tight">
          Get in early
          <Text className="text-accent">.</Text>
        </Text>
        <Text className="text-muted-foreground mt-3 text-base">
          One account works on web + mobile.
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
              autoComplete="new-password"
              secureTextEntry
              placeholder="8+ characters"
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
            disabled={pending || !email || password.length < 8}
            className={`mt-2 flex-row items-center justify-center rounded-md py-3.5 ${
              pending || !email || password.length < 8 ? "bg-accent/40" : "bg-accent"
            }`}
          >
            {pending ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-accent-foreground text-base font-semibold">
                Create account
              </Text>
            )}
          </Pressable>
        </View>

        <Link href="/sign-in" className="mt-8 self-center">
          <Text className="text-muted-foreground text-sm">
            Already have an account?{" "}
            <Text className="text-foreground underline">Sign in</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
