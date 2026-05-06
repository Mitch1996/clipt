import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClipPlayer } from "@/features/clips/components/ClipPlayer";
import { getPublicClip } from "@/features/clips/server/getPublicClip";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clipId: string }>;
}): Promise<Metadata> {
  const { clipId } = await params;
  const clip = await getPublicClip(clipId);
  return {
    title: clip ? `${clip.title} — Clipt` : "Clip not found — Clipt",
    robots: { index: false, follow: false },
  };
}

export default async function EmbedClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  const clip = await getPublicClip(clipId);
  if (!clip) notFound();

  return (
    <div className="grid min-h-screen place-items-center bg-black p-0">
      <ClipPlayer
        src={clip.videoUrl}
        poster={clip.thumbnailUrl}
        minimal
        className="h-screen max-h-screen w-auto rounded-none border-none"
      />
    </div>
  );
}
