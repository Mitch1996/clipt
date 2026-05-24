import Link from "next/link";
import { redirect } from "next/navigation";

import { CampaignForm } from "@/features/brands/components/CampaignForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New campaign — Clipt" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/brands/campaigns/new");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "brand" && profile?.role !== "admin") {
    redirect("/brands");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/brands/dashboard"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        ← Campaigns
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
        New campaign
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Set up your campaign as a draft. You can activate it later once
        the budget is funded — at that point it appears in the clipper
        marketplace.
      </p>
      <div className="mt-10">
        <CampaignForm />
      </div>
    </div>
  );
}
