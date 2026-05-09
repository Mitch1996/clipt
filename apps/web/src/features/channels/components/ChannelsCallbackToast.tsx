"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/hooks/use-toast";

const PLATFORM_LABEL: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

type ToastVariant = "default" | "destructive";

const MESSAGES: Record<
  string,
  { title: (p: string) => string; description: (p: string) => string; variant?: ToastVariant }
> = {
  ok: {
    title: () => "Channel connected",
    description: (p) => `We can now pull clips and metadata from your ${p} channel.`,
  },
  denied: {
    title: () => "Connection cancelled",
    description: (p) => `You declined ${p} authorization. Try again any time.`,
    variant: "destructive",
  },
  state_mismatch: {
    title: () => "Connection failed",
    description: () =>
      "Couldn't verify the OAuth round-trip. Start the flow again from this page.",
    variant: "destructive",
  },
  not_configured: {
    title: (p) => `${p} sign-in not set up`,
    description: (p) =>
      `Add the ${p} OAuth keys to .env.local first (see .env.example).`,
    variant: "destructive",
  },
  error: {
    title: () => "Connection failed",
    description: () => "Something went wrong on our side. Try again.",
    variant: "destructive",
  },
};

/**
 * Reads `?twitch=<status>` or `?youtube=<status>` from /dashboard/channels,
 * fires a toast, and strips the params so a refresh doesn't re-fire it.
 */
export function ChannelsCallbackToast() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;

    let platformKey: string | null = null;
    let status: string | null = null;
    for (const key of ["twitch", "youtube", "tiktok", "instagram"]) {
      const value = search.get(key);
      if (value) {
        platformKey = key;
        status = value;
        break;
      }
    }
    if (!platformKey || !status) return;

    fired.current = true;

    const platformLabel = PLATFORM_LABEL[platformKey] ?? platformKey;
    const detail = search.get("detail");
    const base = MESSAGES[status] ?? MESSAGES.error;
    const baseDescription = base.description(platformLabel);
    const description =
      status === "ok" && detail
        ? `${baseDescription} (${detail})`
        : detail
          ? `${baseDescription} — ${detail}`
          : baseDescription;

    toast({
      title: base.title(platformLabel),
      description,
      variant: base.variant,
    });

    router.replace("/dashboard/channels", { scroll: false });
  }, [router, search, toast]);

  return null;
}
