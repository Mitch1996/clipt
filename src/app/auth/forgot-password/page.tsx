import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const metadata = {
  title: "Reset password — Clipt",
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.03em]">
        Forgot your password?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email and we&rsquo;ll send a reset link.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
