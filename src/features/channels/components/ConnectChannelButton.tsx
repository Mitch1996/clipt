"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLATFORM_PATHS: Record<"twitch" | "youtube" | "kick", string | null> = {
  twitch: "/api/oauth/twitch/start",
  youtube: null, // Prompt 1.3
  kick: null, // Phase 2
};

export interface ConnectChannelButtonProps {
  platform: "twitch" | "youtube" | "kick";
  children: React.ReactNode;
  className?: string;
  alreadyConnected?: boolean;
}

export function ConnectChannelButton({
  platform,
  children,
  className,
  alreadyConnected,
}: ConnectChannelButtonProps) {
  const [pending, setPending] = React.useState(false);
  const path = PLATFORM_PATHS[platform];
  const disabled = path === null || pending;

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
        !alreadyConnected && "bg-accent text-accent-foreground hover:bg-accent/90",
        "gap-2",
        className,
      )}
    >
      {children}
      {path && <ArrowUpRight className="h-4 w-4" />}
    </Button>
  );
}
