"use client";

import * as React from "react";

import { recordClipView } from "../server/recordClipView";

/**
 * Invisible client trigger that fires `recordClipView` once on mount
 * per browser session. Keyed off sessionStorage so a same-tab
 * navigation (e.g. embedded → opened in parent) doesn't double-count,
 * while a fresh tab does count as a new view.
 */
export interface RecordViewProps {
  clipId: string;
}

export function RecordView({ clipId }: RecordViewProps) {
  React.useEffect(() => {
    const key = `clipt:viewed:${clipId}`;
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage can throw in incognito / locked-down browsers —
      // count the view anyway rather than silently miss it.
    }
    void recordClipView(clipId);
  }, [clipId]);

  return null;
}
