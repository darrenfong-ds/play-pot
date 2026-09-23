import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("resets the whole phone only after a guarded No / Yes confirmation", async () => {
  const client = await readSource("app/play-pot-app.tsx");

  // The header button only opens the confirmation; it never resets directly.
  const button = client.slice(
    client.indexOf('className="reset-button"'),
    client.indexOf("</button>", client.indexOf('className="reset-button"')),
  );
  assert.match(button, /setConfirmReset\(true\)/);
  assert.doesNotMatch(button, /handleResetAll/);
  assert.equal(client.match(/handleResetAll\(\);/g)?.length, 1);

  // YES is armed, fires once, and clears both saved copies to an empty record.
  assert.match(
    client,
    /confirm-reset-title[\s\S]*?className="confirm-actions"[\s\S]*?>\s*No\s*<\/[\s\S]*?if \(!claimConfirmation\(\)\) return;\s*setConfirmReset\(false\);\s*confirmationReturnFocusRef\.current = null;\s*handleResetAll\(\);[\s\S]*?>\s*Yes, reset all\s*</,
  );
  assert.match(
    client,
    /function handleResetAll\(\) \{\s*const saved = commitState\(createInitialState\(Date\.now\(\), crypto\.randomUUID\(\)\), \{\s*mirrorToBackup: true,/,
  );

  // Escape, NO and the dialog lifecycle all know about this confirmation.
  assert.equal(client.match(/setConfirmReset\(false\);/g)?.length, 3);
  assert.equal(client.match(/\n\s*confirmReset,\n/g)?.length, 2);
  assert.match(client, /!confirmStartFresh &&\s*!confirmReset/);
});

test("a clean slate has no families and numbers the next family #1", async () => {
  const core = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const start = Date.parse("2026-09-23T02:00:00.000Z");
  let state = core.createInitialState(start, "busy-shift");
  for (const [index, id] of ["a", "b", "c"].entries()) {
    state = core.addLocalFamily(state, { adults: 1, children: 1, visual: "" }, id, start + index);
  }
  state = core.markLocalFamilyOut(state, "a", start + 10);
  assert.equal(core.insideFamilies(state).length, 2);
  assert.equal(core.recentOutFamilies(state, start + 11).length, 1);

  const reset = core.createInitialState(start + 20, "fresh-shift");
  assert.equal(core.insideFamilies(reset).length, 0);
  assert.equal(core.recentOutFamilies(reset, start + 21).length, 0);
  const next = core.addLocalFamily(reset, { adults: 1, children: 1, visual: "" }, "d", start + 30);
  assert.equal(core.insideFamilies(next)[0].familyNumber, 1);
});
