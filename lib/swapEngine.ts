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

// Store (sales-floor) locations, as opposed to security/warehouse posts.
const NON_STORE = new Set(["Security", "Overnight Security", "Warehouse"]);
function isStore(location: string): boolean {
  return !NON_STORE.has(location);
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
      u.active !== false &&
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
      securityStore: cand.group === "security" && isStore(target.location),
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
      if (c.role !== "employee" || c.active === false || c.group === "overnight")
        continue;
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
        securityStore: b.group === "security" && isStore(target.location),
      });
    }
  }

  // --- Ranking -------------------------------------------------------------
  // 1. fewest hops  2. primary-location match  3. fewest location changes
  // 4. alphabetical by first chain member.
  suggestions.sort((a, b) => {
    if (a.hops !== b.hops) return a.hops - b.hops;
    // Security covering a store ranks below every non-security option — this is
    // a hard rule, so it must outrank the primary-location/location-change
    // tie-breaks (a security employee can have a store in primaryLocations).
    if (a.securityStore !== b.securityStore) return a.securityStore ? 1 : -1;
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

// An employee who can ever appear in a chain: an active employee, not
// overnight, not the requester.
function isEligibleCoverer(user: User, requesterId: string): boolean {
  return (
    user.id !== requesterId &&
    user.role === "employee" &&
    user.active !== false &&
    user.group !== ("overnight" as Group)
  );
}

type PersonOption = {
  employeeId: string;
  employeeName: string;
  primaryLocations: string[];
};

export type CoverageOptions = {
  // Employees who can directly cover the target (free at that time).
  direct: PersonOption[];
  // Employees who can cover the target but are busy with one conflicting shift,
  // along with who could take that shift to free them (a valid relay).
  relays: Array<
    PersonOption & {
      conflictShift: {
        id: string;
        location: string;
        date: string;
        startTime: string;
        endTime: string;
      };
      coverers: PersonOption[];
    }
  >;
  message?: string;
};

function toOption(u: User): PersonOption {
  return {
    employeeId: u.id,
    employeeName: u.displayName,
    primaryLocations: u.primaryLocations ?? [],
  };
}

// Enumerate the valid manual-mode choices for a target shift. Mirrors the
// engine's eligibility rules so the UI only ever offers buildable chains.
export function coverageOptions({
  targetShiftId,
  users,
  schedule,
  config,
}: SuggestArgs): CoverageOptions {
  const target = schedule.find((s) => s.id === targetShiftId);
  if (!target) return { direct: [], relays: [], message: "Shift not found." };

  const requester = users.find((u) => u.id === target.employeeId);
  if (!requester) return { direct: [], relays: [], message: "Requester not found." };
  if (requester.group === ("overnight" as Group)) {
    return { direct: [], relays: [], message: "Overnight shifts cannot be swapped." };
  }

  const targetInterval = toInterval(target);
  const able = users.filter(
    (u) =>
      isEligibleCoverer(u, requester.id) &&
      canCoverLocation(u, target.location, config)
  );

  const direct: PersonOption[] = [];
  const relays: CoverageOptions["relays"] = [];

  for (const cand of able) {
    const conflicts = schedule.filter(
      (s) =>
        s.employeeId === cand.id &&
        s.id !== target.id &&
        overlaps(toInterval(s), targetInterval)
    );

    if (conflicts.length === 0) {
      direct.push(toOption(cand));
      continue;
    }
    // Only a single conflicting shift can be relayed within the 2-hop cap.
    if (conflicts.length > 1) continue;

    const conflict = conflicts[0];
    const conflictInterval = toInterval(conflict);
    const coverers = users
      .filter(
        (c) =>
          isEligibleCoverer(c, requester.id) &&
          c.id !== cand.id &&
          canCoverLocation(c, conflict.location, config) &&
          !isDoubleBooked(c, conflict, schedule, conflictInterval, new Set([target.id]))
      )
      .map(toOption);

    if (coverers.length === 0) continue;

    relays.push({
      ...toOption(cand),
      conflictShift: {
        id: conflict.id,
        location: conflict.location,
        date: conflict.date,
        startTime: conflict.startTime,
        endTime: conflict.endTime,
      },
      coverers,
    });
  }

  return { direct, relays };
}

export type ManualLink = {
  employeeId: string;
  coversShiftId: string;
  originalShiftId?: string;
};

// Validate a manually-built (or suggestion-derived) chain against the same
// rules the engine uses. Returns the first rule it violates, if any.
export function validateChain({
  targetShiftId,
  chain,
  users,
  schedule,
  config,
}: {
  targetShiftId: string;
  chain: ManualLink[];
  users: User[];
  schedule: Shift[];
  config: SwapConfig;
}): { valid: boolean; error?: string } {
  const target = schedule.find((s) => s.id === targetShiftId);
  if (!target) return { valid: false, error: "Target shift not found." };

  const requester = users.find((u) => u.id === target.employeeId);
  if (!requester) return { valid: false, error: "Requester not found." };
  if (requester.group === ("overnight" as Group)) {
    return { valid: false, error: "Overnight shifts cannot be swapped." };
  }

  if (chain.length < 1 || chain.length > config.maxChainLength) {
    return { valid: false, error: "A chain must be 1 or 2 links." };
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  const targetInterval = toInterval(target);
  const isRelay = chain.length === 2;

  // --- Link 0: covers the requested shift ----------------------------------
  const a = chain[0];
  if (a.coversShiftId !== target.id) {
    return { valid: false, error: "The first link must cover the requested shift." };
  }
  const empA = byId.get(a.employeeId);
  if (!empA || !isEligibleCoverer(empA, requester.id)) {
    return { valid: false, error: "That employee can't cover this shift." };
  }
  if (!canCoverLocation(empA, target.location, config)) {
    return { valid: false, error: `${empA.displayName} can't cover ${target.location}.` };
  }

  // In a relay, A's own conflicting shift is reassigned to B, so ignore it.
  const ignoreForA = new Set<string>();
  if (isRelay && a.originalShiftId) ignoreForA.add(a.originalShiftId);
  if (isDoubleBooked(empA, target, schedule, targetInterval, ignoreForA)) {
    return { valid: false, error: `${empA.displayName} is already working then.` };
  }

  if (!isRelay) return { valid: true };

  // --- Link 1: covers A's freed shift --------------------------------------
  const b = chain[1];
  const aShift = schedule.find((s) => s.id === a.originalShiftId);
  if (!aShift || aShift.employeeId !== empA.id) {
    return { valid: false, error: "Invalid relay: that isn't the coverer's shift." };
  }
  if (b.coversShiftId !== aShift.id) {
    return { valid: false, error: "The second link must cover the first coverer's shift." };
  }
  const empB = byId.get(b.employeeId);
  if (!empB || !isEligibleCoverer(empB, requester.id) || empB.id === empA.id) {
    return { valid: false, error: "Invalid second coverer." };
  }
  if (!canCoverLocation(empB, aShift.location, config)) {
    return { valid: false, error: `${empB.displayName} can't cover ${aShift.location}.` };
  }
  if (isDoubleBooked(empB, aShift, schedule, toInterval(aShift), new Set([target.id]))) {
    return { valid: false, error: `${empB.displayName} is already working then.` };
  }

  return { valid: true };
}
