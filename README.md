# Play Pot Operations

A one-hand, mobile-first capacity and family-timer tool for the Play Pot area at Children’s Museum Singapore.

The deployed site is an installable web app. Staff enter a shared six-digit guest PIN, then can add it to an iPhone or Android home screen. Live operational data remains server-protected and is never placed in the app shell or offline cache.

## Operating rules

- Capacity is always derived from families whose status is `inside`.
- App admissions are rejected when they would take occupancy above 15 pax.
- Waiting families do not consume capacity and only the FIFO queue head can be promoted.
- The 15-minute mark is guidance. Reaching it changes the display but never checks a family out automatically.
- There is one automatic operating mode. Overdue families stay subdued until somebody is waiting, then the longest-inside family becomes `ASK FIRST`.
- Family numbers are allocated automatically, remain stable through the queue, and restart only when staff deliberately starts a new empty shift.
- Ticket checking remains a physical staff action. Adult and child counts are entered directly before admission.
- Visual identifiers should be short, neutral clothing or object descriptions. Do not record names, ethnicity, nationality, ticket numbers, photos, or dates of birth.

## Recovery

`OUT` updates the live state immediately and offers a short undo. The database remains authoritative and rejects any admission or undo that would exceed the 15-person limit.

Use one active phone for the operating shift. The site is intended to be hosted with private staff access.

## Local development

The app uses vinext, Cloudflare D1, and Drizzle migrations.

```bash
pnpm install
pnpm run dev
pnpm test
```
