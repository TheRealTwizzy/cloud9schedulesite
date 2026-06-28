// Recurring-schedule materialization.
//
// The seeded week in schedule.json is treated as each employee's canonical
// weekly pattern. For any week that has no concrete shifts of its own, we
// materialize that pattern onto the week's dates — subject to each employee's
// recurrence settings (permanent, or temporary with an expiration date).
//
// Pure module: callers pass in the data. No I/O, so it is unit-testable.

import type { RecurrenceMap, Shift } from "./types";

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Whether an employee's recurring shift should appear on a specific date.
// A missing entry, or a permanent one, always recurs. A temporary entry recurs
// only on dates up to and including its expiration.
export function recursOn(
  recurrence: RecurrenceMap,
  employeeId: string,
  dateISO: string
): boolean {
  const entry = recurrence[employeeId];
  if (!entry || entry.permanent || !entry.expiresOn) return true;
  return dateISO <= entry.expiresOn;
}

// Materialize a target week from the weekly `template` (the seeded week's
// shifts), mapping each template shift onto the matching day in `weekDates`.
export function materializeWeek(
  template: Shift[],
  weekDates: string[],
  recurrence: RecurrenceMap
): Shift[] {
  const out: Shift[] = [];
  for (const t of template) {
    const idx = DAY_INDEX[t.dayOfWeek];
    if (idx === undefined) continue;
    const date = weekDates[idx];
    if (!recursOn(recurrence, t.employeeId, date)) continue;
    out.push({ ...t, id: `${t.id}@${date}`, date, recurring: true });
  }
  return out;
}

// Resolve the shifts shown for a week: concrete records win when the week has
// any of its own; otherwise the week is materialized from the template.
export function shiftsForWeek(
  concrete: Shift[],
  template: Shift[],
  weekDates: string[],
  recurrence: RecurrenceMap
): Shift[] {
  const weekSet = new Set(weekDates);
  const concreteForWeek = concrete.filter((s) => weekSet.has(s.date));
  if (concreteForWeek.length > 0) return concreteForWeek;
  return materializeWeek(template, weekDates, recurrence);
}
