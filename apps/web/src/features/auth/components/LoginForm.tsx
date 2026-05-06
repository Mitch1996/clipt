"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import { signIn } from "../server/actions";
import { loginSchema, type LoginInput } from "../schema";
import { SocialButtons } from "./SocialButtons";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (input: LoginInput) => {
    const result = await signIn(input);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [k, v] of Object.entries(result.fieldErrors)) {
          setError(k as keyof LoginInput, { message: v });
        }
      }
      toast({
        title: "Couldn't sign you in",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    const next = search.get("next") ?? "/dashboard";
    router.push(next);
    router.refresh();
  };

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
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email || undefined}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="login-email-error" className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password || undefined}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p
              id="login-password-error"
              className="text-xs text-destructive"
              role="alert"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/auth/signup"
          className="text-foreground underline underline-offset-4 hover:text-accent"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
