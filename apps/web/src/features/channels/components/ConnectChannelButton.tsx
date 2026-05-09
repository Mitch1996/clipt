"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChannelPlatform =
  | "twitch"
  | "youtube"
  | "kick"
  | "tiktok"
  | "instagram";

const PLATFORM_PATHS: Record<ChannelPlatform, string | null> = {
  twitch: "/api/oauth/twitch/start",
  youtube: "/api/oauth/youtube/start",
  tiktok: "/api/oauth/tiktok/start",
  instagram: "/api/oauth/instagram/start",
  kick: null, // Phase 2
};

export interface ConnectChannelButtonProps {
  platform: ChannelPlatform;
  children: React.ReactNode;
  className?: string;
  alreadyConnected?: boolean;
  /** Disable the button entirely (e.g. provider not configured server-side). */
  disabled?: boolean;
}

export function ConnectChannelButton({
  platform,
  children,
  className,
  alreadyConnected,
  disabled: disabledProp,
}: ConnectChannelButtonProps) {
  const [pending, setPending] = React.useState(false);
  const path = PLATFORM_PATHS[platform];
  const disabled = disabledProp || path === null || pending;

  const onClick = () => {
    if (!path) return;
    setPending(true);
    window.location.href = path;
  };

  return (
    <Button
      type="button"
      variant={alreadyConnected ? "outline" : "default"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        !alreadyConnected && !disabled && "bg-accent text-accent-foreground hover:bg-accent/90",
        "gap-2",
        className,
      )}
    >
      {children}
      {path && !disabled && <ArrowUpRight className="h-4 w-4" />}
    </Button>
  );
}
