# Cloud 9 — Employee Scheduling & Shift Management Web App
## Build Prompt for Claude Code (Opus 4.8, Max Effort)

---

## PROJECT OVERVIEW

Build a **fully local, self-contained Next.js 14 web application** for Cloud 9, a multi-location entertainment business. The app handles employee schedule viewing, time-off requests, and multi-party shift swap requests with a chain-recommendation engine. Everything — auth, data, logic — lives entirely within the project directory. No external services, no cloud database, no email, no OAuth.

---

## TECH STACK

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS (mobile-first, responsive)
- **Auth:** `iron-session` (encrypted cookie sessions, no JWT library needed)
- **Password hashing:** `bcryptjs`
- **Data layer:** JSON files in `/data/` (read/write via Node.js `fs` in API routes only)
- **No:** Prisma, database of any kind, email services, OAuth, external APIs, or any runtime dependency that requires a network connection

---

## DATA FILES

The `/data/` directory ships with five pre-populated JSON files. **Do not modify their structure** — the app reads and writes to these exact shapes.

### `/data/users.json`
```ts
type User = {
  id: string                  // e.g. "usr_quince"
  username: string            // lowercase, no spaces
  displayName: string         // e.g. "Alizé"
  role: "owner" | "employee"
  group: "owner" | "general" | "security" | "warehouse" | "overnight"
  primaryLocations: string[]  // where they normally work
  mustSetPassword: boolean    // true = intercept on first login
  hashedPassword: string | null
  note?: string               // informational only
}
```

### `/data/schedule.json`
```ts
type Shift = {
  id: string              // e.g. "shf_001"
  employeeId: string      // references users.json id
  date: string            // ISO 8601: "2026-06-28"
  dayOfWeek: string       // "Sun" | "Mon" | ... | "Sat"
  startTime: string       // 24h "HH:MM"
  endTime: string         // 24h "HH:MM"
  location: string        // "Cloud 9" | "Noc9" | "Spearfish" | "Black Hawk" | "Warehouse" | "Security" | "Overnight Security"
  crossesMidnight: boolean
  endsNextDay: boolean
}
```

### `/data/locations.json`
```ts
type Location = {
  id: string
  name: string
  color: string           // hex brand color for UI
  hours: Record<string, { open: string; close: string } | null> | string
}
```

### `/data/swap_config.json`
Contains BFS chain engine rules, group permissions, and approval flow description. Read-only — do not write to this file at runtime.

### `/data/requests.json`
```ts
type SwapRequest = {
  id: string
  type: "time-off" | "shift-swap"
  requesterId: string
  submittedAt: string           // ISO timestamp
  targetShiftId: string         // the shift being vacated
  note?: string                 // requester's optional explanation

  // Proposed coverage chain — ordered list of handoffs
  proposedChain: Array<{
    employeeId: string          // who is covering
    coversShiftId: string       // which shift they're taking
    originalShiftId?: string    // their own shift being vacated (if relay)
    status: "pending" | "accepted" | "declined"
    respondedAt?: string
  }>

  // Aggregated status
  overallStatus: "pending_employee_approval" | "pending_owner_approval" | "approved" | "declined" | "cancelled"
  ownerNote?: string
  resolvedAt?: string
}
```

---

## EMPLOYEE GROUPS & SWAP ENGINE RULES

These rules are **hard constraints** for the chain recommendation engine:

| Group | Who | Swap Pool | Can Cover Locations |
|---|---|---|---|
| `overnight` | James | ❌ Excluded entirely | None — never in swap suggestions |
| `warehouse` | Nate, Jessie, Julia | Warehouse only | Warehouse only |
| `security` | Kaiden, Hunter | Security first, general as last resort | Security, Overnight Security, and all store locations (low priority) |
| `general` | Everyone else | Any store/security employee | Cloud 9, Noc9, Spearfish, Black Hawk, Security (last resort) |

**Additional context:**
- Bethany regularly works Spearfish, Noc9, and Black Hawk (3 locations)
- Quince regularly works Cloud 9 and Black Hawk (2 locations)
- Employees from any group *can* physically work a different store location — many are willing but less eager. The engine should weight `primaryLocations` match highly but not exclude cross-location coverage
- Kaiden and Hunter *can* work sales floor but should appear last in suggestions for store shifts

---

## CHAIN RECOMMENDATION ENGINE

