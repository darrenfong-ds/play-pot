import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const clientDirectory = path.join(projectRoot, "dist", "client");
const staticDirectory = path.join(clientDirectory, "_next", "static");
const serviceWorkerPath = path.join(clientDirectory, "sw.js");
const buildIdPath = path.join(projectRoot, "dist", "server", "BUILD_ID");

const BUILD_ID_PLACEHOLDER = "__PLAY_POT_BUILD_ID__";
const PRECACHE_START = "/* __PLAY_POT_PRECACHE_START__ */";
const PRECACHE_END = "/* __PLAY_POT_PRECACHE_END__ */";
const STABLE_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

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

function toClientUrl(filePath) {
  return `/${path.relative(clientDirectory, filePath).split(path.sep).join("/")}`;
}

const buildId = (await readFile(buildIdPath, "utf8")).trim();
if (!/^[A-Za-z0-9._-]+$/.test(buildId)) {
  throw new Error("The generated build ID is missing or unsafe.");
}

for (const url of STABLE_SHELL_URLS.filter((url) => url !== "/")) {
  const assetPath = path.join(clientDirectory, ...url.slice(1).split("/"));
  if (!(await stat(assetPath)).isFile()) {
    throw new Error(`Required offline shell asset is missing: ${url}`);
  }
}

const staticUrls = (await listFiles(staticDirectory)).map(toClientUrl).sort();
const precacheUrls = [...new Set([...STABLE_SHELL_URLS, ...staticUrls])];
if (!precacheUrls.some((url) => url.includes("/chunks/play-pot-app-"))) {
  throw new Error("The Play Pot application bundle is missing from the offline shell.");
}

const source = await readFile(serviceWorkerPath, "utf8");
if (!source.includes(BUILD_ID_PLACEHOLDER)) {
  throw new Error("The service-worker build placeholder is missing.");
}
const precacheStartIndex = source.indexOf(PRECACHE_START);
const precacheEndIndex = source.indexOf(PRECACHE_END);
if (precacheStartIndex < 0 || precacheEndIndex <= precacheStartIndex) {
  throw new Error("The service-worker precache placeholders are missing.");
}

const beforePrecache = source.slice(
  0,
  precacheStartIndex + PRECACHE_START.length,
);
const afterPrecache = source.slice(precacheEndIndex);
const withPrecache = `${beforePrecache} ${JSON.stringify(
  precacheUrls,
  null,
  2,
)} ${afterPrecache}`;
const finalized = withPrecache.replaceAll(BUILD_ID_PLACEHOLDER, buildId);

if (
  finalized.includes(BUILD_ID_PLACEHOLDER) ||
  finalized.includes('startsWith("/api/")') === false
) {
  throw new Error("The service worker was not finalized safely.");
}

await writeFile(serviceWorkerPath, finalized, "utf8");
console.log(`Prepared offline shell ${buildId} with ${precacheUrls.length} assets.`);
