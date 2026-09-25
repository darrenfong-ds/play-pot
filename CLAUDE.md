# Play Pot

Staff capacity and family-timer tracker for the Play Pot area at Children's Museum Singapore. Hosted on the owner's own Cloudflare account: Worker `play-pot-operations`, D1 database `play-pot-live-view` (binding `DB`). Worker config lives in `vite.config.ts`; see `docs/staff-guide.md` for the operating rules in staff terms.

## Standing rules

- **Never upgrade dependencies.** Install with `pnpm install --frozen-lockfile` only. Don't run `pnpm update`, `pnpm add`, or anything else that changes `package.json` versions or `pnpm-lock.yaml`. If pnpm is missing, enable it with `corepack enable` (the version is pinned by `packageManager` in `package.json`).
- **Run `pnpm test` before any deploy. Every test must pass.** Never weaken, skip, or delete a test to make it pass. If a test genuinely needs to change, show the owner the diff and explain why *before* making the change.
- **Never touch secrets or `.env.local`.** Don't read, edit, print, or commit them. Production secrets are managed in the Cloudflare dashboard, not from this repo.
- **After every commit, push to `origin`** (the private GitHub backup, `darrenfong-ds/play-pot`). Push the current branch with a plain `git push`; never force-push.
- **Never deploy without asking first.** This includes `wrangler deploy`, `wrangler d1 ... --remote`, `wrangler secret`, and any other command that changes the live Cloudflare account.
- **The operating rules are deliberate. Don't change them unless the owner asks:**
  - Normal capacity is 15 pax (`CAPACITY`). Entry above 15 needs a second confirmation.
  - The hard maximum is 20 pax (`FLEX_CAPACITY`). New entry above 20 is always blocked.
  - The default family timer is 15 minutes (`DEFAULT_TIME_LIMIT_MINUTES`).
  - `Recently OUT` recovery records expire after 15 minutes (`RECENT_OUT_MILLISECONDS`).
  - Family numbering resets to #1 only when the tracker is completely empty (no inside *and* no recent-OUT records).

  These constants live in `app/play-pot-local.ts`, and `tests/play-pot.test.mjs` pins them.

## Layout

- `app/play-pot-local.ts`: pure state logic for one phone's record (admit, OUT, undo, restore, delete, edit, purge, numbering). Every action returns a new state and never mutates the old one.
- `app/play-pot-app.tsx`: the client UI. It handles PIN unlock, persists to `localStorage` with a backup copy, and runs confirmation dialogs, the entry lock, and the best-effort live sync to `/api/live`.
- `app/live-view-core.ts`, `app/api/live`, `app/api/admin/live`, `app/admin/`: the anonymous read-only mirror in D1 and the owner's view-only dashboard.
- `worker/index.ts`: the Worker entry. `drizzle/`: the D1 migration SQL.
- `tests/`: `pnpm test` runs `vinext build` and then `node --test tests/*.test.mjs`. Some tests check source text with regexes, so renaming UI strings or constants can break them.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm test
pnpm run lint
```
