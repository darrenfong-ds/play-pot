import vinext from "vinext";
import { defineConfig } from "vite";

// Your own Cloudflare D1 database. Paste the database_id printed by
//   pnpm exec wrangler d1 create play-pot-live-view --location apac
// A D1 ID is not a secret, so it is safe to commit.
const D1_DATABASE_ID = "c37701f7-894c-4f37-9567-2b9833415a27";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Previously split between .openai/hosting.json and ChatGPT Sites packaging.
// Values match the config Sites generated (dist/server/wrangler.json).
const workerConfig = {
  name: "play-pot-operations",
  main: "./worker/index.ts",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: "play-pot-live-view",
      database_id: D1_DATABASE_ID,
    },
  ],
  observability: { enabled: true },
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: workerConfig,
      }),
    ],
  };
});
