import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";

export const metadata = {
  title: "Set new password — Clipt",
};

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.03em]">
        Set a new password.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Use 8+ characters. The link from your email already signed you in to
        complete this step.
      </p>
      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
