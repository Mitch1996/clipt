"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scissors } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { createLiveClip } from "../server/createLiveClip";

export interface LiveClipButtonProps {
  platform: "twitch" | "youtube" | "kick";
  channelLogin: string;
  /** Display name shown on the button label. Defaults to channelLogin. */
  label?: string;
  /** True only when the worker is buffering. Disables the button otherwise. */
  isLive: boolean;
  /** True when the viewer is signed in; false drives a sign-up nudge. */
  isAuthed: boolean;
  signInHref?: string;
}

/**
 * Tap-to-clip CTA. Big enough that thumb-tapping mid-stream actually
 * lands (≥ 56px tap target). Lives in a fixed bottom-of-viewport
 * container so it survives scrolling the chat / video below.
 */
export function LiveClipButton({
  platform,
  channelLogin,
  label,
  isLive,
  isAuthed,
  signInHref,
}: LiveClipButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function onClick() {
    if (!isAuthed) {
      router.push(signInHref ?? `/auth/login?next=/live/${platform}/${channelLogin}`);
      return;
    }
    if (!isLive || loading) return;
    setLoading(true);
    const result = await createLiveClip({ platform, channelLogin, lookbackSec: 30 });
    if (!result.ok) {
      setLoading(false);
      toast({
        title: "Couldn't clip",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    // Hand off to the editor — the clip is still processing but the
    // page subscribes to Realtime status updates.
    router.push(`/dashboard/clips/${result.clipId}`);
  }

  const disabled = (!isLive && isAuthed) || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex w-full min-h-[64px] items-center justify-center gap-3 rounded-full px-6 text-base font-semibold shadow-lg transition-transform active:scale-95",
        "bg-accent text-accent-foreground hover:bg-accent/90",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Scissors className="h-5 w-5" strokeWidth={2.25} />
      )}
      {loading
        ? "Clipping the last 30s…"
        : !isAuthed
          ? "Sign in to clip"
          : !isLive
            ? `@${label ?? channelLogin} isn't live`
            : `Clip last 30s of @${label ?? channelLogin}`}
    </button>
  );
}
