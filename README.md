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

Anything you do in the app — setting a password, submitting a request, an owner
approving a swap — is written to these files and **persists across restarts**.

To reset an account's password, set its `hashedPassword` back to `null` and
`mustSetPassword` back to `true` in `data/users.json`.

## The seeded schedule

`schedule.json` is seeded for the week of **June 28 – July 4, 2026**, which is
the current week for this project, so you will see live shifts on first run.

The schedule is a flat list of dated shift records — it is **not** recurring.
Weeks outside the seeded range render "No shifts scheduled this week." (See
[Limitations](#current-limitations).)

## Tests

```bash
npm test     # runs the swap-engine unit tests (offline)
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) runs lint, tests, and build on every pull
request to `main`.

## Current limitations

The app is built around the seeded data set. The following are intentionally
**not** implemented yet (no admin UI exists for them):

- **No recurring schedules** — only the one seeded week has shifts; future weeks
  are empty unless shift records are added for those dates.
- **No employee/location/organization management** — the roster in `users.json`,
  the locations in `locations.json`, and the single Cloud 9 organization are all
  fixed in the data files; the owner console can review and approve requests but
  cannot add employees, locations, or organizations.

## Notes

- The `iron-session` secret is hardcoded in `lib/session.ts` to keep the app
  runnable with zero setup. Move it to an environment variable for any real
  deployment.
