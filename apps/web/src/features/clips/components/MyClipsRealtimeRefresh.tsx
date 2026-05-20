"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Invisible client subscriber for the dashboard clips grid. Watches all
 * INSERT/UPDATE/DELETE events on `clips` rows owned by the signed-in
 * user and triggers a `router.refresh()` so the server component
 * re-renders with fresh data (including newly-signed thumbnail URLs).
 *
 * Why router.refresh() instead of surgical client-side patches: signing
 * an S3 URL requires the server-only storage facade. Refreshing the
 * page lets the server do that work without us shipping the AWS SDK to
 * the browser. The downside is full re-renders — fine at 24 cards;
 * revisit when the list paginates past hundreds.
 *
 * Lightweight debounce so a burst of UPDATEs (download → transcribe →
 * reframe in quick succession) doesn't trigger four refreshes.
 *
 * **Realtime auth**: the websocket needs the user's session JWT to pass
 * RLS on broadcast for non-public clips. Same pattern as
 * `ClipStatusLive` — see [[clipt-supabase-realtime-needs-setauth]].
 */
export interface MyClipsRealtimeRefreshProps {
  userId: string;
}

export function MyClipsRealtimeRefresh({ userId }: MyClipsRealtimeRefreshProps) {
  const router = useRouter();

  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const requestRefresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 350);
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`my-clips:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "clips",
            filter: `clipper_profile_id=eq.${userId}`,
          },
          requestRefresh,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
