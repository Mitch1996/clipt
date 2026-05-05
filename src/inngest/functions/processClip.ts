import { createAdminClient } from "@/lib/supabase/admin";

import { ClipRequested, inngest } from "../client";

/**
 * processClip — the canonical clip-production pipeline.
 *
 * Triggered by `clip/requested` with `{ clipId }`. Today this function
 * only flips the row through `pending → processing → ready` so we can
 * verify the wiring end-to-end. Real implementations of each step land
 * across Phase 1:
 *
 *   1. Load clip from DB                              (this prompt)
 *   2. Update status to 'processing'                  (this prompt)
 *   3. Download source video                          → Prompt 1.7
 *   4. Generate captions                              → Prompt 1.9
 *   5. Reframe to vertical                            → Prompt 1.10
 *   6. Sign attribution                               → Prompt 1.11
 *   7. Update status to 'ready' or 'failed'           (this prompt)
 *
 * Each TODO step is wrapped in `step.run()` so failures retry in
 * isolation when we replace the stub with real work.
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
        .select("id, status, source_url, source_platform")
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

    // 3. TODO Prompt 1.7 — download source video
    await step.run("todo-download-source", async () => ({ ok: true }));

    // 4. TODO Prompt 1.9 — transcribe via worker
    await step.run("todo-transcribe", async () => ({ ok: true }));

    // 5. TODO Prompt 1.10 — reframe to vertical
    await step.run("todo-reframe", async () => ({ ok: true }));

    // 6. TODO Prompt 1.11 — sign attribution JWT
    await step.run("todo-sign-attribution", async () => ({ ok: true }));

    // Sleep 5s to make the wiring visible in the dev UI's timeline.
    await step.sleep("simulated-work", "5s");

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
