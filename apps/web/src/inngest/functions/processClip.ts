import { NonRetriableError } from "inngest";

import {
  SourceDownloadError,
  UnsupportedSourceError,
  downloadSource,
} from "@/features/clips/server/downloadSource";
import { createAdminClient } from "@/lib/supabase/admin";
import { callReframe, callTranscribe } from "@/lib/workers/videoWorker";

import { ClipRequested, inngest } from "../client";

/**
 * processClip — the canonical clip-production pipeline.
 *
 * Triggered by `clip/requested` with `{ clipId }`. Pipeline stages:
 *
 *   1. Load clip from DB                              (this prompt)
 *   2. Update status to 'processing'                  (this prompt)
 *   3. Download source video                          → Prompt 1.7 ✓
 *   4. Generate captions                              → Prompt 1.9
 *   5. Reframe to vertical                            → Prompt 1.10
 *   6. Sign attribution                               → Prompt 1.11
 *   7. Update status to 'ready' or 'failed'           (this prompt)
 *
 * Each step is wrapped in `step.run()` so failures retry in isolation
 * when we replace the stub with real work.
 *
 * Errors:
 *   - `UnsupportedSourceError` (Twitch VOD, YouTube) — phase scoping;
 *     mark `failed` with the user-facing message and DON'T retry.
 *   - `SourceDownloadError` — supported source but the fetch failed
 *     (deleted clip, CDN hiccup). Mark `failed` and DON'T retry the
 *     whole function (Inngest still retries the step `retries` times
 *     before bubbling).
 *   - Any other error — let Inngest retry per the function's `retries`
 *     setting; we'll see it in the dev UI's timeline.
 */
export const processClip = inngest.createFunction(
  {
    id: "process-clip",
    retries: 2,
    triggers: [ClipRequested],
  },
  async ({ event, step }) => {
    const { clipId } = event.data;
    const supabase = createAdminClient();

    // 1. Load clip
    const clip = await step.run("load-clip", async () => {
      const { data, error } = await supabase
        .from("clips")
        .select("id, status, source_url, source_platform, source_kind")
        .eq("id", clipId)
        .single();
      if (error || !data) throw new Error(`clip ${clipId} not found`);
      return data;
    });

    // 2. Mark processing
    await step.run("mark-processing", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ status: "processing", processing_error: null })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 3. Download the source. UnsupportedSourceError + SourceDownloadError
    //    are *terminal* — fail the row immediately and stop the run.
    let downloaded;
    try {
      downloaded = await step.run("download-source", () =>
        downloadSource(clipId, clip.source_url ?? ""),
      );
    } catch (err) {
      const cause =
        err instanceof Error && (err as Error & { cause?: unknown }).cause
          ? (err as Error & { cause?: unknown }).cause
          : err;
      const isTerminal =
        cause instanceof UnsupportedSourceError ||
        cause instanceof SourceDownloadError ||
        // Inngest may wrap our error in its own type; match by name too
        (err instanceof Error &&
          (err.name === "UnsupportedSourceError" ||
            err.name === "SourceDownloadError"));

      if (isTerminal) {
        const message = err instanceof Error ? err.message : String(err);
        await step.run("mark-failed", async () => {
          await supabase
            .from("clips")
            .update({ status: "failed", processing_error: message })
            .eq("id", clipId);
        });
        // NonRetriableError tells Inngest to stop the function without
        // retrying — we've already persisted the failure.
        throw new NonRetriableError(message);
      }

      // Generic failure — let Inngest's retry policy handle it. If it
      // exhausts retries the run will end in error and the row will be
      // stuck in 'processing'; a separate sweeper could rectify, but
      // that's out of scope today.
      throw err;
    }

    await step.run("persist-source-meta", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          video_r2_key: downloaded.videoR2Key,
          duration_seconds: downloaded.durationSeconds,
          source_width: downloaded.originalWidth,
          source_height: downloaded.originalHeight,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 4. Transcribe via worker (stub today — real Whisper in Prompt 1.9).
    const transcribed = await step.run("transcribe", () =>
      callTranscribe({
        clipId,
        sourceR2Key: downloaded.videoR2Key,
      }),
    );

    await step.run("persist-captions", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          captions_json: transcribed.captionsJson as never,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 5. Reframe to vertical (stub today — real MediaPipe + ffmpeg in
    //    Prompt 1.10). Attribution token will get embedded into mp4
    //    metadata once Prompt 1.11 mints it; stub ignores it for now.
    const reframed = await step.run("reframe", () =>
      callReframe({
        clipId,
        sourceR2Key: downloaded.videoR2Key,
        captionsR2Key: transcribed.captionsR2Key,
        style: "default",
        creatorHandle: downloaded.sourceCreator?.platformLogin,
      }),
    );

    await step.run("persist-reframe-meta", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          vertical_video_r2_key: reframed.verticalR2Key,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 6. TODO Prompt 1.11 — sign attribution JWT
    await step.run("todo-sign-attribution", async () => ({ ok: true }));

    // 7. Mark ready
    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ status: "ready", processing_error: null })
        .eq("id", clipId);
      if (error) throw error;
    });

    return { clipId, status: "ready", source_url: clip.source_url };
  },
);
