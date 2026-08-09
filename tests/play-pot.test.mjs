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
  assert.match(client, /CANNOT ENTER \/ MAX/);
  assert.match(client, /className="out-button"/);
  assert.match(
    client,
    /<summary aria-label=\{`Edit \$\{familyLabel\(family\)\}`\}>Edit<\/summary>/,
  );
  assert.match(client, /return `#\$\{family\.familyNumber\}`/);
  assert.match(
    client,
    /\{familyLabel\(family\)\} \| \{familyPax\(family\)\} PAX/,
  );
  assert.match(client, /family\.adults === 1 \? "ADULT" : "ADULTS"/);
  assert.match(client, /family\.children === 1 \? "CHILD" : "CHILDREN"/);
  assert.match(client, /timeLimitMinutes} MIN REACHED/);
  assert.doesNotMatch(client, /FLEX MODE|FLEX ENTRY|OVER TARGET|TO HARD MAX/);
  assert.doesNotMatch(client, /FLEX \$\{totalInside\}/);
  assert.doesNotMatch(
    client,
    /over-capacity-alert|target-capacity-alert|result-overflow|result-block/,
  );
  assert.match(client, /!fits \? "commit-overflow" : ""/);
  assert.doesNotMatch(client, /\bTARGET\b/);
  assert.match(client, /\/ \{CAPACITY\} PAX/);
  assert.match(
    client,
    /paxInside >= CAPACITY \? "capacity-full" : "capacity-safe"/,
  );
  assert.match(css, /\.capacity-number\.capacity-safe strong/);
  assert.match(css, /\.capacity-number\.capacity-full strong/);
  assert.match(
    client,
    /slotsLeftToFifteen === 1 \? "SLOT" : "SLOTS"/,
  );
  assert.match(client, /MAX PAX/);
  assert.match(client, /Recently OUT/);
  assert.match(client, /RESTORE/);
  assert.match(client, /YES, DELETE/);
  assert.match(client, /deleteRecentLocalFamily/);
  assert.match(client, /ENTRY_LOCK_MILLISECONDS = 700/);
  assert.match(client, /ACTION_NOTICE_MILLISECONDS = 1_000/);
  assert.equal(
    client.match(
      /durationMs: saved \? ACTION_NOTICE_MILLISECONDS : undefined/g,
    )?.length,
    2,
  );
  assert.match(client, /RECORDED ✓/);
  assert.match(client, /NEXT DUE/);
  assert.match(client, /play-pot\.theme\.v1/);
  assert.match(client, /<ThemeToggle/);
  assert.doesNotMatch(client, /-5 MIN/);
  assert.doesNotMatch(client, /RESET 15/);
  assert.doesNotMatch(client, /\+5 MIN/);
  assert.doesNotMatch(client, /LIVE TOTAL AFTER SAVE/);
  assert.doesNotMatch(client, /recommended \/ no names/);
  assert.match(client, /\{selectedPax\} PAX FITS/);
  assert.doesNotMatch(client, /to target after entry/);
  assert.match(client, /activeFamilies\.length === 1 \? "FAMILY" : "FAMILIES"/);
  assert.match(client, /Decrease time limit by 1 minute/);
  assert.match(client, /Extend time limit by 1 minute/);
  assert.match(client, /SAVE COUNT CORRECTION/);
  assert.match(client, /Recovery available for 15 min/);
  assert.doesNotMatch(client, /deletes in \d|delete(?:s|d)? in \{?/i);
  assert.match(
    client,
    /className="confirm-actions"[\s\S]*?>\s*NO\s*<\/[\s\S]*?>\s*YES, OUT\s*</,
  );
  assert.match(
    client,
    /confirm-delete-title[\s\S]*?className="confirm-actions"[\s\S]*?>\s*NO\s*<\/[\s\S]*?>\s*YES, DELETE\s*</,
  );
  assert.match(client, /YES, ENTER/);
  assert.match(client, /ENTER ABOVE \{CAPACITY\}\?/);
  assert.doesNotMatch(client, />\s*INSTALL APP\s*</);
  assert.doesNotMatch(client, />\s*LOCK\s*</);
  assert.doesNotMatch(client, />\s*NEW SHIFT\s*</);
  assert.match(localCore, /const CAPACITY = 15/);
  assert.match(localCore, /const FLEX_CAPACITY = 20/);
  assert.match(localCore, /const RECENT_OUT_MILLISECONDS =/);
  assert.match(localCore, /DEFAULT_TIME_LIMIT_MINUTES = 15/);
  assert.match(localCore, /allowFlex/);
  assert.match(localCore, /recentOutFamilies/);
  assert.match(localCore, /purgeExpiredCompletedFamilies/);
  assert.match(localCore, /restoreRecentLocalFamily/);
  assert.match(localCore, /deleteRecentLocalFamily/);
  assert.match(localCore, /play-pot\.device-state\.v2/);
  assert.match(client, /LEGACY_LOCAL_STORAGE_KEY/);
  assert.match(client, /purgeExpiredCompletedFamilies\(previous, savedAt\)/);
  assert.match(client, /removeItem\(LEGACY_LOCAL_STORAGE_BACKUP_KEY\)/);

  const removedConcepts =
    /waitlist|queue|fifo|ask first|can enter now|waiting (?:list|family|queue)|api\/state/i;
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
  assert.equal(core.nextDueLocalFamily(fresh), null);
  assert.equal(fresh.nextFamilyNumber, 1);

  const first = core.addLocalFamily(
    fresh,
    { adults: 1, children: 1, visual: "blue stroller" },
    "family-a",
    start,
  );
  const firstFamily = core.insideFamilies(first)[0];
  assert.equal(firstFamily.familyNumber, 1);
  assert.equal(firstFamily.timeLimitMinutes, 15);
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

test("requires explicit flex approval above 15 and never admits above 20", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T07:00:00.000Z");

  assert.equal(core.CAPACITY, 15);
  assert.equal(core.FLEX_CAPACITY, 20);
  assert.equal(core.RECENT_OUT_MILLISECONDS, 15 * 60_000);

  const atThirteen = core.addLocalFamily(
    core.createInitialState(start, "target-shift"),
    { adults: 12, children: 1, visual: "large family" },
    "target-family",
    start,
  );
  const atTarget = core.addLocalFamily(
    atThirteen,
    { adults: 1, children: 1, visual: "blue cap" },
    "target-fifteen",
    start + 1_000,
  );
  assert.equal(core.currentPax(atTarget), 15);

  const atFourteen = core.addLocalFamily(
    core.createInitialState(start, "flex-shift"),
    { adults: 13, children: 1, visual: "grey stroller" },
    "large-family",
    start,
  );
  assert.equal(core.currentPax(atFourteen), 14);

  const beforeUnapprovedSixteen = core.serializeLocalState(atFourteen);
  assert.throws(
    () =>
      core.addLocalFamily(
        atFourteen,
        { adults: 1, children: 1, visual: "red cap" },
        "flex-sixteen",
        start + 1_000,
      ),
    (error) => error.code === "capacity_exceeded",
  );
  assert.equal(core.serializeLocalState(atFourteen), beforeUnapprovedSixteen);
  assert.equal(atFourteen.nextFamilyNumber, 2);

  const atSixteen = core.addLocalFamily(
    atFourteen,
    { adults: 1, children: 1, visual: "red cap" },
    "flex-sixteen",
    start + 1_000,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(atSixteen), 16);
  assert.equal(core.spacesLeft(atSixteen), -1);
  assert.equal(atSixteen.nextFamilyNumber, 3);

  const beforeUnapprovedEighteen = core.serializeLocalState(atSixteen);
  assert.throws(
    () =>
      core.addLocalFamily(
        atSixteen,
        { adults: 1, children: 1, visual: "yellow bag" },
        "flex-eighteen-unapproved",
        start + 2_000,
      ),
    (error) => error.code === "capacity_exceeded",
  );
  assert.equal(core.serializeLocalState(atSixteen), beforeUnapprovedEighteen);

  const atEighteen = core.addLocalFamily(
    atSixteen,
    { adults: 1, children: 1, visual: "yellow bag" },
    "flex-eighteen",
    start + 2_000,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(atEighteen), 18);

  const atTwenty = core.addLocalFamily(
    atEighteen,
    { adults: 1, children: 1, visual: "green tote" },
    "flex-twenty",
    start + 3_000,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(atTwenty), 20);
  assert.equal(core.spacesLeft(atTwenty), -5);

  const beforeAboveHardMax = core.serializeLocalState(atTwenty);
  for (const allowFlex of [false, true]) {
    assert.throws(
      () =>
        core.addLocalFamily(
          atTwenty,
          { adults: 1, children: 1, visual: "blocked" },
          `blocked-${allowFlex}`,
          start + 4_000,
          { allowFlex },
        ),
      (error) => error.code === "capacity_exceeded",
    );
    assert.equal(core.serializeLocalState(atTwenty), beforeAboveHardMax);
  }

  const fresh = core.createInitialState(start, "single-family-shift");
  assert.throws(
    () =>
      core.addLocalFamily(
        fresh,
        { adults: 19, children: 1, visual: "large group" },
        "twenty-unapproved",
        start,
      ),
    (error) => error.code === "capacity_exceeded",
  );
  const singleFamilyAtTwenty = core.addLocalFamily(
    fresh,
    { adults: 19, children: 1, visual: "large group" },
    "twenty-approved",
    start,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(singleFamilyAtTwenty), 20);
  assert.throws(
    () =>
      core.addLocalFamily(
        fresh,
        { adults: 20, children: 1, visual: "too large" },
        "twenty-one",
        start,
        { allowFlex: true },
      ),
    (error) => error.code === "invalid_count",
  );
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

test("keeps recently OUT details for less than 15 minutes and deletes them at expiry", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T09:00:00.000Z");
  const firstEntry = core.addLocalFamily(
    core.createInitialState(start, "recent-out-shift"),
    { adults: 1, children: 2, visual: "red cap child" },
    "departed-family",
    start,
  );
  const withActiveFamily = core.addLocalFamily(
    firstEntry,
    { adults: 1, children: 1, visual: "blue stroller" },
    "active-family",
    start + 1_000,
  );
  const withLaterDeparture = core.addLocalFamily(
    withActiveFamily,
    { adults: 1, children: 1, visual: "green tote" },
    "later-departure",
    start + 2_000,
  );
  const outAt = start + 60_000;
  const afterOut = core.markLocalFamilyOut(
    withLaterDeparture,
    "departed-family",
    outAt,
  );
  const laterOutAt = outAt + 5 * 60_000;
  const afterLaterOut = core.markLocalFamilyOut(
    afterOut,
    "later-departure",
    laterOutAt,
  );
  const expiresAt = outAt + core.RECENT_OUT_MILLISECONDS;

  assert.deepEqual(
    core.recentOutFamilies(afterOut, outAt).map((family) => family.id),
    ["departed-family"],
  );
  assert.equal(
    core.recentOutFamilies(afterOut, expiresAt - 1).length,
    1,
  );
  assert.equal(core.recentOutFamilies(afterOut, expiresAt).length, 0);
  assert.deepEqual(
    core.recentOutFamilies(afterLaterOut, laterOutAt).map((family) => family.id),
    ["later-departure", "departed-family"],
  );
  assert.deepEqual(
    core.recentOutFamilies(afterLaterOut, expiresAt).map((family) => family.id),
    ["later-departure"],
  );

  const beforeExpiry = core.purgeExpiredCompletedFamilies(afterOut, expiresAt - 1);
  assert.strictEqual(beforeExpiry, afterOut);
  assert.equal(
    beforeExpiry.families.some((family) => family.id === "departed-family"),
    true,
  );

  const expired = core.purgeExpiredCompletedFamilies(afterLaterOut, expiresAt);
  assert.equal(
    expired.families.some((family) => family.id === "departed-family"),
    false,
  );
  assert.equal(
    expired.families.some(
      (family) => family.id === "later-departure" && family.status === "completed",
    ),
    true,
  );
  assert.equal(
    expired.families.some(
      (family) => family.id === "active-family" && family.status === "inside",
    ),
    true,
  );
  assert.equal(expired.nextFamilyNumber, afterLaterOut.nextFamilyNumber);
  assert.doesNotMatch(core.serializeLocalState(expired), /red cap child/);

  const expiredOnly = core.purgeExpiredCompletedFamilies(afterOut, expiresAt);
  assert.equal(expiredOnly.undo, null);
  assert.equal(expiredOnly.revision, afterOut.revision);
  assert.doesNotMatch(core.serializeLocalState(expiredOnly), /red cap child/);

  const loadedAtExpiry = core.readLocalState(
    core.serializeLocalState(afterLaterOut),
    expiresAt,
  );
  assert.ok(loadedAtExpiry);
  assert.equal(
    loadedAtExpiry.families.some((family) => family.id === "departed-family"),
    false,
  );
  assert.equal(
    loadedAtExpiry.families.some((family) => family.id === "later-departure"),
    true,
  );
  assert.throws(
    () => core.restoreRecentLocalFamily(afterLaterOut, "departed-family", expiresAt),
  );
});

test("manually deletes only an available Recently OUT record without reusing its family number", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T09:20:00.000Z");
  let state = core.addLocalFamily(
    core.createInitialState(start, "manual-delete-shift"),
    {
      adults: 2,
      children: 1,
      visual: "striped shirt and orange pram",
    },
    "delete-this-family",
    start,
  );
  state = core.addLocalFamily(
    state,
    { adults: 1, children: 1, visual: "blue cap" },
    "active-family",
    start + 1_000,
  );

  const outAt = start + 60_000;
  const afterOut = core.markLocalFamilyOut(
    state,
    "delete-this-family",
    outAt,
  );
  const originalNextFamilyNumber = afterOut.nextFamilyNumber;
  const activeFamilyBeforeDelete = afterOut.families.find(
    (family) => family.id === "active-family",
  );
  assert.equal(afterOut.undo.familyId, "delete-this-family");
  assert.equal(core.currentPax(afterOut), 2);

  const deletedAt = outAt + 500;
  const deleted = core.deleteRecentLocalFamily(
    afterOut,
    "delete-this-family",
    deletedAt,
  );
  assert.equal(deleted.revision, afterOut.revision + 1);
  assert.equal(deleted.savedAt, new Date(deletedAt).toISOString());
  assert.equal(deleted.nextFamilyNumber, originalNextFamilyNumber);
  assert.equal(deleted.undo, null);
  assert.equal(core.currentPax(deleted), 2);
  assert.deepEqual(
    deleted.families.find((family) => family.id === "active-family"),
    activeFamilyBeforeDelete,
  );
  assert.equal(
    deleted.families.some((family) => family.id === "delete-this-family"),
    false,
  );
  assert.equal(core.recentOutFamilies(deleted, deletedAt).length, 0);

  const serialized = core.serializeLocalState(deleted);
  assert.doesNotMatch(serialized, /delete-this-family/);
  assert.doesNotMatch(serialized, /striped shirt and orange pram/);

  const withNextFamily = core.addLocalFamily(
    deleted,
    { adults: 1, children: 1, visual: "green tote" },
    "next-family",
    deletedAt + 1,
  );
  assert.equal(
    withNextFamily.families.find((family) => family.id === "next-family")
      .familyNumber,
    originalNextFamilyNumber,
  );
  assert.equal(withNextFamily.nextFamilyNumber, originalNextFamilyNumber + 1);

  const secondFamilyOut = core.markLocalFamilyOut(
    afterOut,
    "active-family",
    outAt + 100,
  );
  assert.equal(secondFamilyOut.undo.familyId, "active-family");
  const deletedOlderRecord = core.deleteRecentLocalFamily(
    secondFamilyOut,
    "delete-this-family",
    outAt + 200,
  );
  assert.equal(deletedOlderRecord.undo.familyId, "active-family");
  assert.equal(
    deletedOlderRecord.undo.afterRevision,
    deletedOlderRecord.revision,
  );
  const unrelatedUndoStillWorks = core.restoreLocalFamily(
    deletedOlderRecord,
    "active-family",
    outAt + 300,
  );
  assert.equal(core.currentPax(unrelatedUndoStillWorks), 2);
  assert.equal(
    unrelatedUndoStillWorks.families.some(
      (family) => family.id === "delete-this-family",
    ),
    false,
  );

  const restoredInside = core.restoreLocalFamily(
    afterOut,
    "delete-this-family",
    outAt + 1_000,
  );
  const unavailableCases = [
    {
      state: deleted,
      familyId: "delete-this-family",
      now: deletedAt + 1,
    },
    {
      state: afterOut,
      familyId: "active-family",
      now: deletedAt + 1,
    },
    {
      state: restoredInside,
      familyId: "delete-this-family",
      now: outAt + 1_001,
    },
    {
      state: afterOut,
      familyId: "missing-family",
      now: deletedAt + 1,
    },
    {
      state: afterOut,
      familyId: "delete-this-family",
      now: outAt + core.RECENT_OUT_MILLISECONDS,
    },
  ];

  for (const unavailable of unavailableCases) {
    const beforeAttempt = core.serializeLocalState(unavailable.state);
    assert.throws(
      () =>
        core.deleteRecentLocalFamily(
          unavailable.state,
          unavailable.familyId,
          unavailable.now,
        ),
      (error) =>
        error.code === "delete_unavailable" &&
        /no longer available to delete/i.test(error.message),
    );
    assert.equal(core.serializeLocalState(unavailable.state), beforeAttempt);
  }
});

