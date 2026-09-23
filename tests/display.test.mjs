import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("flags a family from an earlier Singapore day without changing its record", async () => {
  const time = await import(new URL("../app/time-format.ts", import.meta.url));
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));

  // 15:59 UTC is 11:59 PM in Singapore; 16:00 UTC is midnight the next day.
  const lateEntry = "2026-08-07T15:59:00.000Z";
  assert.equal(time.isFromEarlierDay(lateEntry, Date.parse("2026-08-07T15:59:59.000Z")), false);
  assert.equal(time.isFromEarlierDay(lateEntry, Date.parse("2026-08-07T16:00:00.000Z")), true);
  // Same UTC date, different Singapore dates: the check follows Singapore time.
  assert.equal(
    time.isFromEarlierDay("2026-08-07T01:00:00.000Z", Date.parse("2026-08-07T17:00:00.000Z")),
    true,
  );
  assert.equal(time.formatShortDate(lateEntry), "Fri 7 Aug");

  const entered = Date.parse(lateEntry);
  const state = core.addLocalFamily(
    core.createInitialState(entered, "stale-shift"),
    { adults: 1, children: 1, visual: "grey hoodie" },
    "stale-family",
    entered,
  );
  const twoDaysLater = entered + 2 * 24 * 60 * 60_000;
  const reopened = core.readLocalState(core.serializeLocalState(state), twoDaysLater);
  assert.deepEqual(reopened, state);
  assert.strictEqual(core.purgeExpiredCompletedFamilies(state, twoDaysLater), state);
  assert.equal(core.insideFamilies(reopened)[0].status, "inside");

  const [client, localCore, css] = await Promise.all([
    readSource("app/play-pot-app.tsx"),
    readSource("app/play-pot-local.ts"),
    readSource("app/globals.css"),
  ]);
  assert.match(
    client,
    /isFromEarlierDay\(family\.enteredAt, now\)[\s\S]*?From an earlier day[\s\S]*?In \{formatShortDate\(family\.enteredAt\)\}/,
  );
  assert.match(css, /\.stale-entry-flag\s*\{/);
  assert.doesNotMatch(localCore, /isFromEarlierDay|time-format/);
});

test("uses the clothing-or-items placeholder on every visual field", async () => {
  const client = await readSource("app/play-pot-app.tsx");
  assert.match(
    client,
    /const VISUAL_PLACEHOLDER = "Clothing or items only, e\.g\. red stroller";/,
  );
  assert.equal(client.match(/placeholder=\{VISUAL_PLACEHOLDER\}/g)?.length, 2);
  assert.doesNotMatch(client, /placeholder="/);
});

test("shows every time as 5:10 PM in Singapore time", async () => {
  const time = await import(new URL("../app/time-format.ts", import.meta.url));
  assert.equal(time.formatClock("2026-08-07T09:10:00.000Z"), "5:10 PM");
  assert.equal(time.formatClock("2026-08-07T01:05:00.000Z"), "9:05 AM");
  assert.equal(time.formatClock("2026-08-07T16:05:00.000Z"), "12:05 AM");
  assert.equal(time.formatClock("2026-08-07T04:00:00.000Z"), "12:00 PM");
  assert.equal(time.formatClock(null), "-");

  const [client, admin] = await Promise.all([
    readSource("app/play-pot-app.tsx"),
    readSource("app/admin/admin-live-view.tsx"),
  ]);
  for (const source of [client, admin]) {
    assert.match(source, /import \{[^}]*\bformatClock\b[^}]*\} from "\.{1,2}\/time-format"/);
    assert.doesNotMatch(source, /function formatClock|new Intl\.DateTimeFormat|toLocale(?:Time)?String/);
  }
  assert.match(client, /In \{formatClock\(family\.enteredAt\)\}[\s\S]*?Out \{formatClock\(family\.departedAt\)\}/);
});
