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
