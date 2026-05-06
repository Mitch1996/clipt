#!/usr/bin/env node
/**
 * Tiny wrapper around `supabase` CLI that:
 *   1. Reads SUPABASE_DB_URL from .env.local (so we never hardcode the
 *      pooler region or password).
 *   2. Forwards to `supabase` with --db-url, since linking the project
 *      requires a personal access token we don't want to require.
 *   3. Strips the CLI's "Connecting to ..." stdout banner from
 *      `gen types` output so src/types/database.ts is clean.
 *
 * Usage:
 *   pnpm db:push            -> apply pending migrations
 *   pnpm db:reset           -> drop+recreate from migrations (DESTRUCTIVE)
 *   pnpm db:diff <name>     -> capture schema diff into a new migration
 *   pnpm db:types           -> regenerate src/types/database.ts
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// .env.local lives with the Next app (apps/web/.env.local) since Next's
// own dev server reads from there. Fall back to a root-level copy if
// someone keeps one there for cross-cutting use.
const ENV_PATH = existsSync("apps/web/.env.local")
  ? "apps/web/.env.local"
  : ".env.local";

if (!existsSync(ENV_PATH)) {
  console.error(`db.mjs: ${ENV_PATH} not found. Run from repo root.`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "db.mjs: SUPABASE_DB_URL missing in .env.local. See README.md > Database for the format.",
  );
  process.exit(1);
}

const [, , subcommand, ...rest] = process.argv;

// `shell: true` on Windows so .cmd shims (pnpm.cmd, supabase.cmd) can be
// resolved on PATH. The Node deprecation about shell+args applies to
// untrusted arg strings; our args are constants + SUPABASE_DB_URL from
// the user's own .env.local, so the security caveat doesn't apply.
function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "supabase", ...args], {
      stdio: opts.captureStdout
        ? ["inherit", "pipe", "inherit"]
        : "inherit",
      shell: process.platform === "win32",
    });
    let buffer = "";
    if (opts.captureStdout) {
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
      });
    }
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`supabase ${args.join(" ")} exited with ${code}`));
      } else {
        resolve(buffer);
      }
    });
  });
}

async function main() {
  switch (subcommand) {
    case "push":
      await run(["db", "push", "--db-url", dbUrl]);
      break;
    case "reset":
      await run(["db", "reset", "--db-url", dbUrl]);
      break;
    case "diff": {
      const name = rest[0];
      if (!name) {
        console.error("db.mjs: pnpm db:diff <name> required");
        process.exit(1);
      }
      await run(["db", "diff", "--db-url", dbUrl, "-f", name]);
      break;
    }
    case "types": {
      const out = await run(
        [
          "gen",
          "types",
          "typescript",
          "--db-url",
          dbUrl,
          "--schema",
          "public",
        ],
        { captureStdout: true },
      );
      const idx = out.indexOf("export ");
      if (idx < 0) {
        console.error("db.mjs: gen types output had no `export ` block");
        process.exit(1);
      }
      writeFileSync("apps/web/src/types/database.ts", out.slice(idx));
      console.log("Wrote apps/web/src/types/database.ts");
      break;
    }
    default:
      console.error(
        `db.mjs: unknown subcommand "${subcommand}". Try push|reset|diff|types.`,
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
