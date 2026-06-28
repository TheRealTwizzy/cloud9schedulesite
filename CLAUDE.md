# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is **pre-scaffold**. It contains only the build spec
(`CLAUDE_CODE_PROMPT.md`) and the seed data in `data/`. The Next.js application
described below does not exist yet — `app/`, `lib/`, `components/`,
`package.json`, etc. still need to be created. `CLAUDE_CODE_PROMPT.md` is the
authoritative specification; read it in full before building or changing
behavior. This file summarizes the parts most likely to bite you.

## Commands

The app is a Next.js 14 (App Router) project. Once scaffolded:

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
npm start        # serve production build
```

There is no test framework specified. If you add one, prefer it to be runnable
offline (the whole app is meant to run with zero network dependencies).

## Architecture

A **fully local, self-contained** employee scheduling app for Cloud 9, a
multi-location entertainment business. No database, no external services, no
email, no OAuth — auth, data, and logic all live in the project directory.

- **Data layer:** JSON files in `data/` are the database. They are read/written
  with Node `fs` **only inside API routes** (`app/api/...`). Never import `fs`
  in client or page components. All writes are read → mutate-in-memory → write
  back to the same path with `writeFileSync(..., JSON.stringify(data, null, 2))`
  inside try/catch. At <25 employees this read-lock pattern is acceptable for
  concurrent writes.
- **Auth:** `iron-session` encrypted cookies + `bcryptjs` (rounds=12). No JWT.
  Session secret is hardcoded in `lib/session.ts` (spec says note that it should
  move to env in production).
- **Swap engine:** `lib/swapEngine.ts` is the core algorithmic feature — a pure
  server-side BFS that finds shift-coverage chains. See below.
- **Shared types** live in `lib/types.ts`; JSON read/write helpers in `lib/db.ts`.

### Data files (`data/`) — do not change their shape

The app reads/writes these exact structures (full TypeScript shapes in
`CLAUDE_CODE_PROMPT.md`):

- `users.json` — 22 accounts. Key fields: `role` (`owner`|`employee`), `group`
  (`owner`|`general`|`security`|`warehouse`|`overnight`), `primaryLocations`,
  `mustSetPassword`, `hashedPassword`.
- `schedule.json` — `Shift` records seeded for the week of Jun 28–Jul 4 2026.
  Note `crossesMidnight` / `endsNextDay` for overnight shifts.
- `locations.json` — per-location brand `color` and hours.
- `swap_config.json` — engine rules / group permissions. **Read-only at runtime.**
- `requests.json` — time-off and shift-swap requests with their approval chains.

## Swap engine — hard constraints

These are non-negotiable correctness rules, not preferences:

- **BFS capped at exactly 2 hops.** Hop 0 = direct cover; Hop 1 = one relay
  (B covers requester, C covers B). Never search deeper. Return up to 3 ranked
  suggestions, or an explicit "no simple coverage available" empty result.
- **Group rules:**
  - `overnight` (James) is **excluded entirely** — never a suggested coverer,
    and his shifts can never be the *target* of a swap initiated by others.
  - `warehouse` (Nate, Jessie, Julia): warehouse pool and locations only.
  - `security` (Kaiden, Hunter): security first, can cover store locations but
    must rank **last** for store shifts.
  - `general`: any store/security employee.
- **Double-booking** is a time-overlap check, not just same-date — an employee
  can't be two places at once.
- `primaryLocations` match is weighted highly but cross-location coverage is
  allowed (not excluded).
- **Ranking order:** fewest hops → primary-location match → fewest location
  changes → alphabetical by first chain member.

## Approval flow

Multi-party: request → all employee chain members accept → owner approves →
schedule updated. State lives in `requests.json.overallStatus`:
`pending_employee_approval` → `pending_owner_approval` → `approved`/`declined`.

- If any chain member **declines**, the whole request becomes `cancelled`; the
  declining employee's own shift is untouched.
- **Owner approve** rewrites `schedule.json`: requester's shift `employeeId`
  becomes the first chain member's id; for a 2-hop chain, that member's original
  shift goes to the second member. Owner **deny** requires a note and leaves the
  schedule unchanged.

## Other behaviors that trip people up

- **First login:** when `mustSetPassword === true`, the login form must NOT
  validate the password (stored hash is null) — redirect silently to
  `/set-password`. UX is "let's get you set up," not "wrong password."
- **Owner has 0 shifts:** `/dashboard` must detect `role === "owner"` and
  redirect to `/owner`.
- **Week display is dynamic:** always show the week containing today's date
  (Sun–Sat). Show "No shifts scheduled this week" gracefully when data lacks the
  current week. Don't hardcode the seeded week.
- **Overnight shift date** is the shift's START date (relevant for time-off on
  `crossesMidnight` shifts).
- New request IDs use `crypto.randomUUID()` (Node 18+, no import).

## Route protection

All routes except `/login` and `/set-password` require a session. `/owner`
redirects non-owners to `/dashboard`. `/set-password` redirects to `/login` with
no session, or to `/dashboard` if a session exists with `mustSetPassword === false`.

## Brand / UI

- Colors: `c9-green` `#6DB832`, `c9-purple` `#7A2FA8` (define in Tailwind config).
- Each location has its own badge color (see the location color map in the spec).
- Mobile-first; every layout must work at 375px. No full page reloads after
  actions — use optimistic UI or `router.refresh()`.