This is the core algorithmic feature. Implement it as a pure server-side function in `/lib/swapEngine.ts`.

### Goal
When an employee requests time off or a swap, automatically find the simplest valid coverage arrangement and return ranked suggestions.

### Algorithm: BFS capped at 2 hops

```
Hop 0 — Direct cover:
  Find employees who:
    - Are in a compatible group (per rules above)
    - Are NOT already scheduled on the target date
    - Are not the requester
  → Each valid employee = a 1-person chain suggestion

Hop 1 — One relay:
  For each candidate B who *is* scheduled that day:
    Find employees C who:
      - Can cover B's shift (compatible group, not double-booked)
      - Are not the requester
      - Are not B
    If C exists → [B covers requester's shift, C covers B's shift] = 2-person chain

MAX CHAIN LENGTH: 2 hops. Never search deeper. If no solution found
within 2 hops, return empty suggestions with a "no simple coverage
available" message — do not attempt further search.
```

### Ranking (sort order, highest priority first)
1. Fewest hops (direct cover beats relay)
2. Primary location match (employee's `primaryLocations` includes the shift's location)
3. Fewest location changes across the chain
4. Alphabetical by first employee in chain (tiebreaker)

### Return: up to 3 ranked suggestions

### Edge cases to handle
- Employee requesting time off for an overnight shift (crossesMidnight=true): the date is the START date of the shift
- Warehouse requests only search within the warehouse group
- James (overnight group) is never a suggested coverer AND his shifts cannot be the target of a swap initiated by someone else
- Double-booking check: an employee cannot be in two places at the same time — check for time overlap, not just date match
- An employee already in a pending unresolved chain should be flagged (but not hard-excluded — owner can still see and decide)

---

## AUTHENTICATION & SESSION

### Flow
1. `/login` — username input + password input
2. On submit: look up user in `users.json` by username
3. If `mustSetPassword === true`: redirect to `/set-password` **without** validating password (the stored hash is null)
4. If `mustSetPassword === false`: compare submitted password with `bcryptjs.compare()`. On success, write session. On fail, show error.
5. `/set-password` — only accessible when session contains `{ mustSetPassword: true }`. User sets new password (confirm field required, min 8 chars). On save: hash with bcrypt rounds=12, write back to `users.json`, set `mustSetPassword: false`, update session to full authenticated state, redirect to `/dashboard`

### Session shape (iron-session)
```ts
type SessionData = {
  userId: string
  username: string
  displayName: string
  role: "owner" | "employee"
  group: string
  mustSetPassword: boolean
}
```

### Route protection
- All routes except `/login` and `/set-password` require a valid session
- `/owner` route: redirect to `/dashboard` if `role !== "owner"`
- `/set-password`: redirect to `/login` if no session at all; redirect to `/dashboard` if session exists and `mustSetPassword === false`

---

## PAGES & FEATURES

### `/login`
- Cloud 9 logo centered at top
- Username and password fields
- "Sign In" button
- On `mustSetPassword`: redirect silently (no error shown)
- Clean, branded, mobile-centered card layout

### `/set-password`
- "Welcome, [displayName]. Please set your password to continue."
- New password + confirm password fields
- Password strength indicator (simple: length ≥ 8, has number, has special char)
- Submit → update `users.json` → redirect to `/dashboard`

### `/dashboard` (employee view)
**Week schedule panel:**
- Display the current week (Sun–Sat) as a horizontal card row on desktop, vertical list on mobile
- Each shift card shows: day, date, start–end time, location (with location brand color as left border or badge)
- OFF days shown as muted empty cards
- Location color coding matches the brand colors in `locations.json`

**My Requests panel:**
- List of the employee's submitted requests, each showing:
  - Type (Time Off / Shift Swap)
  - Target shift date + location
  - Current status with color-coded badge:
    - `pending_employee_approval` = "Awaiting Team" (yellow)
    - `pending_owner_approval` = "Awaiting Owner" (blue)
    - `approved` = "Approved" (green)
    - `declined` / `cancelled` = "Declined" (red)
  - If declined: show owner note if present
  - Cancel button (only if status is `pending_employee_approval`)

**Pending my response panel:**
- Show any chains where this employee is a non-requester participant and their status is `pending`
- Display: who requested it, what shift they'd need to cover, what their own shift impact is (if relay)
- Accept / Decline buttons
- Declining shows a confirmation modal

