import { processClip } from "./processClip";

/**
 * The function registry. The /api/inngest route hands this array to
 * Inngest's `serve()` helper. Add new functions here when you create
 * them under src/inngest/functions/<name>.ts.
 */
export const functions = [processClip];
