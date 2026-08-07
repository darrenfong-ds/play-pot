import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
  assert.match(html, /Opening this phone/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps all operational data on one device", async () => {
  const [
    client,
    localCore,
    css,
    layout,
    readme,
    guestRoute,
    guestAuth,
    guestSessionCore,
    hosting,
    packageJson,
    manifestText,
    serviceWorker,
    worker,
  ] = await Promise.all([
    readFile(new URL("../app/play-pot-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/play-pot-local.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/guest-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/guest-session-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(client, /window\.localStorage/);
  assert.match(client, /LOCAL_STORAGE_KEY/);
  assert.match(client, /THIS PHONE \/ LIVE/);
  assert.match(client, /ENTRY BLOCKED/);
  assert.match(client, /className="out-button"/);
  assert.match(client, /15 MIN REACHED/);
  assert.match(localCore, /const CAPACITY = 15/);
  assert.match(localCore, /currentPax\(state\) \+ pax > CAPACITY/);
  assert.match(localCore, /PLAY_MILLISECONDS = 15 \* 60_000/);

  const removedConcepts = /waiting|waitlist|queue|fifo|ask first|can enter now|api\/state/i;
  for (const source of [client, localCore, css, layout, readme, serviceWorker]) {
    assert.doesNotMatch(source, removedConcepts);
  }

  await assert.rejects(access(new URL("../app/api/state/route.ts", import.meta.url)));

  assert.match(guestRoute, /createGuestSessionCookie/);
  assert.match(guestAuth, /HttpOnly/);
  assert.match(guestAuth, /SameSite=Strict/);
  assert.match(guestAuth, /__Host-play_pot_session/);
  assert.match(guestSessionCore, /crypto\.subtle\.sign/);
  assert.match(guestRoute, /export async function DELETE/);
  assert.doesNotMatch(`${guestRoute}\n${guestAuth}\n${guestSessionCore}\n${client}`, /000000/);

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, null);
  assert.equal(hostingConfig.r2, null);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.doesNotMatch(worker, /D1Database|\bDB:/);
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton/);

  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.match(manifest.description, /On-device/i);
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.doesNotMatch(serviceWorker, /caches\./);
});

test("enforces capacity without creating an outside record", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T06:00:00.000Z");
  const fresh = core.createInitialState(start, "shift-a");

  assert.equal(core.currentPax(fresh), 0);
  assert.equal(core.spacesLeft(fresh), 15);
  assert.equal(fresh.nextFamilyNumber, 1);

  const first = core.addLocalFamily(
    fresh,
    { adults: 1, children: 1, visual: "blue stroller" },
    "family-a",
    start,
  );
  const firstFamily = core.insideFamilies(first)[0];
  assert.equal(firstFamily.familyNumber, 1);
  assert.equal(core.currentPax(first), 2);
  assert.equal(core.familyDueAt(firstFamily), "2026-08-07T06:15:00.000Z");

  const full = core.addLocalFamily(
    first,
    { adults: 12, children: 1, visual: "" },
    "family-b",
    start + 1_000,
  );
  assert.equal(core.currentPax(full), 15);
  assert.equal(core.spacesLeft(full), 0);

  const beforeBlockedEntry = core.serializeLocalState(full);
  assert.throws(
    () =>
      core.addLocalFamily(
        full,
        { adults: 1, children: 1, visual: "red bag" },
        "family-c",
        start + 2_000,
      ),
    (error) => error.code === "capacity_exceeded",
  );
  assert.equal(core.serializeLocalState(full), beforeBlockedEntry);
  assert.equal(full.nextFamilyNumber, 3);
});