test("restores a recent factual OUT after quick undo expires, even above 20", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T09:30:00.000Z");
  let state = core.addLocalFamily(
    core.createInitialState(start, "recent-restore-shift"),
    { adults: 1, children: 1, visual: "yellow tee kid" },
    "wrongly-out",
    start,
  );
  state = core.editLocalFamily(
    state,
    "wrongly-out",
    {
      adults: 1,
      children: 1,
      visual: "yellow tee kid",
      timeLimitMinutes: 25,
    },
    start + 500,
  );
  state = core.addLocalFamily(
    state,
    { adults: 17, children: 1, visual: "large group" },
    "eighteen-pax",
    start + 1_000,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(state), 20);

  const original = state.families.find((family) => family.id === "wrongly-out");
  const outAt = start + 2_000;
  const afterOut = core.markLocalFamilyOut(state, "wrongly-out", outAt);
  assert.equal(core.currentPax(afterOut), 18);
  assert.throws(
    () =>
      core.restoreLocalFamily(
        afterOut,
        "wrongly-out",
        outAt + core.UNDO_MILLISECONDS + 1,
      ),
    (error) => error.code === "undo_unavailable",
  );

  const refilledToTwenty = core.addLocalFamily(
    afterOut,
    { adults: 1, children: 1, visual: "new arrival" },
    "replacement-family",
    outAt + core.UNDO_MILLISECONDS + 2,
    { allowFlex: true },
  );
  assert.equal(core.currentPax(refilledToTwenty), 20);

  const restored = core.restoreRecentLocalFamily(
    refilledToTwenty,
    "wrongly-out",
    outAt + core.UNDO_MILLISECONDS + 3,
  );
  assert.equal(core.currentPax(restored), 22);
  assert.equal(core.recentOutFamilies(restored, outAt + 20_000).length, 0);

  const restoredFamily = core.insideFamilies(restored).find(
    (family) => family.id === "wrongly-out",
  );
  assert.deepEqual(
    {
      id: restoredFamily.id,
      familyNumber: restoredFamily.familyNumber,
      adults: restoredFamily.adults,
      children: restoredFamily.children,
      visual: restoredFamily.visual,
      timeLimitMinutes: restoredFamily.timeLimitMinutes,
      createdAt: restoredFamily.createdAt,
      enteredAt: restoredFamily.enteredAt,
      departedAt: restoredFamily.departedAt,
      status: restoredFamily.status,
    },
    {
      id: original.id,
      familyNumber: original.familyNumber,
      adults: original.adults,
      children: original.children,
      visual: original.visual,
      timeLimitMinutes: original.timeLimitMinutes,
      createdAt: original.createdAt,
      enteredAt: original.enteredAt,
      departedAt: null,
      status: "inside",
    },
  );

  const beforeBlockedEntry = core.serializeLocalState(restored);
  for (const allowFlex of [false, true]) {
    assert.throws(
      () =>
        core.addLocalFamily(
          restored,
          { adults: 1, children: 1, visual: "blocked arrival" },
          `blocked-after-restore-${allowFlex}`,
          outAt + 20_001,
          { allowFlex },
        ),
      (error) => error.code === "capacity_exceeded",
    );
    assert.equal(core.serializeLocalState(restored), beforeBlockedEntry);
  }
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

  const oldPhoneRecord = JSON.parse(core.serializeLocalState(phoneA));
  oldPhoneRecord.schemaVersion = 1;
  delete oldPhoneRecord.families[0].timeLimitMinutes;
  const migrated = core.readLocalState(JSON.stringify(oldPhoneRecord), now);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.families[0].timeLimitMinutes, 15);
  assert.match(core.serializeLocalState(migrated), /"timeLimitMinutes":15/);

  const brokenCurrentRecord = JSON.parse(core.serializeLocalState(phoneA));
  delete brokenCurrentRecord.families[0].timeLimitMinutes;
  assert.equal(core.readLocalState(JSON.stringify(brokenCurrentRecord), now), null);

  const legacyAfterOut = core.markLocalFamilyOut(
    phoneA,
    "phone-a-family",
    now + 1_000,
  );
  const legacyWithUndo = JSON.parse(core.serializeLocalState(legacyAfterOut));
  legacyWithUndo.schemaVersion = 1;
  delete legacyWithUndo.families[0].timeLimitMinutes;
  const migratedWithUndo = core.readLocalState(
    JSON.stringify(legacyWithUndo),
    now + 2_000,
  );
  assert.equal(migratedWithUndo.revision, legacyAfterOut.revision);
  assert.equal(migratedWithUndo.undo.familyId, "phone-a-family");
  const restoredAfterMigration = core.restoreLocalFamily(
    migratedWithUndo,
    "phone-a-family",
    now + 3_000,
  );
  assert.equal(core.currentPax(restoredAfterMigration), 4);
  assert.equal(core.insideFamilies(restoredAfterMigration)[0].timeLimitMinutes, 15);
});

