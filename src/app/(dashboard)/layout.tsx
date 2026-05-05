import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { UserMenu } from "@/features/auth/components/UserMenu";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already redirects unauthed users away — this is belt-and-
  // braces in case middleware is bypassed (e.g. matcher gap).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, avatar_url")
    .eq("id", user.id)
    .single();

  const handle = profile?.handle ?? user.email?.split("@")[0] ?? "user";
  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/dashboard" className="inline-flex items-center">
            <Logo className="h-7" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu handle={handle} email={user.email ?? null} avatarUrl={avatarUrl} />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
