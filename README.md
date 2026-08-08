# Play Pot Operations

A one-hand, mobile-first capacity and family-timer tool for the Play Pot area at Children's Museum Singapore.

The deployed site is an installable web app. Staff use the shared six-digit guest PIN to open it, but each phone keeps a completely independent Play Pot record in that browser's local storage. Families, counts, timers, completed records, and shifts are never synced between staff devices.

## Operating rules

- Capacity is derived only from families shown under `Inside now`.
- A family normally enters only when its adult and child count fits within the 15-pax limit.
- A deliberate red overflow flow can record exactly 16 pax after a second confirmation. It can never admit 17 or more, and all further entry is blocked while the live count is over 15.
- Each family starts with a 15-minute limit. Staff can extend or decrease that limit by one-minute steps under `Edit`; the timer never checks a family out automatically.
- Family numbers are allocated only on successful entry and continue on that phone.
- Adult and child counts are entered directly before admission. The visual identifier is optional.
- Visual identifiers should be short, neutral clothing or object descriptions. Do not record names, ethnicity, nationality, ticket numbers, photos, or dates of birth.

## Phone-only memory

`OUT` first asks for confirmation with `No` on the left and `Yes, OUT` on the right. A confirmed OUT also offers a short undo. Correcting a family count can reveal an over-capacity state, which blocks further entry until the count is corrected or somebody leaves.

Clearing browser or installed-app site data erases that phone's Play Pot record. Use one phone for one operating record because devices do not share capacity.

## Local development

The app uses vinext and browser-local storage for operational data. The server handles only the guest PIN session.

```bash
pnpm install
pnpm run dev
pnpm test
```