test("OUT, undo, corrections, and new shifts preserve the right facts", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T08:00:00.000Z");
  let state = core.createInitialState(start, "shift-one");
  state = core.addLocalFamily(
    state,
    { adults: 7, children: 1, visual: "green cap" },
    "family-one",
    start,
  );
  state = core.addLocalFamily(
    state,
    { adults: 5, children: 1, visual: "black tote" },
    "family-two",
    start + 1_000,
  );
  assert.equal(core.currentPax(state), 14);

  const originalEntry = core.insideFamilies(state)[0].enteredAt;
  const afterOut = core.markLocalFamilyOut(state, "family-one", start + 2_000);
  assert.equal(core.currentPax(afterOut), 6);
  assert.equal(core.insideFamilies(afterOut).length, 1);
  assert.throws(
    () => core.markLocalFamilyOut(afterOut, "family-one", start + 2_001),
    (error) => error.code === "family_changed",
  );

  const restored = core.restoreLocalFamily(afterOut, "family-one", start + 3_000);
  assert.equal(core.currentPax(restored), 14);
  assert.equal(
    core.insideFamilies(restored).find((family) => family.id === "family-one").enteredAt,
    originalEntry,
  );

  const corrected = core.editLocalFamily(
    restored,
    "family-one",
    { adults: 8, children: 1, visual: "green cap" },
    start + 4_000,
  );
  assert.equal(core.currentPax(corrected), 15);

  const overCapacity = core.editLocalFamily(
    corrected,
    "family-one",
    { adults: 9, children: 1, visual: "green cap" },
    start + 5_000,
  );
  assert.equal(core.currentPax(overCapacity), 16);
  assert.equal(core.spacesLeft(overCapacity), -1);
  assert.throws(
    () =>
      core.addLocalFamily(
        overCapacity,
        { adults: 1, children: 1, visual: "" },
        "family-three",
        start + 6_000,
      ),
    (error) => error.code === "capacity_exceeded",
  );

  assert.throws(
    () => core.startLocalShift(overCapacity, "shift-two", start + 7_000),
    (error) => error.code === "active_families",
  );
  const allOut = core.markLocalFamilyOut(
    core.markLocalFamilyOut(overCapacity, "family-one", start + 8_000),
    "family-two",
    start + 9_000,
  );
  const newShift = core.startLocalShift(allOut, "shift-two", start + 10_000);
  assert.equal(newShift.shift.number, 2);
  assert.equal(newShift.shift.id, "shift-two");
  assert.equal(newShift.nextFamilyNumber, 1);
  assert.deepEqual(newShift.families, []);
});

test("round-trips valid phone state and isolates separate devices", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const now = Date.parse("2026-08-07T10:00:00.000Z");
  const phoneA = core.addLocalFamily(
    core.createInitialState(now, "phone-a-shift"),
    { adults: 2, children: 2, visual: "yellow tee" },
    "phone-a-family",
    now,
  );
  const phoneB = core.createInitialState(now, "phone-b-shift");

  assert.equal(core.currentPax(phoneA), 4);
  assert.equal(core.currentPax(phoneB), 0);
  assert.equal(phoneA.nextFamilyNumber, 2);
  assert.equal(phoneB.nextFamilyNumber, 1);

  const restored = core.readLocalState(core.serializeLocalState(phoneA), now);
  assert.deepEqual(restored, phoneA);
  assert.equal(core.readLocalState("not-json", now), null);

  const duplicate = JSON.parse(core.serializeLocalState(phoneA));
  duplicate.families.push({ ...duplicate.families[0], familyNumber: 2 });
  assert.equal(core.readLocalState(JSON.stringify(duplicate), now), null);

  const repaired = JSON.parse(core.serializeLocalState(phoneA));
  repaired.nextFamilyNumber = 1;
  assert.equal(core.readLocalState(JSON.stringify(repaired), now).nextFamilyNumber, 2);
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

test("ships correctly sized install and share images", async () => {
  for (const [filename, width, height] of [
    ["apple-touch-icon.png", 180, 180],
    ["icon-192.png", 192, 192],
    ["icon-512.png", 512, 512],
    ["og.png", 1536, 1024],
  ]) {
    const image = await readFile(new URL(`../public/${filename}`, import.meta.url));
    assert.equal(image.toString("ascii", 1, 4), "PNG");
    assert.equal(image.readUInt32BE(16), width);
    assert.equal(image.readUInt32BE(20), height);
  }
});
