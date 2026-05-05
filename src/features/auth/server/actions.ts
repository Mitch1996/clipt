"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from "../schema";

export type ActionResult<T extends Record<string, string> = Record<string, string>> =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Partial<T> };

async function originUrl() {
  const h = await headers();
  // Prefer the forwarded host (real public URL behind a proxy) over the
  // request host (might be 0.0.0.0 in containers).
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// ─── sign up (email + password) ────────────────────────────────────

export async function signUp(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createClient();
  const origin = await originUrl();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email.toLowerCase().trim(),
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message: "Check your inbox to confirm your email.",
  };
}

// ─── sign in (email + password) ────────────────────────────────────

export async function signIn(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase().trim(),
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── sign out ──────────────────────────────────────────────────────

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ─── forgot password ───────────────────────────────────────────────

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createClient();
  const origin = await originUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email.toLowerCase().trim(),
    {
      redirectTo: `${origin}/auth/reset-password`,
    },
  );

  // Don't leak whether the email exists. Always succeed publicly.
  if (error) console.warn("password reset request failed:", error);
  return {
    ok: true,
    message: "If that email is registered, a reset link is on its way.",
  };
}

// ─── reset password (signed-in via the recovery link) ──────────────

export async function updatePassword(
  input: ResetPasswordInput,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: "Password updated. You're signed in." };
}

// ─── OAuth (Google / Twitch) ───────────────────────────────────────

export async function signInWithProvider(
  provider: "google" | "twitch",
): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient();
  const origin = await originUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      // Twitch needs these scopes for clips/edit + channel reads in 1.2;
      // it's harmless to request them at sign-in time.
      ...(provider === "twitch" && {
        scopes: "user:read:email",
      }),
    },
  });

  if (error || !data?.url) {
    return { ok: false, error: error?.message ?? "OAuth failed to start" };
  }

  return { ok: true, url: data.url };
}
