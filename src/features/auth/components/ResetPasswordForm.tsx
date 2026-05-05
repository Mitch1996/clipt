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

import { updatePassword } from "../server/actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schema";

export function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (input: ResetPasswordInput) => {
    const result = await updatePassword(input);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [k, v] of Object.entries(result.fieldErrors)) {
          setError(k as keyof ResetPasswordInput, { message: v });
        }
      }
      toast({
        title: "Couldn't update password",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Password updated", description: "You're signed in." });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password || undefined}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm || undefined}
          {...register("confirm")}
        />
        {errors.confirm && (
          <p className="text-xs text-destructive" role="alert">
            {errors.confirm.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isSubmitting ? "Updating…" : "Update password"}
        {!isSubmitting && <ArrowRight className="ml-1 h-4 w-4" />}
      </Button>
    </form>
  );
}