**Request buttons:**
- "Request Time Off" — opens modal to select one of their upcoming shifts
- "Request Shift Swap" — opens modal (see below)

**Shift Swap Request Modal:**
1. Step 1: Select which of your shifts you want covered (dropdown of upcoming shifts)
2. Step 2: App calls the swap engine API and displays up to 3 suggested chains
   - Each suggestion card shows the chain visually: "You → [Name] covers your shift" or "You → [Name A] covers your shift → [Name B] covers [Name A]'s shift"
   - Each person in the chain is shown with their name, the shift they're taking, and their primary location(s)
   - A "No simple coverage found" state if engine returns empty
3. Step 3: Employee selects a suggestion OR manually constructs a chain:
   - Manual mode: pick Employee A from a filtered dropdown (compatible, not double-booked), optionally pick Employee B to cover A
   - Manual chain is validated against the same engine rules before submission
4. Step 4: Confirm and submit — writes to `requests.json`, sets all chain members to `pending`

---

### `/owner` (owner-only dashboard)

**Tabs:** Pending Approval | All Requests | Employee Schedule

**Pending Approval tab:**
Each pending request card shows:
- Requester name, shift date, location, shift time
- Request type badge
- Submitted date/time
- Chain visualization (same visual as employee modal — show the full handoff chain)
- Per-chain-member status indicators (accepted ✓ / pending ⏳ / declined ✗)
- If `overallStatus === "pending_owner_approval"` (all employees accepted): show **Approve** (green) and **Deny** (red) buttons + optional note textarea
- If `overallStatus === "pending_employee_approval"`: show as "Awaiting employee responses" — owner can view but not act yet (or can force-cancel with note)

**On Owner Approve:**
- Set `overallStatus = "approved"`, write `resolvedAt`, write `ownerNote` if any
- Apply chain to `schedule.json`:
  - Set requester's shift `employeeId` to the first chain member's `employeeId`
  - If 2-hop: set that chain member's original shift `employeeId` to the second chain member
  - For time-off: mark the requester's shift with a special field `coveredBy` and `originalEmployeeId`, or simply reassign `employeeId`

**On Owner Deny:**
- Set `overallStatus = "declined"`, write `ownerNote` (required on deny), write `resolvedAt`
- Schedule is unchanged

**Employee Schedule tab:**
- Full read-only grid of all employees and the current week (similar layout to the PDF — 7 columns, one row per employee, location color-coded)
- Owner can click any shift to see details (employee name, times, location)

**All Requests tab:**
- Filterable table: filter by status, by employee, by date range
- Shows all historical requests

---

## FILE WRITE SAFETY

All writes to JSON files must be **atomic**:
```ts
import { writeFileSync } from 'fs'
import { join } from 'path'

// Always read → mutate → write in the same API route handler
// Use a try/catch around writeFileSync
// Write to the same path (no temp file needed for this scale)
const dataPath = join(process.cwd(), 'data', 'requests.json')
writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
```

All file reads and writes happen **only in API routes** (`/app/api/...`). Never import `fs` in client components or page components.

---

## API ROUTES

```
POST   /api/auth/login              — validate credentials, write session
POST   /api/auth/set-password       — hash + save new password, update session
POST   /api/auth/logout             — destroy session

GET    /api/schedule                — return current week's shifts (filtered to session user unless owner)
GET    /api/schedule/week           — return full week for all employees (owner only)

GET    /api/requests                — return requests relevant to session user
POST   /api/requests                — submit a new time-off or swap request
PATCH  /api/requests/[id]/respond   — employee accepts or declines their chain slot
PATCH  /api/requests/[id]/owner     — owner approves or denies (role check)
DELETE /api/requests/[id]           — requester cancels (only if pending_employee_approval)

POST   /api/swap/suggest            — run chain engine, return up to 3 suggestions
                                      body: { shiftId: string }
                                      response: { suggestions: ChainSuggestion[] }

GET    /api/users                   — owner only: return all users (no hashes)
```

---

## UI / DESIGN SYSTEM

**Brand colors (Tailwind custom config):**
```js
colors: {
  'c9-green':  '#6DB832',
  'c9-purple': '#7A2FA8',
}
```

