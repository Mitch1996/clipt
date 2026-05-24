"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Check, Crosshair, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  resetClipFaceCamBbox,
  setClipFaceCamBbox,
  type CamBbox,
} from "../server/setBbox";

/**
 * Per-clip cam-region editor — replaces the 4-quadrant picker with a
 * draggable rectangle on the source video.
 *
 * The hard problem the picker had: corner-only input still leaves the
 * renderer cropping a fixed 22% × 27% preset, which is wrong for every
 * streamer who doesn't have a "typical" cam size. This editor writes a
 * normalized {x, y, w, h} directly, so the renderer can crop exactly
 * the rectangle the streamer drew.
 *
 * Three actions surface here:
 *   - Drag/resize the rectangle (react-rnd, normalized 0..1 coords
 *     translated to/from CSS pixels every render).
 *   - "Snap to detected face" — runs MediaPipe Face Detector in the
 *     browser on the currently-paused frame, snaps the box to the
 *     largest face expanded to head+shoulders to mimic the worker's
 *     _cam_crop_box geometry (1.8× face height, target aspect width,
 *     20% downward bias on centre Y).
 *   - "Reset to auto" — clears both clips.face_cam_bbox + corner so
 *     the next render falls back to channel defaults / re-detection.
 *
 * Live preview tile on the right: every box change paints the cropped
 * region from the current video frame into a canvas. Converts the
 * loop from "drag → save → wait 30s → hope" to "drag → see → save".
 */

// react-rnd ships with browser-only refs that crash SSR. Dynamic
// import with ssr:false matches what next/dynamic was built for.
const Rnd = dynamic(() => import("react-rnd").then((m) => m.Rnd), {
  ssr: false,
});

interface Props {
  clipId: string;
  sourceVideoUrl: string;
  /** Bbox currently baked into the rendered clip (clips.face_cam_bbox). */
  currentBbox: CamBbox | null;
  /** Channel default (channels.face_cam_bbox) — used as fallback when
   *  the clip has no override. */
  channelBbox: CamBbox | null;
  /** Auto-detected corner; used to derive the initial preset rectangle
   *  when neither bbox is set. */
  currentCorner:
    | "top_left"
    | "top_right"
    | "bottom_left"
    | "bottom_right"
    | null;
  /** Provenance of the current bbox. 'manual' renders the verified
   *  pill so the streamer knows the box already came from them. */
  currentSource: string | null;
}

// Cam-band aspect from the worker (CAM_BAND_H / TARGET_W = 920/1080).
// Drag handles default to this aspect but the renderer reshapes on
// save, so the streamer's drag doesn't have to match exactly.
const CAM_BAND_ASPECT = 1080 / 920;
const PRESET_W_NORM = 0.22;
const PRESET_H_NORM = 0.27;
const PRESET_INSET = 0.02;

function presetForCorner(
  corner: Props["currentCorner"],
): CamBbox {
  const w = PRESET_W_NORM;
  const h = PRESET_H_NORM;
  const inset = PRESET_INSET;
  switch (corner) {
    case "top_left":
      return { x: inset, y: inset, w, h };
    case "top_right":
      return { x: 1 - inset - w, y: inset, w, h };
    case "bottom_left":
      return { x: inset, y: 1 - inset - h, w, h };
    case "bottom_right":
      return { x: 1 - inset - w, y: 1 - inset - h, w, h };
    default:
      // Centred default. Worst case the streamer drags it.
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }
}

