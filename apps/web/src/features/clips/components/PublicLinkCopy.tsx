"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface PublicLinkCopyProps {
  url: string;
  /**
   * `true` when the clip's visibility = 'unlisted'. The link still copies
   * (the user might paste it into a DM) but we annotate the row to make
   * the unlisted state obvious.
   */
  unlisted?: boolean;
}

export function PublicLinkCopy({ url, unlisted }: PublicLinkCopyProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied" });
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
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
        {url}
      </span>
      {unlisted && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          unlisted
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCopy}
        className="h-7 px-2"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
