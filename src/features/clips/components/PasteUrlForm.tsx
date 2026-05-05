"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import { createClipFromUrl } from "../server/actions";
import { pasteUrlSchema, type PasteUrlInput } from "../schema";

const PLACEHOLDERS = [
  "https://www.twitch.tv/<channel>/clip/CalmObedientReindeerOSfrog",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://kick.com/<channel>/clips/clip_…",
];

export function PasteUrlForm() {
  const router = useRouter();
  const { toast } = useToast();

  const placeholder = React.useMemo(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    [],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasteUrlInput>({
    resolver: zodResolver(pasteUrlSchema),
    defaultValues: { sourceUrl: "" },
  });

  const onSubmit = async (input: PasteUrlInput) => {
    const result = await createClipFromUrl(input);
    if (!result.ok) {
      if (result.fieldErrors?.sourceUrl) {
        setError("sourceUrl", { message: result.fieldErrors.sourceUrl });
      } else {
        toast({
          title: "Couldn't create clip",
          description: result.error,
          variant: "destructive",
        });
      }
      return;
    }
    router.push(`/dashboard/clips/${result.clipId}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="source-url" className="text-foreground">
          Source URL
        </Label>
        <Input
          id="source-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-invalid={!!errors.sourceUrl || undefined}
          aria-describedby={
            errors.sourceUrl ? "source-url-error" : "source-url-hint"
          }
          className="h-12 font-mono text-sm"
          {...register("sourceUrl")}
        />
        {errors.sourceUrl ? (
          <p
            id="source-url-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.sourceUrl.message}
          </p>
        ) : (
          <p id="source-url-hint" className="text-xs text-muted-foreground">
            Paste a Twitch clip / VOD, a YouTube video / short, or a Kick clip.
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
      >
        {isSubmitting ? (
          <>Sending to the pipeline…</>
        ) : (
          <>
            <Sparkles className="mr-1 h-4 w-4" />
            Clip it
            <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
