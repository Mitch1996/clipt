"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { addWatchOnlyChannel } from "../server/watch";

export function WatchChannelForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [login, setLogin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || submitting) return;
    setSubmitting(true);
    const result = await addWatchOnlyChannel(login.trim());
    setSubmitting(false);
    if (!result.ok) {
      toast({
        title: "Couldn't add channel",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setLogin("");
    toast({
      title: `Watching @${result.platformLogin}`,
      description:
        "The scheduler picks it up at the next 30s tick. Wait for the channel to go live + auto-clip.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
      <label className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
        <span className="font-mono text-sm text-muted-foreground">
          twitch.tv/
        </span>
        <Input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="quin69"
          className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          disabled={submitting}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <Button type="submit" disabled={submitting || !login.trim()}>
        {submitting ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        {submitting ? "Adding…" : "Watch channel"}
      </Button>
    </form>
  );
}
