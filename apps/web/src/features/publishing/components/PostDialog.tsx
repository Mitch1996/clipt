"use client";

import * as React from "react";
import { ArrowRight, Calendar, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import type { PublishPlatform } from "../schema";
import { submitPublish } from "../server/actions";

const PLATFORM_LABEL: Record<PublishPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
};

const PLATFORM_CAPTION_MAX: Record<PublishPlatform, number> = {
  tiktok: 2200,
  instagram: 2200,
  youtube_shorts: 5000,
};

export interface PostDialogProps {
  clipId: string;
  platform: PublishPlatform;
  /** Render a custom trigger button. If absent, a default "Post to X" button shows. */
  children?: React.ReactNode;
  /** Disable the trigger entirely (e.g. clip not ready, channel not connected). */
  disabled?: boolean;
  /** Pre-fill the caption from the clip's title. */
  initialCaption?: string;
}

export function PostDialog({
  clipId,
  platform,
  children,
  disabled,
  initialCaption = "",
}: PostDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [caption, setCaption] = React.useState(initialCaption);
  const [hashtagsRaw, setHashtagsRaw] = React.useState("");
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const captionMax = PLATFORM_CAPTION_MAX[platform];

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setPending(true);

    const hashtags = hashtagsRaw
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean);

    const result = await submitPublish({
      clipId,
      platform,
      caption,
      hashtags,
      scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : undefined,
    });

    setPending(false);

    if (!result.ok) {
      if (result.fieldErrors?.scheduledFor) {
        setFieldError(result.fieldErrors.scheduledFor);
      }
      toast({
        title: `Couldn't post to ${PLATFORM_LABEL[platform]}`,
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setOpen(false);
    toast({
      title: result.scheduled ? "Scheduled" : `Posted to ${PLATFORM_LABEL[platform]}`,
      description: result.scheduled
        ? `Will publish at ${new Date(scheduledFor).toLocaleString()}.`
        : result.url
          ? `Live at ${result.url}`
          : `Posted.`,
    });
  };

  const trigger = children ?? (
    <Button variant="outline" disabled={disabled}>
      <Send className="mr-1 h-3.5 w-3.5" />
      Post to {PLATFORM_LABEL[platform]}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post to {PLATFORM_LABEL[platform]}</DialogTitle>
          <DialogDescription>
            Caption + hashtags + (optional) schedule. We&rsquo;ll upload the
            vertical mp4 and write the result to your clip&rsquo;s post log.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="post-caption">Caption</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {caption.length} / {captionMax}
              </span>
            </div>
            <Textarea
              id="post-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, captionMax))}
              placeholder="Say something nice about the clip…"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-hashtags">Hashtags</Label>
            <Input
              id="post-hashtags"
              value={hashtagsRaw}
              onChange={(e) => setHashtagsRaw(e.target.value)}
              placeholder="gaming clutch shroud"
            />
            <p className="text-[11px] text-muted-foreground">
              Space- or comma-separated. We&rsquo;ll add the # automatically.
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Schedule for later
            </label>
            {scheduleEnabled && (
              <div className="space-y-1 pl-6">
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => {
                    setScheduledFor(
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    );
                    setFieldError(null);
                  }}
                  className={cn(fieldError && "border-destructive")}
                />
                {fieldError && (
                  <p className="text-xs text-destructive">{fieldError}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {pending ? (
                "Posting…"
              ) : scheduleEnabled ? (
                <>
                  Schedule
                  <Calendar className="ml-1 h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Post now
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
