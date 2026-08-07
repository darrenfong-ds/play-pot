import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function fetchWorker(path = "/", init = {}, bindings = {}, origin = "http://localhost") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, origin), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      ...bindings,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render() {
  return fetchWorker("/", { headers: { accept: "text/html" } });
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
  const [route, guestRoute, guestAuth, guestSessionCore, client, hosting, packageJson, manifestText, serviceWorker] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/guest-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/guest-session-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/play-pot-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(route, /const CAPACITY = 15/);
  assert.match(route, /AND \? <= \$\{CAPACITY\} - COALESCE/);
  assert.match(route, /status = 'waiting'[\s\S]*ORDER BY queued_at ASC, id ASC/);
  assert.match(route, /operation_id TEXT NOT NULL UNIQUE/);
  assert.match(route, /PLAY_MINUTES \* 60_000/);
  assert.match(
    route,
    /export async function GET\(request: Request\)[\s\S]*guardGuestRequest\(request\)[\s\S]*ensureSchema\(\)/,
  );
  assert.match(
    route,
    /export async function POST\(request: Request\)[\s\S]*guardGuestRequest\(request\)[\s\S]*ensureSchema\(\)/,
  );
  assert.match(route, /guardSameOriginJson\(request\)/);
  assert.doesNotMatch(route, /DELETE FROM families/i);
  assert.doesNotMatch(route, /detail:/);

  assert.match(guestRoute, /createGuestSessionCookie/);
  assert.match(guestAuth, /HttpOnly/);
  assert.match(guestAuth, /SameSite=Strict/);
  assert.match(guestAuth, /__Host-play_pot_session/);
  assert.match(guestSessionCore, /crypto\.subtle\.sign/);
  assert.match(guestRoute, /export async function DELETE/);
  assert.doesNotMatch(`${guestRoute}\n${guestAuth}\n${guestSessionCore}\n${client}`, /000000/);

  assert.match(client, /ASK FIRST/);
  assert.match(client, /15 MIN REACHED/);
  assert.match(client, /CAN ENTER NOW/);
  assert.match(client, /ADD .* TO WAITING/);
  assert.match(client, /className="out-button"/);
  assert.match(client, /state\.waiting\.length > 0/);
  assert.doesNotMatch(client, /FIFO QUEUE|history-section|WaitingCard/);
  assert.doesNotMatch(
    client,
    /QUIET MODE|BUSY MODE|mode-switch|control-banner|theme-button|state\.mode/,
  );
  assert.match(client, /className="front-counts"/);
  assert.doesNotMatch(
    client,
    /PRESETS|open-composer-button|preset-grid|custom-count|age-check|UNDER 4|4\+ CHECK/,
  );

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.doesNotMatch(serviceWorker, /caches\./);
});

test("signs, expires, and rejects tampered guest sessions", async () => {
  const {
    createSessionToken,
    GUEST_SESSION_SECONDS,
    pinMatches,
    sessionTokenIsValid,
  } = await import(new URL("../app/guest-session-core.ts", import.meta.url));
  const config = {
    pin: "654321",
    sessionSecret: "test-session-secret-with-more-than-32-characters",
  };
  const issuedAt = 1_900_000_000;

  assert.equal(await pinMatches("654321", config), true);
  assert.equal(await pinMatches("111111", config), false);
  assert.equal(await pinMatches("65432", config), false);

  const token = await createSessionToken(config, issuedAt);
  assert.equal(await sessionTokenIsValid(token, config, issuedAt), true);
  assert.equal(
    await sessionTokenIsValid(token, config, issuedAt + GUEST_SESSION_SECONDS + 1),
    false,
  );

  const tamperedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(await sessionTokenIsValid(tamperedToken, config, issuedAt), false);
  assert.equal(
    await sessionTokenIsValid(token, { ...config, pin: "999999" }, issuedAt),
    false,
  );
  assert.equal(
    await sessionTokenIsValid(
      token,
      { ...config, sessionSecret: "a-different-session-secret-with-32-characters" },
      issuedAt,
    ),
    false,
  );
});

test("ships correctly sized install icons", async () => {
  for (const [filename, size] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    const image = await readFile(new URL(`../public/${filename}`, import.meta.url));
    assert.equal(image.toString("ascii", 1, 4), "PNG");
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
  }
});
