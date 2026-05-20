import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next 15 serves this from `/manifest.webmanifest` and
 * advertises it via the rendered `<link rel="manifest">`. Installs
 * the live-viewer flow as a standalone app on iOS / Android home
 * screens — full-bleed without the browser chrome.
 *
 * Icons are vectorised via the inline SVG `Logo` rendered into a
 * 512×512 maskable PNG at build time later; for V1 we point at the
 * existing logo.svg + a 192/512 size matrix so Android meets its
 * install requirements.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clipt",
    short_name: "Clipt",
    description:
      "Every clip pays the creator. Tap to clip live streams — earnings route to the streamer automatically.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#FFE600",
    orientation: "portrait-primary",
    categories: ["video", "social", "entertainment"],
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
