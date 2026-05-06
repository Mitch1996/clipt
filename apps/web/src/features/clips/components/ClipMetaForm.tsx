"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

import { updateClipMeta } from "../server/actions";
import type { ClipVisibility } from "../schema";

export interface ClipMetaFormProps {
  clipId: string;
  initialTitle: string;
  initialVisibility: ClipVisibility;
}

export function ClipMetaForm({
  clipId,
  initialTitle,
  initialVisibility,
}: ClipMetaFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = React.useState(initialTitle);
  const [visibility, setVisibility] =
    React.useState<ClipVisibility>(initialVisibility);
  const [saving, setSaving] = React.useState(false);

  const dirty =
    title.trim() !== initialTitle.trim() || visibility !== initialVisibility;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    const result = await updateClipMeta(clipId, {
      title: title.trim(),
      visibility,
    });
    setSaving(false);
    if (!result.ok) {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Saved" });
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="clip-title">Title</Label>
        <Input
          id="clip-title"
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled clip"
        />
      </div>

      <div className="space-y-2">
        <Label>Visibility</Label>
        <RadioGroup
          value={visibility}
          onValueChange={(v) => setVisibility(v as ClipVisibility)}
          className="grid gap-2"
        >
          <VisibilityOption
            value="public"
            label="Public"
            help="Listed at /c/{id}, indexable, embeddable."
          />
          <VisibilityOption
            value="unlisted"
            label="Unlisted"
            help="Hidden from /c/{id}. You can still post to other platforms."
          />
        </RadioGroup>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function VisibilityOption({
  value,
  label,
  help,
}: {
  value: string;
  label: string;
  help: string;
}) {
  return (
    <Label
      htmlFor={`vis-${value}`}
      className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/30 has-[:checked]:border-accent"
    >
      <RadioGroupItem id={`vis-${value}`} value={value} className="mt-0.5" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {help}
        </span>
      </span>
    </Label>
  );
}
