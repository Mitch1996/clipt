"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

  const dirtyByIdx = React.useMemo(
    () =>
      draft.map((text, i) => text !== initialCaptions.segments[i]?.text),
    [draft, initialCaptions.segments],
  );
  const dirty = dirtyByIdx.some(Boolean);
  const dirtyCount = dirtyByIdx.filter(Boolean).length;

  const onSubmit = React.useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
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
        description: "Re-rendering the vertical with the new text — ~30s.",
      });
      router.refresh();
    },
    [clipId, dirty, draft, initialCaptions, router, saving, toast],
  );

  // Cmd/Ctrl+Enter from any textarea submits.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        void onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSubmit]);

  const revertSegment = (i: number) => {
    setDraft((prev) => {
      const next = prev.slice();
      next[i] = initialCaptions.segments[i]?.text ?? "";
      return next;
    });
  };

  if (initialCaptions.segments.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center">
        <Sparkles
          className="mx-auto h-5 w-5 text-muted-foreground"
          strokeWidth={1.5}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          No captions in this clip — probably silent audio. Re-run the
          source from a busier moment to get burned-in text.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ol className="space-y-2">
        {initialCaptions.segments.map((seg, i) => {
          const isDirty = dirtyByIdx[i];
          return (
            <li
              key={String(seg.id)}
              className={cn(
                "group grid grid-cols-[56px,1fr,auto] items-start gap-2 rounded-md border border-transparent px-2 py-1 transition-colors",
                isDirty && "border-accent/30 bg-accent/[0.04]",
              )}
            >
              <span className="pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground tnum">
                {formatSec(seg.start)}
              </span>
              <AutoGrowTextarea
                value={draft[i] ?? ""}
                onChange={(v) =>
                  setDraft((prev) => {
                    const next = prev.slice();
                    next[i] = v;
                    return next;
                  })
                }
              />
              <button
                type="button"
                onClick={() => revertSegment(i)}
                aria-label="Revert this segment"
                title="Revert this segment"
                tabIndex={isDirty ? 0 : -1}
                className={cn(
                  "mt-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                  isDirty ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {dirty ? (
            <>
              {dirtyCount} edit{dirtyCount === 1 ? "" : "s"} unsaved · ⌘/Ctrl+Enter to save
            </>
          ) : (
            "All saved"
          )}
        </span>
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {saving ? "Re-rendering…" : "Save and re-render"}
        </Button>
      </div>
    </form>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-sans text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}