**Location color map (for shift cards/badges):**
```
Cloud 9          → green   (#6DB832 bg, white text)
Noc9             → purple  (#7A2FA8 bg, white text)
Spearfish        → teal    (#0A5A58 bg, white text)
Black Hawk       → amber   (#6B4A05 bg, white text)
Warehouse        → blue    (#0F3D7A bg, white text)
Security         → red     (#8C1313 bg, white text)
Overnight Sec.   → dark red(#5A0808 bg, white text)
```

**General UI rules:**
- White / light gray (`#F5F5F5`) background throughout
- `Helvetica Neue` / system-ui font stack
- Mobile-first: all layouts must work on a 375px screen
- Modals use a dark overlay, centered card, trap focus
- Loading states on all async actions (spinner or skeleton)
- Error states displayed inline, never just console.log
- No page reloads after actions — use optimistic UI or revalidate via router.refresh()
- Toast notifications for: request submitted, response saved, owner decision applied

---

## PROJECT STRUCTURE

```
/
├── app/
│   ├── login/page.tsx
│   ├── set-password/page.tsx
│   ├── dashboard/page.tsx
│   ├── owner/page.tsx
│   └── api/
│       ├── auth/login/route.ts
│       ├── auth/set-password/route.ts
│       ├── auth/logout/route.ts
│       ├── schedule/route.ts
│       ├── schedule/week/route.ts
│       ├── requests/route.ts
│       ├── requests/[id]/respond/route.ts
│       ├── requests/[id]/owner/route.ts
│       ├── swap/suggest/route.ts
│       └── users/route.ts
├── components/
│   ├── ShiftCard.tsx
│   ├── ChainVisualizer.tsx
│   ├── RequestCard.tsx
│   ├── SwapRequestModal.tsx
│   ├── WeekGrid.tsx
│   └── Toast.tsx
├── lib/
│   ├── swapEngine.ts      ← BFS chain recommendation logic
│   ├── db.ts              ← all JSON read/write helpers
│   ├── session.ts         ← iron-session config
│   └── types.ts           ← shared TypeScript types
├── data/
│   ├── users.json
│   ├── schedule.json
│   ├── locations.json
│   ├── swap_config.json
│   └── requests.json
├── public/
│   └── cloud9-logo.png    ← add the Cloud 9 logo here
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## PACKAGE.JSON DEPENDENCIES

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "iron-session": "^8.0.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.0.0"
  }
}
```

---

## CRITICAL BEHAVIORS & EDGE CASES

1. **Concurrent writes:** Two employees could submit requests simultaneously. Implement a simple read-lock pattern: read the file, mutate in memory, write back. At this scale (< 25 employees) this is acceptable.

2. **Week display:** The app should always show the week that contains today's date. The `/data/schedule.json` is seeded for Jun 28–Jul 4 2026. Build the week calculation dynamically so it works for any current date, and gracefully shows "No shifts scheduled this week" if the data doesn't include the current week.

3. **Password on first login:** The login form should NOT show an error when a `mustSetPassword` user enters any password (or leaves it blank). Just redirect them. The UX should feel like "welcome, let's get you set up" not "wrong password."

4. **Chain cancellation:** If Employee B declines their part of a chain, the entire request status becomes `cancelled`. Notify the requester (via their dashboard status badge — no email). Employee B's shift is untouched.

5. **Overnight shifts:** James works 11PM–7AM. His shifts have `crossesMidnight: true`. His group is `overnight` — he must NEVER appear as a suggestion in the swap engine, and no one should be able to initiate a swap request targeting his shift (disable the request button for his shifts on the owner's employee schedule view).

6. **Owner's own schedule:** The owner has 0 shifts. Their dashboard goes straight to the owner panel. The `/dashboard` route should detect `role === "owner"` and redirect to `/owner`.

7. **Request ID generation:** Use `crypto.randomUUID()` (available in Node 18+ without import) for new request IDs.

8. **Session secret:** Use a hardcoded 32-char string in `lib/session.ts` for `iron-session`'s password. Note in a comment that this should be moved to an env variable in production.

---

## DELIVERABLE

A working Next.js application that:
- Runs with `npm install && npm run dev`
- All 22 user accounts can log in and set their passwords
- Employees see their week schedule and can submit time-off/swap requests
- The swap engine returns valid, ranked chain suggestions within the 2-hop cap
- Multi-party approval flows correctly through employees → owner → schedule update
- Owner can view, approve, and deny all requests with full chain visibility
- All data persists in the `/data/` JSON files between server restarts
- Works on mobile (375px+) and desktop
