import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/Logo";
import { UserMenu } from "@/features/auth/components/UserMenu";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * /brands/* layout. Gates on profiles.role IN ('brand', 'admin');
 * everyone else gets bounced to the brand-access landing page where
 * they can request access.
 *
 * Brand-only navigation: dashboard / new campaign / billing (4.1b) /
 * compliance (4.1c). Billing + compliance get tab placeholders here
 * but their pages aren't built yet — the dashboard surface is what
 * we ship in 4.1a.
 */
export default async function BrandsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/brands");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, handle, avatar_url")
    .eq("id", user.id)
    .single();

  const isBrand = profile?.role === "brand" || profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href={isBrand ? "/brands/dashboard" : "/brands"} className="inline-flex items-center gap-2">
            <Logo className="h-7" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              / brands
            </span>
          </Link>
          {isBrand ? (
            <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
              <Link href="/brands/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/brands/campaigns/new" className="hover:text-foreground">
                New campaign
              </Link>
              <span className="text-muted-foreground/40">Billing (soon)</span>
              <span className="text-muted-foreground/40">Compliance (soon)</span>
            </nav>
          ) : null}
          <UserMenu
            handle={profile?.handle ?? user.email?.split("@")[0] ?? "user"}
            email={user.email ?? null}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