export function CamBboxEditor({
  clipId,
  sourceVideoUrl,
  currentBbox,
  channelBbox,
  currentCorner,
  currentSource,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  // The "verified" pill state — true only when the existing rendered
  // bbox came from the streamer's own pick. Detection-sourced bboxes
  // don't get the pill because they're trust-but-verify.
  const isManual = currentSource === "manual";

  // Resolved starting box. Priority order:
  //   1. clip override (manual or prior render's stamp)
  //   2. channel cache
  //   3. preset for the auto-detected corner
  const initial: CamBbox = React.useMemo(
    () => currentBbox ?? channelBbox ?? presetForCorner(currentCorner),
    [currentBbox, channelBbox, currentCorner],
  );

  const [bbox, setBbox] = React.useState<CamBbox>(initial);
  const [pending, setPending] = React.useState<"save" | "reset" | "snap" | null>(
    null,
  );

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);

  // The container has aspect-video so we can map normalized coords →
  // CSS pixels off its measured size. ResizeObserver keeps it accurate
  // through viewport resizes + responsive layout changes.
  const [containerSize, setContainerSize] = React.useState({
    w: 0,
    h: 0,
  });

  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Live preview — repaint the crop on every bbox change AND every
  // ~120ms while the video is playing (so the preview tracks the
  // playing video, not just the paused frame). Cheap enough; the
  // canvas is 270×230.
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = previewCanvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const sx = bbox.x * video.videoWidth;
          const sy = bbox.y * video.videoHeight;
          const sw = bbox.w * video.videoWidth;
          const sh = bbox.h * video.videoHeight;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            video,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [bbox]);

  // ── Actions ────────────────────────────────────────────────────
  async function save() {
    if (pending) return;
    setPending("save");
    const result = await setClipFaceCamBbox(clipId, bbox);
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Saved · re-rendering",
      description:
        "Refresh in ~30s. The channel default is also updated for future clips.",
    });
    router.refresh();
  }

  async function reset() {
    if (pending) return;
    setPending("reset");
    const result = await resetClipFaceCamBbox(clipId);
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Couldn't reset",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Cleared · re-rendering with auto",
      description:
        "Next render runs detection from scratch. Refresh in ~30s.",
    });
    router.refresh();
  }

  async function snapToFace() {
    if (pending) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast({
        title: "Video not loaded",
        description: "Wait for the source to start playing then try again.",
      });
      return;
    }
    setPending("snap");
    try {
      const snapped = await snapBboxToLargestFace(video);
      setPending(null);
      if (!snapped) {
        toast({
          title: "No face detected on this frame",
          description:
            "Scrub to a frame where the cam is clearly visible, then try again.",
        });
        return;
      }
      setBbox(snapped);
    } catch (exc) {
      setPending(null);
      toast({
        title: "Face detection failed",
        description: (exc as Error).message,
        variant: "destructive",
      });
    }
  }

  const dirty =
    !currentBbox ||
    Math.abs(currentBbox.x - bbox.x) > 0.001 ||
    Math.abs(currentBbox.y - bbox.y) > 0.001 ||
    Math.abs(currentBbox.w - bbox.w) > 0.001 ||
    Math.abs(currentBbox.h - bbox.h) > 0.001;

  // CSS-pixel coords for the Rnd. Normalized → pixels every render.
  const px = {
    x: bbox.x * containerSize.w,
    y: bbox.y * containerSize.h,
    w: bbox.w * containerSize.w,
    h: bbox.h * containerSize.h,
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Drag the rectangle to outline the actual webcam widget — tight on
        the streamer&apos;s face, no surrounding gameplay. The cam band
        in the rendered clip will zoom in on exactly this region.
        Use{" "}
        <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]">
          <Crosshair className="h-2.5 w-2.5" /> Snap
        </span>{" "}
        to auto-fit the box around a detected face on the current frame.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_270px]">
        {/* ── Source video + draggable rectangle ──────────────────── */}
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-md border border-border bg-black"
          style={{ aspectRatio: "16 / 9" }}
        >
          <video
            ref={videoRef}
            src={sourceVideoUrl}
            controls
            muted
            playsInline
            crossOrigin="anonymous"
            className="block h-full w-full"
          />
          {containerSize.w > 0 ? (
            <Rnd
              bounds="parent"
              size={{ width: px.w, height: px.h }}
              position={{ x: px.x, y: px.y }}
              lockAspectRatio={false}
              minWidth={Math.max(20, containerSize.w * 0.03)}
              minHeight={Math.max(20, containerSize.h * 0.03)}
              enableResizing
              onDragStop={(_, d) => {
                setBbox({
                  ...bbox,
                  x: clamp01(d.x / containerSize.w),
                  y: clamp01(d.y / containerSize.h),
                });
              }}
              onResizeStop={(_, _dir, ref, _delta, pos) => {
                setBbox({
                  x: clamp01(pos.x / containerSize.w),
                  y: clamp01(pos.y / containerSize.h),
                  w: clamp01(ref.offsetWidth / containerSize.w),
                  h: clamp01(ref.offsetHeight / containerSize.h),
                });
              }}
              resizeHandleStyles={{
                top: handleEdge("h"),
                bottom: handleEdge("h"),
                left: handleEdge("v"),
                right: handleEdge("v"),
                topLeft: handleCorner(),
                topRight: handleCorner(),
                bottomLeft: handleCorner(),
                bottomRight: handleCorner(),
              }}
              style={{
                border: "2px solid hsl(var(--accent))",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.6), 0 0 0 9999px rgba(0,0,0,0.35)",
                cursor: "move",
              }}
            >
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
                <span className="mb-1.5 rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-foreground">
                  cam region
                </span>
              </div>
            </Rnd>
          ) : null}
        </div>

        {/* ── Live preview tile ──────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Cam band preview
          </span>
          <div
            className={cn(
              "relative overflow-hidden rounded-md border bg-black",
              isManual ? "border-mint/40 ring-1 ring-mint/30" : "border-border",
            )}
            style={{ aspectRatio: `${CAM_BAND_ASPECT}` }}
          >
            <canvas
              ref={previewCanvasRef}
              width={270}
              height={Math.round(270 / CAM_BAND_ASPECT)}
              className="block h-full w-full"
            />
            {isManual ? (
              <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-mint/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-mint">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                verified
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {Math.round(bbox.w * 100)}% × {Math.round(bbox.h * 100)}% of source
          </p>
        </div>
      </div>

      {/* ── Action row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={snapToFace}
            disabled={!!pending}
          >
            <Crosshair className="mr-1 h-3.5 w-3.5" />
            {pending === "snap" ? "Detecting…" : "Snap to face"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!!pending}
            className="text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {pending === "reset" ? "Clearing…" : "Reset to auto"}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {currentSource && currentSource !== "manual" ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-accent" />
              currently auto-picked
            </span>
          ) : null}
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || pending !== null}
            className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:bg-accent/30"
          >
            {pending === "save"
              ? "Re-rendering…"
              : dirty
                ? "Save & re-render"
                : "No change"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MediaPipe "snap to face" ────────────────────────────────────
//
// Runs the same Blaze short-range face detector the worker uses, but
// in the browser via @mediapipe/tasks-vision. Lazy-loaded on first
// click so we don't pay the ~3MB wasm + model download for users who
// never hit the button.

let cachedDetector: import("@mediapipe/tasks-vision").FaceDetector | null = null;

async function getDetector() {
  if (cachedDetector) return cachedDetector;
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
  );
  cachedDetector = await vision.FaceDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.25,
  });
  return cachedDetector;
}

async function snapBboxToLargestFace(
  video: HTMLVideoElement,
): Promise<CamBbox | null> {
  // Snapshot the current frame into a canvas; pass to MediaPipe as an
  // Image. The .detect() call needs a real image element / ImageData
  // / canvas — not the live video, because MediaPipe in IMAGE mode
  // skips frame timestamping.
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");
  ctx.drawImage(video, 0, 0);

  const detector = await getDetector();
  const result = detector.detect(canvas);
  if (!result.detections || result.detections.length === 0) {
    return null;
  }
  // Pick the largest face by bounding-box area. Filters out tiny
  // false positives on in-game characters; the cam face is almost
  // always the biggest real face in any frame.
  const sorted = [...result.detections].sort((a, b) => {
    const aw = a.boundingBox?.width ?? 0;
    const ah = a.boundingBox?.height ?? 0;
    const bw = b.boundingBox?.width ?? 0;
    const bh = b.boundingBox?.height ?? 0;
    return bw * bh - aw * ah;
  });
  const best = sorted[0].boundingBox;
  if (!best) return null;

  // MediaPipe Tasks gives bounding boxes in source pixels. Translate
  // to normalized 0..1 + expand to mimic the worker's _cam_crop_box
  // (1.8× face height, target-aspect width, 20% downward bias on
  // center y).
  const W = canvas.width;
  const H = canvas.height;
  const faceCx = (best.originX + best.width / 2) / W;
  const faceCy = (best.originY + best.height / 2) / H;
  const faceH = best.height / H;

  let cropH = faceH * 1.8;
  let cropW = cropH * (W / H) * CAM_BAND_ASPECT;
  // The cam-band aspect uses HEIGHT-relative widths because the
  // canvas isn't square — translate to a source-relative width:
  cropW = (cropH * H * CAM_BAND_ASPECT) / W;
  if (cropH > 1) {
    cropH = 1;
    cropW = (cropH * H * CAM_BAND_ASPECT) / W;
  }
  if (cropW > 1) {
    cropW = 1;
    cropH = (cropW * W) / (CAM_BAND_ASPECT * H);
  }
  // 20% downward bias on cy (chin stays in-frame). Match the worker.
  const cy = faceCy + faceH * 0.2;

  const x = clamp01(faceCx - cropW / 2);
  const y = clamp01(cy - cropH / 2);
  const w = clamp01(Math.min(cropW, 1 - x));
  const h = clamp01(Math.min(cropH, 1 - y));
  return { x, y, w, h };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function handleEdge(orient: "h" | "v"): React.CSSProperties {
  return orient === "h"
    ? {
        background: "hsl(var(--accent))",
        height: 4,
        opacity: 0.85,
      }
    : {
        background: "hsl(var(--accent))",
        width: 4,
        opacity: 0.85,
      };
}

function handleCorner(): React.CSSProperties {
  return {
    background: "hsl(var(--accent))",
    width: 12,
    height: 12,
    borderRadius: 3,
    border: "2px solid hsl(var(--background))",
  };
}
