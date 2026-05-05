"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/hooks/use-toast";

const MESSAGES: Record<
  string,
  { title: string; description: string; variant?: "default" | "destructive" }
> = {
  ok: {
    title: "Channel connected",
    description: "We can now pull clips and metadata from this channel.",
  },
  denied: {
    title: "Connection cancelled",
    description: "You declined Twitch authorization. Try again any time.",
    variant: "destructive",
  },
  state_mismatch: {
    title: "Connection failed",
    description:
      "Couldn't verify the OAuth round-trip. Start the flow again from this page.",
    variant: "destructive",
  },
  error: {
    title: "Connection failed",
    description: "Something went wrong on our side. Try again.",
    variant: "destructive",
  },
};

/**
 * Reads ?twitch=<status>&detail=<x> from /dashboard/channels, fires a toast,
 * and strips the params from the URL so a refresh doesn't re-fire it.
 */
export function ChannelsCallbackToast() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;
    const status = search.get("twitch");
    if (!status) return;

    fired.current = true;

    const detail = search.get("detail");
    const base = MESSAGES[status] ?? MESSAGES.error;
    const description =
      status === "ok" && detail
        ? `${base.description} (${detail})`
        : detail
          ? `${base.description} — ${detail}`
          : base.description;

    toast({
      title: base.title,
      description,
      variant: base.variant,
    });

    // Strip query params without forcing a navigation.
    router.replace("/dashboard/channels", { scroll: false });
  }, [router, search, toast]);

  return null;
}
