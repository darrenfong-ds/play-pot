# Play Pot Operations

A one-hand, mobile-first capacity and family-timer tool for the Play Pot area at Children's Museum Singapore.

The site is an installable web app. Staff use the shared six-digit staff PIN to open it, and each phone independently controls its own Play Pot record in that browser's local storage. The phone also sends an anonymous, read-only mirror of families currently inside to a separately protected owner dashboard. Other staff phones cannot view or change one another's records.

## Operating rules

- Capacity is derived only from families shown under `Inside now`.
- The normal Play Pot count is 15 pax.
- Entry above 15 pax uses one simple red button and a second confirmation. New entry above the maximum of 20 is always blocked.
- Each family starts with a 15-minute limit. Tapping a family's details opens `Edit`, where staff can adjust the limit one minute at a time. A count increase above 15 pax still needs confirmation.
- Family numbers are allocated only on successful entry. They continue while an active or recent recovery record exists, then restart at #1 when the tracker is completely empty.
- The entry button locks for 700 milliseconds after the first tap and shows `Added ✓` after a verified phone save. This prevents a rapid double tap without slowing the next family.
- Adult and child counts are entered directly before admission. The visual identifier is optional.
- Visual identifiers should be short, neutral clothing or object descriptions. Do not record names, ethnicity, nationality, ticket numbers, photos, or dates of birth.
- A compact `Next due` strip always points to the family whose timer reaches its limit first. It is an indicator only and never performs an automatic OUT.
- Families are listed by due time: the family due next is at the bottom, directly above the `Enter` button, and newer families are higher up.

## Device memory and read-only live view

`Out` first asks for confirmation with `No` on the left and `Yes, check out` on the right. A confirmed OUT also offers a short undo. For accidental check-outs, a collapsed `Checked out` control directly above the active family cards keeps the family number, adult/child count, visual, IN time, OUT time, and timer setting for up to 15 minutes. `Put back inside` restores a family with its original IN time. Staff can also manually delete one recent record after a second confirmation, with `No` on the left and `Yes, delete` on the right.

`Reset` at the top right clears the whole phone to a clean slate: every family inside and every checked-out record, after a `No` / `Yes, reset all` confirmation. Numbering then starts again at #1. It cannot be undone.

After 15 minutes, the completed family record is removed from this phone's current and backup site storage while the app is open, or immediately on the next opening if the app was closed. This is recovery-only, not permanent visitor history. Corrections and restores can reveal a true count above 20, but all new entry stays blocked until the live count returns to 20 or below.

Clearing browser or installed-app site data erases that phone's Play Pot record. Use one phone for one operating record because devices do not share capacity.

The private owner dashboard is view-only. It shows anonymous phone labels, current families, counts, timers, visuals, and an entry total for the active device session. It has no route or control for admitting, editing, restoring, deleting, or checking out a family on a staff phone. Completed family details are not kept in the shared dashboard, and an inactive phone's anonymous live record expires after 12 hours.

All operational actions remain manual. The app never admits, edits, restores, deletes, or checks out a family by itself. The only automatic record action is the existing privacy cleanup that removes a completed `Checked out` recovery record after 15 minutes while open, or on the next opening.

## Local development

The app uses vinext, browser-local storage for each phone's authoritative operational record, and D1 for the temporary read-only live mirror. The server separately protects staff and owner sessions.

```bash
pnpm install
pnpm run dev
pnpm test
```
