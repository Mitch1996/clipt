import "server-only";

import { getValidYouTubeAccessToken } from "@/features/channels/server/getValidYouTubeAccessToken";
import { StorageKeys, getObject } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

import type { PublishInput, PublishOutcome } from "../schema";

const YT_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

/**
 * Post a clip's vertical mp4 as a YouTube Short.
 *
 * Uses YouTube's resumable upload protocol. A video is automatically
 * a Short if it's 9:16 and ≤ 60s, which our reframe pipeline (Prompt
 * 1.10) is designed to produce.
 *
 * Today the vertical_video_r2_key may still point at a 1KB stub from
 * Prompt 1.6 since 1.10 isn't shipped — the upload will succeed but
 * YouTube will reject the video as invalid. Once 1.10 lands, this
 * code path needs zero changes.
 */
export async function postToYouTubeShorts(
  input: PublishInput,
): Promise<PublishOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in", platformConfigured: true };

  // 1. Find the user's connected YouTube channel.
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("owner_id", user.id)
    .eq("platform", "youtube")
    .not("access_token_encrypted", "is", null)
    .maybeSingle();

  if (!channel) {
    return {
      ok: false,
      error: "Connect a YouTube channel first.",
      platformConfigured: true,
    };
  }

  // 2. Load the clip — must be ready and have a vertical mp4.
  const { data: clip, error: clipErr } = await supabase
    .from("clips")
    .select("id, status, vertical_video_r2_key, title")
    .eq("id", input.clipId)
    .single();

  if (clipErr || !clip) {
    return { ok: false, error: "Clip not found.", platformConfigured: true };
  }
  if (clip.status !== "ready" || !clip.vertical_video_r2_key) {
    return {
      ok: false,
      error: "Clip isn't ready yet.",
      platformConfigured: true,
    };
  }

  // 3. Get a fresh access token + load the mp4 bytes from storage.
  const { accessToken } = await getValidYouTubeAccessToken(channel.id);
  const mp4 = await getObject(clip.vertical_video_r2_key);

  // 4. Build the metadata. #Shorts in the description is the legacy
  //    signal; YouTube auto-classifies based on aspect+duration
  //    these days, but the hashtag + title nudge helps discovery.
  const description = [
    input.caption,
    "",
    input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "),
    "#Shorts",
  ]
    .filter(Boolean)
    .join("\n");

  const metadata = {
    snippet: {
      title: clip.title?.slice(0, 100) ?? "Clip",
      description,
      categoryId: "22", // People & Blogs
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
  };

  // 5. Initiate the resumable upload — POST returns a Location URL.
  const initRes = await fetch(YT_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(mp4.length),
    },
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    const body = await initRes.text();
    return {
      ok: false,
      error: `YouTube upload init failed: ${initRes.status} ${body.slice(0, 200)}`,
      platformConfigured: true,
    };
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    return {
      ok: false,
      error: "YouTube didn't return a resumable upload URL.",
      platformConfigured: true,
    };
  }

  // 6. PUT the mp4 bytes. Wrap in a Blob so fetch's BodyInit is happy
  //    (Buffer doesn't satisfy the type even though Node's native fetch
  //    accepts it at runtime).
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: new Blob([new Uint8Array(mp4)], { type: "video/mp4" }),
  });

  if (!putRes.ok) {
    const body = await putRes.text();
    return {
      ok: false,
      error: `YouTube upload PUT failed: ${putRes.status} ${body.slice(0, 200)}`,
      platformConfigured: true,
    };
  }

  const video = (await putRes.json()) as { id: string };

  // 7. Persist the post row.
  const { data: postRow, error: postErr } = await supabase
    .from("clip_posts")
    .insert({
      clip_id: clip.id,
      platform: "youtube_shorts",
      platform_post_id: video.id,
      posted_by_profile_id: user.id,
      posted_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (postErr || !postRow) {
    console.error("clip_posts insert failed (yt shorts):", postErr);
    return {
      ok: false,
      error: postErr?.message ?? "Couldn't save the post record.",
      platformConfigured: true,
    };
  }

  return {
    ok: true,
    url: `https://youtube.com/shorts/${video.id}`,
    platformPostId: video.id,
    postId: postRow.id,
  };
}

export const youtubeShortsConfigured = () => true;

/** Stats sync: re-fetch view + like counts for a YouTube Shorts post. */
export async function syncYouTubeShortStats(
  channelId: string,
  platformPostId: string,
): Promise<{ viewCount: number; likeCount: number } | null> {
  const { accessToken } = await getValidYouTubeAccessToken(channelId);
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", platformPostId);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    items?: Array<{ statistics?: { viewCount?: string; likeCount?: string } }>;
  };
  const stats = json.items?.[0]?.statistics;
  if (!stats) return null;
  return {
    viewCount: Number(stats.viewCount ?? 0),
    likeCount: Number(stats.likeCount ?? 0),
  };
}

// Reference an unused import so the compiler keeps StorageKeys in scope
// for the eventual swap from getObject to a signed URL hand-off.
void StorageKeys;
