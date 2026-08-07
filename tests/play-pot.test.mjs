import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished Play Pot shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Play Pot \| Live Capacity &amp; Family Timer<\/title>/i);
  assert.match(html, /PLAY POT/);
  assert.match(html, /Opening today/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the operational safety rules in the authoritative API", async () => {
  const [route, client, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/play-pot-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(route, /const CAPACITY = 15/);
  assert.match(route, /AND \? <= \$\{CAPACITY\} - COALESCE/);
  assert.match(route, /status = 'waiting'[\s\S]*ORDER BY queued_at ASC, id ASC/);
  assert.match(route, /operation_id TEXT NOT NULL UNIQUE/);
  assert.match(route, /PLAY_MINUTES \* 60_000/);
  assert.doesNotMatch(route, /DELETE FROM families/i);

  assert.match(client, /ASK FIRST/);
  assert.match(client, /15 MIN REACHED/);
  assert.match(client, /CAN ENTER NOW/);
  assert.match(client, /ADD .* TO WAITING/);
  assert.match(client, /className="out-button"/);
  assert.match(client, /state\.waiting\.length > 0/);

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
