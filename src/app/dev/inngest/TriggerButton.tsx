"use client";

import * as React from "react";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { triggerTestClip } from "./actions";

export function TriggerButton() {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [lastClipId, setLastClipId] = React.useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    const result = await triggerTestClip();
    setPending(false);

    if (!result.ok) {
      toast({
        title: "Couldn't trigger test job",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setLastClipId(result.clipId);
    toast({
      title: "Test job sent",
      description: `clip/requested fired for ${result.clipId.slice(0, 8)}…`,
    });
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={onClick}
        disabled={pending}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Zap className="mr-1 h-4 w-4" />
        {pending ? "Triggering…" : "Trigger test job"}
      </Button>
      {lastClipId && (
        <p className="font-mono text-xs text-muted-foreground">
          last clip:{" "}
          <span className="text-foreground">{lastClipId}</span>
        </p>
      )}
    </div>
  );
}
