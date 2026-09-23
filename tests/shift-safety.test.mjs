import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

function toPixels(value) {
  const match = value.match(/^([\d.]+)(rem|px)$/);
  assert.ok(match, `unsupported CSS length ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

test("keeps earlier-day families out of NEXT DUE and shows long overdue times in hours", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const time = await import(new URL("../app/time-format.ts", import.meta.url));
  // 23:00 on 7 Aug and 10:00 on 8 Aug, Singapore time.
  const yesterday = Date.parse("2026-08-07T15:00:00.000Z");
  const today = Date.parse("2026-08-08T02:00:00.000Z");
  let state = core.addLocalFamily(
    core.createInitialState(yesterday, "next-due-shift"),
    { adults: 1, children: 1, visual: "grey hoodie" },
    "forgotten-family",
    yesterday,
  );
  state = core.addLocalFamily(
    state,
    { adults: 2, children: 1, visual: "blue stroller" },
    "today-family",
    today,
  );
  const now = today + 20 * 60_000;
  const earlierDay = (family) => time.isFromEarlierDay(family.enteredAt, now);

  assert.equal(core.nextDueLocalFamily(state).id, "forgotten-family");
  assert.equal(core.nextDueLocalFamily(state, earlierDay).id, "today-family");
  assert.equal(core.insideFamilies(state).length, 2);
  assert.equal(core.currentPax(state), 5);

  const onlyForgotten = core.markLocalFamilyOut(state, "today-family", now);
  assert.equal(core.nextDueLocalFamily(onlyForgotten, earlierDay), null);

  assert.equal(time.formatMinutesOver(1), "+1 MIN OVER");
  assert.equal(time.formatMinutesOver(60), "+60 MIN OVER");
  assert.equal(time.formatMinutesOver(61), "+1 HR OVER");
  assert.equal(time.formatMinutesOver(1545), "+25 HR OVER");

  const client = await readSource("app/play-pot-app.tsx");
  assert.match(
    client,
    /nextDueLocalFamily\(state, \(family\) =>\s*isFromEarlierDay\(family\.enteredAt, now\),?\s*\)/,
  );
  assert.match(client, /label: formatMinutesOver\(minutesOver\)/);
  assert.match(client, /className="stale-entry-flag"/);
});

test("ignores taps on every confirmation for 400 ms after it opens", async () => {
  const guard = await import(new URL("../app/confirmation-guard.ts", import.meta.url));
  assert.equal(guard.CONFIRMATION_ARM_MILLISECONDS, 400);
  assert.equal(guard.confirmationArmed(1_000, 1_000), false);
  assert.equal(guard.confirmationArmed(1_000, 1_399), false);
  assert.equal(guard.confirmationArmed(1_000, 1_400), true);

  const client = await readSource("app/play-pot-app.tsx");
  const count = (pattern) => client.match(pattern)?.length ?? 0;
  const yesButtons = count(/className="confirm-yes"/g);
  const noButtons = count(/className="confirm-no"/g);
  assert.ok(yesButtons >= 6);
  assert.equal(count(/if \(!claimConfirmation\(\)\) return;/g), yesButtons);
  assert.equal(noButtons, yesButtons);
  assert.equal(count(/onClick=\{handleConfirmationNo\}/g), noButtons);
  assert.equal(count(/onClick=\{cancelOpenConfirmation\}/g), 0);
  assert.match(
    client,
    /useLayoutEffect\(\(\) => \{\s*confirmationOpenedAtRef\.current = performance\.now\(\);/,
  );
  assert.match(
    client,
    /function claimConfirmation\(\) \{\s*if \(confirmationHandledRef\.current \|\| !confirmationIsArmed\(\)\) return false;/,
  );
});

test("keeps the OUT UNDO notice up and clear of the last OUT button", async () => {
  const [client, css] = await Promise.all([
    readSource("app/play-pot-app.tsx"),
    readSource("app/globals.css"),
  ]);
  assert.match(
    client,
    /undo: saved \? \{ id: liveFamily\.id \} : undefined,\s*\}\);/,
  );
  assert.match(client, /notice\.durationMs \?\?\s*\(notice\.undo\s*\?\s*UNDO_MILLISECONDS/);

  // At the bottom of the page, the reserved space must exceed the notice
  // plus room for one wrapped line of notice text.
  const stack = cssRule(css, ".content-stack");
  const toast = cssRule(css, ".toast");
  const reserved = toPixels(
    stack.match(/padding:[^;]*calc\(([\d.]+(?:rem|px)) \+ env\(safe-area-inset-bottom\)\)/)[1],
  );
  const toastOffset = toPixels(
    toast.match(/bottom: calc\(([\d.]+(?:rem|px)) \+ env\(safe-area-inset-bottom\)\)/)[1],
  );
  const toastHeight = toPixels(toast.match(/min-height: ([\d.]+(?:rem|px));/)[1]);
  const wrappedLine = 20;
  assert.ok(
    reserved >= toastOffset + toastHeight + wrappedLine,
    `bottom space ${reserved}px must be at least ${toastOffset + toastHeight + wrappedLine}px`,
  );
});
