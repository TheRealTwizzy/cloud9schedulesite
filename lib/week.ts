// Client-safe date/week helpers. No fs imports — usable from any component.

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ISO date string (YYYY-MM-DD) for a Date, in local time.
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The Sunday that starts the week containing `ref` (defaults to today).
export function startOfWeek(ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// The seven ISO dates (Sun..Sat) for the week containing `ref`.
export function weekDates(ref: Date = new Date()): string[] {
  const start = startOfWeek(ref);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISODate(d);
  });
}

// The seven ISO dates for the week containing the given ISO date.
export function weekDatesFromISO(iso: string): string[] {
  return weekDates(new Date(`${iso}T00:00:00`));
}

// Shift the week containing `ref` by `weeks` (negative = past), returning the
// new week's Sunday as an ISO date.
export function shiftWeek(ref: Date, weeks: number): string {
  const start = startOfWeek(ref);
  start.setDate(start.getDate() + weeks * 7);
  return toISODate(start);
}

// "Jun 28 – Jul 4, 2026" label for a week given its seven dates.
export function weekLabel(dates: string[]): string {
  const fmt = (iso: string, withYear = false) => {
    const d = new Date(`${iso}T00:00:00`);
    const month = d.toLocaleString("en-US", { month: "short" });
    return withYear
      ? `${month} ${d.getDate()}, ${d.getFullYear()}`
      : `${month} ${d.getDate()}`;
  };
  return `${fmt(dates[0])} – ${fmt(dates[6], true)}`;
}

// "8:00 AM" from "08:00".
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}