test("edits each family time limit without changing its entry time", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-08-07T11:00:00.000Z");
  const entered = core.addLocalFamily(
    core.createInitialState(start, "timer-shift"),
    { adults: 1, children: 1, visual: "blue bag" },
    "timer-family",
    start,
  );
  const original = core.insideFamilies(entered)[0];

  const extended = core.editLocalFamily(
    entered,
    "timer-family",
    {
      adults: 1,
      children: 1,
      visual: "blue bag",
      timeLimitMinutes: 20,
    },
    start + 1_000,
  );
  const extendedFamily = core.insideFamilies(extended)[0];
  assert.equal(extendedFamily.enteredAt, original.enteredAt);
  assert.equal(extendedFamily.timeLimitMinutes, 20);
  assert.equal(core.familyDueAt(extendedFamily), "2026-08-07T11:20:00.000Z");
  assert.deepEqual(
    core.readLocalState(core.serializeLocalState(extended), start + 1_000),
    extended,
  );

  const withLaterFamily = core.addLocalFamily(
    extended,
    { adults: 1, children: 1, visual: "red stroller" },
    "timer-family-later",
    start + 2 * 60_000,
  );
  assert.equal(
    core.nextDueLocalFamily(withLaterFamily).id,
    "timer-family-later",
  );
  const tiedDueTimes = core.editLocalFamily(
    withLaterFamily,
    "timer-family-later",
    {
      adults: 1,
      children: 1,
      visual: "red stroller",
      timeLimitMinutes: 18,
    },
    start + 2 * 60_000 + 1_000,
  );
  assert.equal(core.nextDueLocalFamily(tiedDueTimes).id, "timer-family");

  const decreased = core.editLocalFamily(
    extended,
    "timer-family",
    {
      adults: 1,
      children: 1,
      visual: "blue bag",
      timeLimitMinutes: 10,
    },
    start + 2_000,
  );
  assert.equal(core.familyDueAt(core.insideFamilies(decreased)[0]), "2026-08-07T11:10:00.000Z");

  const beforeInvalidEdit = core.serializeLocalState(decreased);
  for (const timeLimitMinutes of [
    0,
    1.5,
    null,
    "15",
    core.MAX_TIME_LIMIT_MINUTES + 1,
  ]) {
    assert.throws(
      () =>
        core.editLocalFamily(
          decreased,
          "timer-family",
          { adults: 1, children: 1, visual: "blue bag", timeLimitMinutes },
          start + 3_000,
        ),
      (error) => error.code === "invalid_time_limit",
    );
  }
  assert.equal(core.serializeLocalState(decreased), beforeInvalidEdit);
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
