import { Suspense } from "react";

import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata = {
  title: "Sign in — Clipt",
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.03em]">
        Welcome back.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to your Clipt account.
      </p>
      <div className="mt-8">
        {/* LoginForm calls useSearchParams() to pick up `?next=`, which
            requires a Suspense boundary for static prerender. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
