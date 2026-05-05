import "server-only";

import { putObject, StorageKeys } from "@/lib/storage/r2";

export interface DownloadSourceResult {
  videoR2Key: string;
  durationSeconds?: number;
  originalWidth?: number;
  originalHeight?: number;
}

/**
 * Pipeline step: pull the source video for a clip into our object store.
 *
 * Today this is a STUB — it just writes a 1KB dummy buffer to
 * `sources/{clipId}.mp4` so the storage facade is wired end-to-end.
 *
 * Real downloaders land in Prompt 1.7:
 *   - Twitch clip: GraphQL → mp4 source URL → stream to R2
 *   - Twitch VOD: yt-dlp via the Fly.io worker (Prompt 1.8)
 *   - YouTube *:   yt-dlp via the Fly.io worker
 *   - Kick clip:   /api/v2/clips/<slug> → mp4 url → stream to R2
 */
export async function downloadSource(
  clipId: string,
  _sourceUrl: string,
): Promise<DownloadSourceResult> {
  const key = StorageKeys.source(clipId);
  const dummy = Buffer.alloc(1024, 0x00);
  await putObject(key, dummy, "video/mp4");
  return { videoR2Key: key };
}
