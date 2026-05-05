"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { signInWithProvider } from "../server/actions";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M5.27 9.76A7 7 0 0 1 12 5c1.6 0 3.07.59 4.21 1.74l2.53-2.52A11 11 0 0 0 12 1.5 11.5 11.5 0 0 0 1.5 12L5.27 9.76Z"
      />
      <path
        fill="#34A853"
        d="M5.27 14.24A7 7 0 0 0 12 19c1.7 0 3.13-.55 4.18-1.5l3.66 2.84A11 11 0 0 1 12 22.5 11.5 11.5 0 0 1 1.5 12l3.77 2.24Z"
      />
      <path
        fill="#FBBC05"
        d="M22.5 12c0-.84-.07-1.67-.21-2.46H12v4.65h5.92a5.07 5.07 0 0 1-2.74 3.31l3.66 2.84a10.95 10.95 0 0 0 3.66-8.34Z"
      />
      <path
        fill="#4285F4"
        d="M12 5c1.6 0 3.07.59 4.21 1.74l2.53-2.52A11 11 0 0 0 12 1.5C7.6 1.5 3.83 4.07 1.5 7.76l3.77 2.24A7 7 0 0 1 12 5Z"
      />
    </svg>
  );
}

function TwitchMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor">
      <path d="M4 2 2 6v14h5v3h3l3-3h4l5-5V2H4Zm17 12-3 3h-5l-3 3v-3H6V4h15v10ZM10 7h2v6h-2V7Zm5 0h2v6h-2V7Z" />
    </svg>
  );
}

export function SocialButtons({ disabled }: { disabled?: boolean }) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<"google" | "twitch" | null>(null);

  const onClick = async (provider: "google" | "twitch") => {
    setPending(provider);
    const result = await signInWithProvider(provider);
    if (result.ok && result.url) {
      window.location.href = result.url;
      return;
    }
    toast({
      title: `${provider === "google" ? "Google" : "Twitch"} sign-in unavailable`,
      description:
        (result.ok ? undefined : result.error) ??
        "Provider not configured yet. Enable it in the Supabase dashboard under Authentication → Providers.",
      variant: "destructive",
    });
    setPending(null);
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending !== null}
        onClick={() => onClick("google")}
        className="h-11 gap-2"
      >
        <GoogleMark />
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending !== null}
        onClick={() => onClick("twitch")}
        className="h-11 gap-2"
      >
        <TwitchMark />
        Continue with Twitch
      </Button>
    </div>
  );
}
