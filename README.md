# Play Pot Operations

A one-hand, mobile-first capacity and family-timer tool for the Play Pot area at Children's Museum Singapore.

The deployed site is an installable web app. Staff use the shared six-digit guest PIN to open it, but each phone keeps a completely independent Play Pot record in that browser's local storage. Families, counts, timers, recent OUT records, and shifts are never synced between staff devices.

## Operating rules

- Capacity is derived only from families shown under `Inside now`.
- The operating target remains 15 pax.
- A deliberate red flex flow can admit 16 through 20 pax after a second confirmation for every entry above the target. New entry above the hard maximum of 20 is always blocked.
- Each family starts with a 15-minute limit. Staff can extend or decrease that limit by one-minute steps under `Edit`; the timer never checks a family out automatically.
- Family numbers are allocated only on successful entry and continue on that phone.
- Adult and child counts are entered directly before admission. The visual identifier is optional.
- Visual identifiers should be short, neutral clothing or object descriptions. Do not record names, ethnicity, nationality, ticket numbers, photos, or dates of birth.

## Phone-only memory

`OUT` first asks for confirmation with `No` on the left and `Yes, OUT` on the right. A confirmed OUT also offers a short undo. For accidental check-outs, a collapsed `Recently OUT` list keeps the family number, adult/child count, visual, IN time, OUT time, and timer setting for up to 15 minutes. Restoring a family preserves its original IN time.

After 15 minutes, the completed family record is removed from this phone's current and backup site storage while the app is open, or immediately on the next opening if the app was closed. This is recovery-only, not permanent visitor history. Corrections and restores can reveal a true count above 20, but all new entry stays blocked until the live count returns to the hard maximum or below.

Clearing browser or installed-app site data erases that phone's Play Pot record. Use one phone for one operating record because devices do not share capacity.

## Local development

The app uses vinext and browser-local storage for operational data. The server handles only the guest PIN session.

```bash
pnpm install
pnpm run dev
pnpm test
```
