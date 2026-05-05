"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import { signUp } from "../server/actions";
import { signupSchema, type SignupInput } from "../schema";
import { SocialButtons } from "./SocialButtons";

export function SignupForm() {
  const { toast } = useToast();
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (input: SignupInput) => {
    const result = await signUp(input);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [k, v] of Object.entries(result.fieldErrors)) {
          setError(k as keyof SignupInput, { message: v });
        }
      }
      toast({
        title: "Couldn't create your account",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setSubmittedEmail(input.email);
  };

  if (submittedEmail) {
    return (
      <div
        className="rounded-md border border-mint/40 bg-mint/10 p-6 text-sm"
        role="status"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-mint text-mint-foreground">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-[-0.01em]">
          Check your inbox.
        </h2>
        <p className="mt-1 text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{submittedEmail}</span>.
          Click it to finish setting up your account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SocialButtons disabled={isSubmitting} />

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          or with email
        </span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email || undefined}
            aria-describedby={errors.email ? "signup-email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="signup-email-error" className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password || undefined}
            aria-describedby={errors.password ? "signup-password-error" : "signup-password-hint"}
            {...register("password")}
          />
          {errors.password ? (
            <p
              id="signup-password-error"
              className="text-xs text-destructive"
              role="alert"
            >
              {errors.password.message}
            </p>
          ) : (
            <p id="signup-password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
          {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="text-foreground underline underline-offset-4 hover:text-accent"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
