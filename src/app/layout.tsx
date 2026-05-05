import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Clipt — Every clip pays the creator",
  description:
    "The first clipping platform where streamers, fans, clippers, and brands all win.",
  openGraph: {
    title: "Clipt — Every clip pays the creator",
    description:
      "The first clipping platform where streamers, fans, clippers, and brands all win.",
    siteName: "Clipt",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clipt — Every clip pays the creator",
    description:
      "The first clipping platform where streamers, fans, clippers, and brands all win.",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
