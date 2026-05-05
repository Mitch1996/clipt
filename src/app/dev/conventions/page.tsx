import { readFile } from "node:fs/promises";
import path from "node:path";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = {
  title: "Conventions — Clipt",
  description: "Project conventions, stack, and folder rules.",
};

async function loadConventions() {
  const filePath = path.join(process.cwd(), "CLAUDE.md");
  return readFile(filePath, "utf8");
}

export default async function ConventionsPage() {
  const markdown = await loadConventions();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          /dev/conventions
        </span>
        <a
          href="https://github.com"
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          source: CLAUDE.md
        </a>
      </div>

      <article className={proseClasses}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </main>
  );
}

// Lightweight prose styling that matches the rest of the design system.
// Tailwind's typography plugin would be cleaner but we'd rather not pull in
// another plugin for one page.
const proseClasses = cn(
  "max-w-none text-[15px] leading-relaxed text-foreground",
  // Headings
  "[&_h1]:mt-12 [&_h1]:mb-4 [&_h1]:text-4xl [&_h1]:font-black [&_h1]:tracking-[-0.03em] [&_h1:first-child]:mt-0",
  "[&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.02em]",
  "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-[-0.01em]",
  "[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-semibold",
  // Body
  "[&_p]:my-4 [&_p]:text-muted-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_em]:italic",
  // Links
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-accent/40 hover:[&_a]:decoration-accent",
  // Blockquote
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-foreground",
  // Lists
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1 [&_li]:text-muted-foreground",
  // Inline code
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground",
  // Code blocks
  "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:leading-relaxed",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-muted-foreground",
  // Tables
  "[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_table]:border-border",
  "[&_thead]:bg-muted",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.14em] [&_th]:text-muted-foreground",
  "[&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm",
  // Horizontal rule
  "[&_hr]:my-10 [&_hr]:border-border",
);
