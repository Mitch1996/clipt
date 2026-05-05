"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { waitlistSchema, type WaitlistInput } from "../schema";

export type JoinWaitlistResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof WaitlistInput, string>> };

export async function joinWaitlist(input: WaitlistInput): Promise<JoinWaitlistResult> {
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof WaitlistInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof WaitlistInput;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const { email, segment } = parsed.data;

  // Best-effort capture of where the signup came from. Not available in all
  // runtimes (e.g. local dev without proxy headers), which is fine — the
  // column is nullable.
  let source: string | null = null;
  try {
    const h = await headers();
    source = h.get("referer") ?? h.get("x-forwarded-for") ?? null;
  } catch {
    // Headers may not be available in some runtimes.
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist")
    .insert({ email: email.toLowerCase().trim(), segment, source });

  if (error) {
    if (error.code === "23505") {
      // unique violation — already on the list
      return { ok: true };
    }
    console.error("joinWaitlist insert failed:", error);
    return { ok: false, error: "Couldn't save your spot. Please try again." };
  }

  // Fire-and-forget confirmation email — only if Resend is configured.
  if (process.env.RESEND_API_KEY) {
    void sendConfirmationEmail({ email, segment }).catch((err) =>
      console.warn("waitlist confirmation email skipped:", err),
    );
  }

  return { ok: true };
}

async function sendConfirmationEmail({ email, segment }: WaitlistInput) {
  const { Resend } = await import("resend");
  const WaitlistConfirm = (await import("./emails/waitlistConfirm")).default;

  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: "Clipt <hello@clipt.tv>",
    to: email,
    subject: "You're on the Clipt waitlist",
    react: WaitlistConfirm({ email, segment }),
  });
}
