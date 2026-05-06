import { SignupForm } from "@/features/auth/components/SignupForm";

export const metadata = {
  title: "Create account — Clipt",
};

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.03em]">
        Get on Clipt.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create an account in 30 seconds.
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </div>
  );
}
