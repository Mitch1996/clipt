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

import { submitBrandAccessRequest } from "../server/actions";
import {
  brandAccessRequestSchema,
  type BrandAccessRequestInput,
} from "../schema";

/**
 * Brand-access request form. Brands aren't self-serve in V1 — they
 * fill this out and a Clipt admin reviews + promotes their profile
 * role. Keeps gatekeeping tight while we learn what signals matter
 * for verifying real brand intent vs spam.
 */
export function BrandAccessRequestForm() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BrandAccessRequestInput>({
    resolver: zodResolver(brandAccessRequestSchema),
    defaultValues: {
      company_name: "",
      company_url: "",
      intended_use: "",
    },
  });

  const onSubmit = async (input: BrandAccessRequestInput) => {
    const result = await submitBrandAccessRequest(input);
    if (!result.ok) {
      toast({
        title: "Request not submitted",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Request submitted",
      description:
        "We'll email you when an admin reviews it (usually within 1 business day).",
    });
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="company_name">Company / brand name</Label>
        <Input
          id="company_name"
          placeholder="Acme, Inc."
          aria-invalid={!!errors.company_name || undefined}
          {...register("company_name")}
        />
        {errors.company_name ? (
          <p className="text-xs text-destructive">{errors.company_name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="company_url">Website (optional)</Label>
        <Input
          id="company_url"
          type="url"
          placeholder="https://example.com"
          aria-invalid={!!errors.company_url || undefined}
          {...register("company_url")}
        />
        {errors.company_url ? (
          <p className="text-xs text-destructive">{errors.company_url.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intended_use">What do you want to run on Clipt?</Label>
        <textarea
          id="intended_use"
          rows={5}
          placeholder="e.g. We're a SaaS company launching a new feature and want clippers to make 30-second product demos for TikTok. Budget around $5k/mo."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-invalid={!!errors.intended_use || undefined}
          {...register("intended_use")}
        />
        {errors.intended_use ? (
          <p className="text-xs text-destructive">{errors.intended_use.message}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isSubmitting ? "Submitting…" : "Request brand access"}
        {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
      </Button>
    </form>
  );
}
