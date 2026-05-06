"use client";

import * as React from "react";
import { Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export interface EmbedCodeButtonProps {
  embedUrl: string;
}

export function EmbedCodeButton({ embedUrl }: EmbedCodeButtonProps) {
  const { toast } = useToast();
  const snippet = `<iframe src="${embedUrl}" width="324" height="576" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast({ title: "Embed code copied" });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked the clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Code2 className="mr-1.5 h-3.5 w-3.5" />
          Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Embed this clip</DialogTitle>
          <DialogDescription>
            Paste this snippet into any HTML page.
          </DialogDescription>
        </DialogHeader>

        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {snippet}
        </pre>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onCopy}>
            Copy code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
