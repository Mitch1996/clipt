"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { joinWaitlist } from "../server/joinWaitlist";
import { SEGMENTS, waitlistSchema, type WaitlistInput } from "../schema";

const SEGMENT_LABELS: Record<(typeof SEGMENTS)[number], string> = {
  streamer: "Streamer",
  fan: "Fan",
  clipper: "Clipper",
  brand: "Brand",
  other: "Other",
};

export function WaitlistForm({ idPrefix = "waitlist" }: { idPrefix?: string }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<WaitlistInput>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: { email: "", segment: undefined },
  });

  const segment = watch("segment");

  const onSubmit = async (input: WaitlistInput) => {
    const result = await joinWaitlist(input);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof WaitlistInput, { message });
        }
      }
      toast({
        title: "Couldn't save your spot",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    setSubmitted(true);
    toast({
      title: "You're on the list",
      description: "We'll reach out as soon as your wave goes live.",
    });
  };

  if (submitted) {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-mint/40 bg-mint/10 px-4 py-4 text-sm text-foreground"
        role="status"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-mint text-mint-foreground">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <div>
          <div className="font-medium">You&rsquo;re on the list.</div>
          <div className="text-muted-foreground">
            Watch your inbox — we&rsquo;ll be in touch soon.
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`} className="text-foreground">
          Email
        </Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p
            id={`${idPrefix}-email-error`}
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          I&rsquo;m a…
        </legend>
        <RadioGroup
          value={segment}
          onValueChange={(value) =>
            setValue("segment", value as WaitlistInput["segment"], {
              shouldValidate: true,
            })
          }
          className="flex flex-wrap gap-2"
        >
          {SEGMENTS.map((s) => {
            const id = `${idPrefix}-segment-${s}`;
            const checked = segment === s;
            return (
              <Label
                key={s}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  checked
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <RadioGroupItem id={id} value={s} className="sr-only" />
                <span>{SEGMENT_LABELS[s]}</span>
              </Label>
            );
          })}
        </RadioGroup>
        {errors.segment ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.segment.message}
          </p>
        ) : null}
      </fieldset>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-accent text-accent-foreground shadow-glow hover:bg-accent/90 sm:w-auto"
      >
        {isSubmitting ? "Saving your spot…" : "Join the waitlist"}
        {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
      </Button>
    </form>
  );
}
