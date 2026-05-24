"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { createCampaign } from "../server/actions";
import {
  NICHES,
  PLATFORMS,
  TIERS,
  createCampaignSchema,
  type CreateCampaignInput,
} from "../schema";

/**
 * Brand-side campaign creation form. Lots of fields but most have
 * sensible defaults — required input is just title + budget + cpm +
 * at least one source URL. Everything else can be tuned later from
 * the detail page.
 */
export function CampaignForm() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      title: "",
      brief: "",
      budget_cents: 5_000_00,
      cpm_cents: 200,
      max_per_clip_cents: null,
      niche: "general",
      brand_safety_tier: "silver",
      geo: [],
      languages: [],
      allowed_platforms: ["tiktok", "reels", "shorts"],
      brand_handle: "",
      ends_at: null,
      source_urls: [""],
    },
  });

  const [sourceUrlsInput, setSourceUrlsInput] = React.useState<string[]>([""]);
  const allowedPlatforms = watch("allowed_platforms") as
    | (typeof PLATFORMS)[number][];

  function togglePlatform(p: (typeof PLATFORMS)[number]) {
    const next = allowedPlatforms.includes(p)
      ? allowedPlatforms.filter((x) => x !== p)
      : [...allowedPlatforms, p];
    setValue("allowed_platforms", next, { shouldValidate: true });
  }

  async function onSubmit(input: CreateCampaignInput) {
    const cleanedSources = sourceUrlsInput
      .map((u) => u.trim())
      .filter(Boolean);
    const result = await createCampaign({
      ...input,
      source_urls: cleanedSources,
    });
    if (!result.ok) {
      toast({
        title: "Couldn't create campaign",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Campaign created",
      description:
        "It's in draft. Add a budget top-up + activate it to start accepting clipper submissions.",
    });
    router.push(`/brands/campaigns/${result.campaignId}`);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8"
      noValidate
    >
      {/* ── Title + brief ────────────────────────────────────── */}
      <section className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Campaign title</Label>
          <Input
            id="title"
            placeholder="e.g. Launch week — short product demos"
            {...register("title")}
            aria-invalid={!!errors.title || undefined}
          />
          {errors.title ? (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief">Creative brief (markdown OK)</Label>
          <textarea
            id="brief"
            rows={8}
            placeholder={"Dos: keep first 3s punchy, use captions, hashtag #ourbrand.\nDon'ts: no political content, no music with copyright claims."}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            {...register("brief")}
          />
          {errors.brief ? (
            <p className="text-xs text-destructive">{errors.brief.message}</p>
          ) : null}
        </div>
      </section>

      {/* ── Budget + CPM ─────────────────────────────────────── */}
      <section className="space-y-5 border-t border-border pt-8">
        <h3 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
          Budget & rate
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="budget_cents">Total budget (cents)</Label>
            <Input
              id="budget_cents"
              type="number"
              min={5000}
              {...register("budget_cents", { valueAsNumber: true })}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              €50.00 min · {humanCents(watch("budget_cents") ?? 0)} entered
            </p>
            {errors.budget_cents ? (
              <p className="text-xs text-destructive">
                {errors.budget_cents.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpm_cents">CPM (cents / 1k views)</Label>
            <Input
              id="cpm_cents"
              type="number"
              min={50}
              {...register("cpm_cents", { valueAsNumber: true })}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              €0.50 min · {humanCents(watch("cpm_cents") ?? 0)} entered
            </p>
            {errors.cpm_cents ? (
              <p className="text-xs text-destructive">
                {errors.cpm_cents.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_per_clip_cents">
              Max per clip (cents, optional)
            </Label>
            <Input
              id="max_per_clip_cents"
              type="number"
              min={0}
              placeholder="No cap"
              {...register("max_per_clip_cents", {
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Caps viral upside on single clips
            </p>
          </div>
        </div>
      </section>

      {/* ── Targeting ────────────────────────────────────────── */}
      <section className="space-y-5 border-t border-border pt-8">
        <h3 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
          Who clips this
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="niche">Niche</Label>
            <select
              id="niche"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              {...register("niche")}
            >
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_safety_tier">
              Min brand-safety tier
            </Label>
            <select
              id="brand_safety_tier"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              {...register("brand_safety_tier")}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}+
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Allowed posting platforms</Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const checked = allowedPlatforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    checked
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
          {errors.allowed_platforms ? (
            <p className="text-xs text-destructive">
              {errors.allowed_platforms.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand_handle">
            Your brand handle (for &ldquo;Paid Partnership with @brand&rdquo;)
          </Label>
          <Input
            id="brand_handle"
            placeholder="@brand"
            {...register("brand_handle")}
          />
        </div>
      </section>

      {/* ── Source videos ────────────────────────────────────── */}
      <section className="space-y-5 border-t border-border pt-8">
        <h3 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
          Source videos
        </h3>
        <p className="text-xs text-muted-foreground">
          Clippers will turn these into vertical shorts. Paste 1-20
          source URLs (YouTube, Twitch, Vimeo, your own mp4).
        </p>
        <div className="space-y-2">
          {sourceUrlsInput.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  const next = [...sourceUrlsInput];
                  next[i] = e.target.value;
                  setSourceUrlsInput(next);
                }}
              />
              {sourceUrlsInput.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setSourceUrlsInput(
                      sourceUrlsInput.filter((_, j) => j !== i),
                    )
                  }
                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSourceUrlsInput([...sourceUrlsInput, ""])}
            disabled={sourceUrlsInput.length >= 20}
            className="text-xs font-mono uppercase tracking-[0.14em] text-accent hover:underline"
          >
            + Add another
          </button>
        </div>
      </section>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isSubmitting ? "Creating…" : "Create campaign"}
        {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
      </Button>
    </form>
  );
}

function humanCents(cents: number): string {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return "€0.00";
  return `€${(n / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
