import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The /c/:id/embed surface is meant to be iframed by third
        // parties. CSP frame-ancestors=* explicitly allows it; this also
        // overrides any default X-Frame-Options that hosting platforms
        // might inject upstream.
        source: "/c/:clipId/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
