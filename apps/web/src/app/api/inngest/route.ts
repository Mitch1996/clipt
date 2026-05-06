import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Inngest's HTTP entry point. The CLI dev server posts here when running
 * a job locally; production calls land here from inngest.com via webhook.
 *
 * `signingKey` is read from process.env.INNGEST_SIGNING_KEY automatically
 * by `serve` — only set explicitly if you need a non-default name.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
