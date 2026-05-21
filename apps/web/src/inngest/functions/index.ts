import { detectChannelCorner } from "./detectChannelCorner";
import { liveHypeMoment } from "./liveHypeMoment";
import { processCaptionEdit } from "./processCaptionEdit";
import { processClip } from "./processClip";
import { publishScheduledPost } from "./publishScheduledPost";
import { selfHealCorner } from "./selfHealCorner";
import { syncPostStats } from "./syncPostStats";

/**
 * The function registry. The /api/inngest route hands this array to
 * Inngest's `serve()` helper. Add new functions here when you create
 * them under src/inngest/functions/<name>.ts.
 */
export const functions = [
  processClip,
  processCaptionEdit,
  publishScheduledPost,
  syncPostStats,
  liveHypeMoment,
  detectChannelCorner,
  selfHealCorner,
];
