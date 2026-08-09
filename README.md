# Play Pot Operations

A one-hand, mobile-first capacity and family-timer tool for the Play Pot area at Children's Museum Singapore.

The site is an installable web app. Staff use the shared six-digit guest PIN to open it, but each phone keeps a completely independent Play Pot record in that browser's local storage. Families, counts, timers, and recent OUT records are never synced between staff devices.

## Operating rules

- Capacity is derived only from families shown under `Inside now`.
- The operating target remains 15 pax.
- A deliberate red flex flow can admit 16 through 20 pax after a second confirmation for every entry above the target. New entry above the hard maximum of 20 is always blocked.
- Each family starts with a 15-minute limit. Under `Edit`, staff can use one-minute controls, quick `-5 min` and `+5 min` controls, or reset the limit to 15 minutes. The projected live total is shown before saving, and an increase above the 15-pax target needs confirmation.
- Family numbers are allocated only on successful entry and continue on that phone.
- The `ENTER FAMILY` button locks for 700 milliseconds after the first tap and shows `RECORDED` after a verified phone save. This prevents a rapid double tap without slowing the next family.
- Adult and child counts are entered directly before admission. The visual identifier is optional.
- Visual identifiers should be short, neutral clothing or object descriptions. Do not record names, ethnicity, nationality, ticket numbers, photos, or dates of birth.
- A compact `NEXT DUE` strip always points to the family whose timer reaches its limit first. It is an indicator only and never performs an automatic OUT.
- Light and dark modes are chosen manually and remembered on that phone.

## Phone-only memory

`OUT` first asks for confirmation with `No` on the left and `Yes, OUT` on the right. A confirmed OUT also offers a short undo. For accidental check-outs, a collapsed `Recently OUT` control directly above the active family cards keeps the family number, adult/child count, visual, IN time, OUT time, and timer setting for up to 15 minutes. Restoring a family preserves its original IN time. Staff can also manually delete one recent record after a second confirmation, with `No` on the left and `Yes, Delete` on the right.

After 15 minutes, the completed family record is removed from this phone's current and backup site storage while the app is open, or immediately on the next opening if the app was closed. This is recovery-only, not permanent visitor history. Corrections and restores can reveal a true count above 20, but all new entry stays blocked until the live count returns to the hard maximum or below.

Clearing browser or installed-app site data erases that phone's Play Pot record. Use one phone for one operating record because devices do not share capacity.

All operational actions remain manual. The app never admits, edits, restores, deletes, or checks out a family by itself. The only automatic record action is the existing privacy cleanup that removes a completed `Recently OUT` recovery record after 15 minutes while open, or on the next opening.

## Local development

The app uses vinext and browser-local storage for operational data. The server handles only the guest PIN session.

```bash
pnpm install
pnpm run dev
pnpm test
```
