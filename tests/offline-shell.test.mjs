import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const clientDirectory = path.join(projectRoot, "dist", "client");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function extractPrecacheUrls(serviceWorker) {
  const match = serviceWorker.match(
    /\/\* __PLAY_POT_PRECACHE_START__ \*\/\s*(\[[\s\S]*?\])\s*\/\* __PLAY_POT_PRECACHE_END__ \*\//,
  );
  assert.ok(match, "generated service worker should contain a precache list");
  return JSON.parse(match[1]);
}

test("finalizes a complete, version-matched offline shell", async () => {
  const [serviceWorker, buildIdText, packageText] = await Promise.all([
    readFile(path.join(clientDirectory, "sw.js"), "utf8"),
    readFile(path.join(projectRoot, "dist", "server", "BUILD_ID"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8"),
  ]);
  const buildId = buildIdText.trim();
  const packageJson = JSON.parse(packageText);
  const precacheUrls = extractPrecacheUrls(serviceWorker);
  const staticUrls = (await listFiles(path.join(clientDirectory, "_next", "static")))
    .map(
      (filePath) =>
        `/${path.relative(clientDirectory, filePath).split(path.sep).join("/")}`,
    )
    .sort();

  assert.doesNotMatch(serviceWorker, /__PLAY_POT_BUILD_ID__/);
  assert.match(
    serviceWorker,
    new RegExp(`const PLAY_POT_BUILD_ID = "${buildId}"`),
  );
  assert.deepEqual(
    precacheUrls.filter((url) => url.startsWith("/_next/static/")).sort(),
    staticUrls,
  );
  assert.ok(precacheUrls.includes("/"));
  assert.ok(precacheUrls.includes("/manifest.webmanifest"));
  assert.ok(precacheUrls.includes("/icon-192.png"));
  assert.ok(precacheUrls.some((url) => /\/chunks\/play-pot-app-/.test(url)));
  assert.ok(packageJson.scripts.build.includes("finalize-service-worker.mjs"));
  assert.ok(packageJson.scripts.test.includes("pnpm run build"));
});

test("keeps API and phone records outside the offline cache", async () => {
  const serviceWorker = await readFile(
    path.join(clientDirectory, "sw.js"),
    "utf8",
  );
  const precacheUrls = extractPrecacheUrls(serviceWorker);

  assert.equal(precacheUrls.some((url) => url.startsWith("/api/")), false);
  assert.equal(precacheUrls.some((url) => /device-state|localStorage/i.test(url)), false);
  assert.match(serviceWorker, /request\.method !== "GET"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(serviceWorker, /skipWaiting/);
});

test("uses atomic installation and deferred activation", async () => {
  const source = await readFile(
    path.join(projectRoot, "public", "sw.js"),
    "utf8",
  );

  assert.match(source, /addEventListener\("install"/);
  assert.match(source, /Promise\.all/);
  assert.match(source, /await caches\.delete\(CACHE_NAME\)/);
  assert.match(source, /addEventListener\("activate"/);
  assert.match(source, /cacheName\.startsWith\(CACHE_PREFIX\)/);
  assert.match(source, /await self\.clients\.claim\(\)/);
  assert.match(source, /request\.mode === "navigate"/);
  assert.match(source, /ignoreVary: true/);
  assert.doesNotMatch(source, /skipWaiting/);
});
