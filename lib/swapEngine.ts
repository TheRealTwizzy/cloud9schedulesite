// Chain recommendation engine.
//
// Pure, server-side BFS that finds the simplest valid coverage arrangement for
// a shift that an employee wants vacated. Capped at 2 hops (direct cover or a
// single relay). Returns up to `maxSuggestions` ranked suggestions.
//
// This module is pure: callers pass in the data it needs. It performs no I/O so
// it can be unit-tested in isolation.

import type {
  ChainSuggestion,
  Group,
  Shift,
  SwapConfig,
  User,
} from "./types";

type Interval = { start: number; end: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// Absolute [start, end) interval for a shift, rolling the end past midnight when
// the shift crosses into the next day.
function toInterval(shift: Shift): Interval {
  const dayMs = Date.parse(`${shift.date}T00:00:00Z`);
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const start = dayMs + startMin * 60_000;
  const rollsOver =
    shift.endsNextDay || shift.crossesMidnight || endMin <= startMin;
  const end = dayMs + endMin * 60_000 + (rollsOver ? DAY_MS : 0);
  return { start, end };
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

// Does `user`'s group permit covering a shift at `location`?
function canCoverLocation(
  user: User,
  location: string,
  config: SwapConfig
): boolean {
  const rule = config.groupRules[user.group];
  if (!rule) return false;
  return rule.canCoverLocations.includes(location);
}

// Is `user` already working something that overlaps `target`'s time? The target
// shift itself (and any shift listed in `ignoreShiftIds`, e.g. a shift being
// reassigned earlier in the chain) is excluded from the check.
function isDoubleBooked(
  user: User,
  target: Shift,
  schedule: Shift[],
  targetInterval: Interval,
  ignoreShiftIds: Set<string>
): boolean {
  return schedule.some((s) => {
    if (s.employeeId !== user.id) return false;
    if (s.id === target.id || ignoreShiftIds.has(s.id)) return false;
    return overlaps(toInterval(s), targetInterval);
  });
}

function primaryIncludes(user: User, location: string): boolean {
  return (user.primaryLocations ?? []).includes(location);
}

export type SuggestArgs = {
  targetShiftId: string;
  users: User[];
  schedule: Shift[];
  config: SwapConfig;
};

export type SuggestResult = {
  suggestions: ChainSuggestion[];
  message?: string;
};

export function suggestChains({
  targetShiftId,
  users,
  schedule,
  config,
}: SuggestArgs): SuggestResult {
  const target = schedule.find((s) => s.id === targetShiftId);
  if (!target) {
    return { suggestions: [], message: "Shift not found." };
  }

  const requester = users.find((u) => u.id === target.employeeId);
  if (!requester) {
    return { suggestions: [], message: "Requester not found." };
  }

  // The overnight group is excluded entirely — its shifts can't be the target of
  // a swap and its members are never suggested as coverers.
  if (requester.group === ("overnight" as Group)) {
    return {
      suggestions: [],
      message: "Overnight shifts cannot be swapped.",
    };
  }

  const targetInterval = toInterval(target);

  const candidates = users.filter(
    (u) =>
      u.id !== requester.id &&
      u.role === "employee" &&
      u.group !== "overnight" &&
      canCoverLocation(u, target.location, config)
  );

  const suggestions: ChainSuggestion[] = [];

  // --- Hop 0: direct cover -------------------------------------------------
  for (const cand of candidates) {
    const busy = isDoubleBooked(
      cand,
      target,
      schedule,
      targetInterval,
      new Set()
    );
    if (busy) continue;

    suggestions.push({
      hops: 1,
      links: [
        {
          employeeId: cand.id,
          employeeName: cand.displayName,
          primaryLocations: cand.primaryLocations ?? [],
          coversShiftId: target.id,
          coversLocation: target.location,
        },
      ],
      locationChanges: primaryIncludes(cand, target.location) ? 0 : 1,
      primaryMatch: primaryIncludes(cand, target.location),
    });
  }

  // --- Hop 1: one relay ----------------------------------------------------
  // B can cover the target's location but is busy with their own shift(s) that
  // overlap the target. Find C to take B's conflicting shift, freeing B.
  for (const b of candidates) {
    const bConflicts = schedule.filter(
      (s) =>
        s.employeeId === b.id &&
        s.id !== target.id &&
        overlaps(toInterval(s), targetInterval)
    );
    if (bConflicts.length === 0) continue; // not busy -> handled by hop 0

    // Only a single conflicting shift can be relayed within the 2-hop cap.
    if (bConflicts.length > 1) continue;
    const bShift = bConflicts[0];
    const bInterval = toInterval(bShift);

    for (const c of users) {
      if (c.id === requester.id || c.id === b.id) continue;
      if (c.role !== "employee" || c.group === "overnight") continue;
      if (!canCoverLocation(c, bShift.location, config)) continue;

      const cBusy = isDoubleBooked(
        c,
        bShift,
        schedule,
        bInterval,
        new Set([target.id])
      );
      if (cBusy) continue;

      const primaryMatch = primaryIncludes(b, target.location);
      const changes =
        (primaryIncludes(b, target.location) ? 0 : 1) +
        (primaryIncludes(c, bShift.location) ? 0 : 1);

      suggestions.push({
        hops: 2,
        links: [
          {
            employeeId: b.id,
            employeeName: b.displayName,
            primaryLocations: b.primaryLocations ?? [],
            coversShiftId: target.id,
            coversLocation: target.location,
            originalShiftId: bShift.id,
          },
          {
            employeeId: c.id,
            employeeName: c.displayName,
            primaryLocations: c.primaryLocations ?? [],
            coversShiftId: bShift.id,
            coversLocation: bShift.location,
          },
        ],
        locationChanges: changes,
        primaryMatch,
      });
    }
  }

  // --- Ranking -------------------------------------------------------------
  // 1. fewest hops  2. primary-location match  3. fewest location changes
  // 4. alphabetical by first chain member.
  suggestions.sort((a, b) => {
    if (a.hops !== b.hops) return a.hops - b.hops;
    if (a.primaryMatch !== b.primaryMatch) return a.primaryMatch ? -1 : 1;
    if (a.locationChanges !== b.locationChanges)
      return a.locationChanges - b.locationChanges;
    return a.links[0].employeeName.localeCompare(b.links[0].employeeName);
  });

  // De-duplicate by the chain's employee sequence (a direct cover and a relay
  // can never collide, but two relays through different paths might rank equal).
  const seen = new Set<string>();
  const unique = suggestions.filter((s) => {
    const key = s.links.map((l) => l.employeeId).join(">");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = unique.slice(0, config.maxSuggestions);

  if (top.length === 0) {
    return {
      suggestions: [],
      message: "No simple coverage available within 2 hops.",
    };
  }

  return { suggestions: top };
}
