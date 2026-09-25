# Play Pot: live capacity and family timers

A mobile web app I built to replace manual session tracking at the Play Pot area of **Children's Museum Singapore**, where I work on the front line. It has been piloted by the front-line team on shift since **August 2026**.

<p>
  <img src="docs/screenshots/01-inside-now.png" width="260" alt="Staff phone: 12 of 15 people inside, family timers sorted by due time, one family 2 minutes over highlighted in amber" />
  &nbsp;
  <img src="docs/screenshots/02-over-capacity-confirm.png" width="260" alt="Entry above the normal capacity of 15 asks for a second confirmation" />
</p>
<img src="docs/screenshots/03-owner-dashboard.png" width="640" alt="Owner's view-only live dashboard showing each staff phone's families, headcount and timers" />

<sub>Screenshots use made-up demo families.</sub>

## The problem

Play Pot runs timed sessions for families, with a normal capacity of 15 people and a hard maximum of 20. Staff tracked sessions with **pen and paper**. During a busy shift, one person had to write each family down, add up the headcount, work out due times, update totals and watch the crowd, all at once.

> With paper, the staff member manages the crowd **and** acts as the calculator and timer. With the tracker, the staff member manages the crowd while the app handles the calculations and timing.

## Pen and paper vs the tracker

| With pen and paper | With the Play Pot tracker |
|---|---|
| Staff add up adults and children by hand, and miscounts are easy. | Every family is totalled automatically, and the live count (e.g. **12 / 15 people, 3 spaces left**) updates on every entry, check-out, edit and restore. |
| Due times are worked out by hand, and staff keep checking the clock. | Entry is timestamped the moment it's recorded. The app calculates the 15-minute due time and shows minutes left or minutes over. |
| It's hard to see who is due next. | **Next due** always points to the earliest family, and overdue families turn amber. |
| Going over 15 people is easy to miss. | Entry above 15 needs a second confirmation. New entry above 20 is blocked. |
| The wrong family gets crossed out, and corrections get messy. | Check-out asks for confirmation, offers undo, and keeps a 15-minute recovery list. Counts, descriptions and timers can be edited cleanly. |
| Handwriting and abbreviations differ between staff. | Every family is recorded the same way, so the record reads the same for everyone and new staff learn one process. |
| It needs a pen and a writing surface. | It works one-handed on a phone while standing or moving, with the main buttons in thumb reach. |
| Paper can be lost, damaged, or read by anyone nearby. | The app is PIN-protected and saves to the phone with a backup copy. Families are described by clothing only, never names, photos or ticket numbers. |
| Old visitor details linger on the sheet and need disposal. | Checked-out records are deleted automatically after 15 minutes. |
| A supervisor has to walk over to check. | A password-protected, **view-only** live dashboard shows every staff phone's count and timers. |

**Where paper still wins:** it doesn't need a charged phone or a connection, so keeping a blank sheet nearby as a fallback is still sensible.

## How I developed it

1. **Spotted the problem on shift:** staff were tracking Play Pot sessions manually.
2. **Turned the operating rules into software:** 15 people normal, 20 maximum and 15-minute sessions are all enforced by the app and pinned by automated tests.
3. **Piloted it with the front-line team** (August 2026), with staff using it on shift, and **iterated on their feedback**. For example, I moved the entry and next check-out buttons into thumb reach, rewrote the labels in plain staff wording, added a Reset button for a clean slate, and made the look calmer. Three alternative layouts were prototyped along the way (branches `proto/a`, `proto/b`, `proto/c`).
4. **Reviewed it:** a written audit with the fix status of each finding is in [docs/audit-2026-09-23.md](docs/audit-2026-09-23.md).
5. **Moved hosting** to a self-managed Cloudflare Workers deployment.

I defined the requirements and operating rules and gathered staff feedback. The code was written with AI coding assistants (Claude and ChatGPT).

## Tech

- **App:** React 19, TypeScript, vinext (a Next.js-style framework on Vite), and an installable web app (PWA).
- **Data:** each phone keeps its own record in the browser, and syncing is best-effort, so a dropped connection doesn't stop staff from recording entries. An anonymous read-only copy syncs to **Cloudflare D1** (SQLite) for the owner's live view.
- **Hosting and security:** Cloudflare Workers. Staff and owner sessions use signed (HMAC-SHA-256) cookies, and secrets live in Cloudflare, not in the code.
- **Quality:** 29 automated tests (`node:test`) cover the capacity rules, timers, numbering, reset, the live view and shift safety.

## Run it locally

```bash
pnpm install --frozen-lockfile
cp .env.example .dev.vars   # then fill in your own demo PIN, session secret and owner password
pnpm run dev
pnpm test
```

## More

- [Staff guide](docs/staff-guide.md): the full operating rules, written for staff.
- [Audit, 23 September 2026](docs/audit-2026-09-23.md): findings and fix status.
