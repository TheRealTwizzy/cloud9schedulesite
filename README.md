# Cloud 9 — Employee Scheduling & Shift Management

A fully local, self-contained Next.js 14 app for Cloud 9, a multi-location
entertainment business. It handles schedule viewing, time-off requests, and
multi-party shift swaps with a chain-recommendation engine. There is **no
database and no external services** — auth, data, and logic all live in the
project directory, and the JSON files in `data/` are the database.

## Requirements

- Node.js 18.17+ (Node 20 recommended)
- npm

## Running the app

```bash
git clone https://github.com/TheRealTwizzy/cloud9schedulesite.git
cd cloud9schedulesite
npm install
npm run dev
```

Then open **http://localhost:3000**.

For a production-style build instead of dev mode:

```bash
npm run build
npm start          # also serves on http://localhost:3000
```

> The app runs on your own machine. There is no hosted URL — it is designed to
> run locally with zero network dependencies.

## Logging in

Usernames come from `data/users.json` (all lowercase) — for example `owner`,
`quince`, `alicia`, `bethany`, `kaiden`, `james`, `nate`.

Every account ships with **no password set** (`mustSetPassword: true`,
`hashedPassword: null`):

1. Enter a username and **any** password (or leave it blank) on the login page.
2. You are sent straight to a "set your password" screen — no error is shown.
3. The password you choose there is bcrypt-hashed, saved back into
   `users.json`, and used for every login after that.

Sign in as **`owner`** for the owner console (approvals, all requests, and the
full employee week grid). Any other username opens the employee dashboard.

## Accounts, roles, and groups

- **owner** — sees the owner console; has no shifts of their own.
- **employees** — see their own week and can submit time-off / swap requests.

Employees belong to a `group` that governs swap eligibility: `general`,
`security`, `warehouse`, and `overnight` (James, who is excluded from swaps
entirely). See `CLAUDE_CODE_PROMPT.md` for the full rules.

## Data and persistence

The files in `data/` are read and written at runtime by the API routes:

- `users.json` — accounts (and the passwords you set).
- `schedule.json` — shifts.
- `locations.json` — locations and brand colors.
- `swap_config.json` — swap-engine rules (read-only at runtime).
- `requests.json` — submitted time-off and swap requests.
- `recurrence.json` — per-employee recurring-schedule settings.

Anything you do in the app — setting a password, submitting a request, an owner
approving a swap — is written to these files and **persists across restarts**.

To reset an account's password, set its `hashedPassword` back to `null` and
`mustSetPassword` back to `true` in `data/users.json`.

## The seeded schedule

`schedule.json` is seeded for the week of **June 28 – July 4, 2026**, which is
the current week for this project, so you will see live shifts on first run.

## Recurring schedules

The seeded week acts as each employee's **weekly pattern**. Any week that has no
concrete shifts of its own is materialized from that pattern, so future weeks
show the same schedule automatically. Use the **← Prev / Next →** controls on
the dashboard and the owner's Employee Schedule tab to move between weeks.

In the owner console's **Employee Schedule** tab, each employee has a
**Permanent / Temporary** setting:

- **Permanent** (the default) — their pattern repeats indefinitely.
- **Temporary** — pick an expiration date; their shifts stop recurring after it.

These settings live in `data/recurrence.json`. The seeded week itself is concrete
data and is unaffected by expiration; only materialized future weeks honor it.

## Tests

```bash
npm test     # runs the swap-engine and recurrence unit tests (offline)
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) runs lint, tests, and build on every pull
request to `main`.

## Employee management

The owner console's **Employees** tab lets the owner:

- **Add** an employee (display name, username, group, primary locations). New
  hires set their own password on first login, like the seeded accounts.
- **Edit** an employee's display name, group, and primary locations.
- **Deactivate / reactivate** an employee — inactive staff are excluded from the
  swap engine and from future recurring weeks, but their record and history stay.
- **Delete** an employee permanently, which also removes their shifts and
  recurrence entry.
- **Assign weekly shifts** — add or remove shifts (day, time, location) for the
  current week; because the current week is the recurring template, they become
  that employee's repeating pattern.

## Current limitations

The following are intentionally **not** implemented yet (no admin UI exists):

- **No location or organization management** — the locations in `locations.json`
  and the single Cloud 9 organization are fixed in the data files.
- **Swaps target concrete shifts** — recurring (materialized) shifts in future
  weeks don't have their own records, so swap/time-off requests are made against
  the current concrete week.

## Notes

- The `iron-session` secret is hardcoded in `lib/session.ts` to keep the app
  runnable with zero setup. Move it to an environment variable for any real
  deployment.
