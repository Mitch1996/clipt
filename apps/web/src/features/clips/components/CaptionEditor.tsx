"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { updateClipCaptions } from "../server/actions";
import type { CaptionsJson } from "../schema";

export interface CaptionEditorProps {
  clipId: string;
  initialCaptions: CaptionsJson;
}

export function CaptionEditor({ clipId, initialCaptions }: CaptionEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<string[]>(() =>
    initialCaptions.segments.map((s) => s.text),
  );
  const [saving, setSaving] = React.useState(false);

  const dirty = draft.some(
    (text, i) => text !== initialCaptions.segments[i]?.text,
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);

    const next: CaptionsJson = {
      ...initialCaptions,
      segments: initialCaptions.segments.map((seg, i) => ({
        ...seg,
        text: draft[i] ?? seg.text,
      })),
    };

    const result = await updateClipCaptions(clipId, next);
    setSaving(false);
    if (!result.ok) {
      toast({
        title: "Couldn't save captions",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Captions saved",
      description: "Re-rendering the vertical with new text…",
    });
    router.refresh();
  };

  if (initialCaptions.segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No captions yet — they&apos;ll show up after the transcribe step
        runs (Prompt 1.9).
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ol className="space-y-3">
        {initialCaptions.segments.map((seg, i) => (
          <li key={String(seg.id)} className="grid grid-cols-[64px,1fr] gap-3">
            <span className="pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {formatSec(seg.start)}
            </span>
            <Textarea
              value={draft[i] ?? ""}
              onChange={(e) =>
                setDraft((prev) => {
                  const next = prev.slice();
                  next[i] = e.target.value;
                  return next;
                })
              }
              className="min-h-[64px] resize-none font-sans text-sm"
            />
          </li>
        ))}
      </ol>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {saving ? "Re-rendering…" : "Save and re-render"}
        </Button>
      </div>
    </form>
  );
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}
