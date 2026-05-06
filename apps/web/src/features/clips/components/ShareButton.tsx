"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface ShareButtonProps {
  url: string;
  title: string;
}

export function ShareButton({ url, title }: ShareButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const onShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // AbortError fires when the user dismisses the share sheet — not
        // an error worth surfacing. Anything else falls through to copy.
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked the clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onShare}>
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Share2 className="mr-1.5 h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
