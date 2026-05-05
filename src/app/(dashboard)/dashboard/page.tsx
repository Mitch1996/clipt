import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — Clipt",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, role")
    .eq("id", user!.id)
    .single();

  const handle = profile?.handle ?? "user";

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Dashboard · placeholder
      </span>
      <h1 className="mt-4 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        Hello, <span className="text-accent">@{handle}</span>.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Your role is{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider text-foreground">
          {profile?.role ?? "creator"}
        </span>
        . The real dashboard lands in upcoming prompts — this page just confirms
        auth + RLS + the profile row are wired correctly.
      </p>
    </div>
  );
}
