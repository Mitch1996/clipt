"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestPasswordReset } from "../server/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schema";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (input: ForgotPasswordInput) => {
    await requestPasswordReset(input);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="rounded-md border border-mint/40 bg-mint/10 p-6 text-sm">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Check your inbox.</h2>
        <p className="mt-1 text-muted-foreground">
          If your email is registered, a reset link is on its way.
        </p>
        <Link
          href="/auth/login"
          className="mt-4 inline-block text-sm text-foreground underline underline-offset-4 hover:text-accent"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email || undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isSubmitting ? "Sending…" : "Send reset link"}
        {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/auth/login"
          className="text-foreground underline underline-offset-4 hover:text-accent"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
