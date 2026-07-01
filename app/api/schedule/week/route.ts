import { NextResponse } from "next/server";
import { getRecurrence, getSchedule, getUsers } from "@/lib/db";
import { getSession } from "@/lib/session";
import { shiftsForWeek } from "@/lib/recurrence";
import { weekDates, weekDatesFromISO } from "@/lib/week";

// Shifts for a week, with recurring weeks materialized from the seeded pattern.
// Owners get every employee's shifts plus the roster; employees get their own.
// Pass ?weekStart=YYYY-MM-DD to view other weeks (defaults to the current week).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const weekStart = new URL(req.url).searchParams.get("weekStart");
  const dates = weekStart ? weekDatesFromISO(weekStart) : weekDates();

  const concrete = getSchedule();
  // The seeded week is the canonical weekly pattern, but deactivated employees
  // should not recur into future weeks — filter them out of the template (by a
  // shift's original owner, since coverage may have reassigned employeeId).
  const activeIds = new Set(
    getUsers().filter((u) => u.active !== false).map((u) => u.id)
  );
  const template = concrete.filter((s) =>
    activeIds.has(s.originalEmployeeId ?? s.employeeId)
  );
  const weekShifts = shiftsForWeek(concrete, template, dates, getRecurrence());

  if (session.role === "owner") {
    const employees = getUsers()
      .filter((u) => u.role === "employee")
      .map(({ hashedPassword, ...rest }) => rest);
    return NextResponse.json({ shifts: weekShifts, employees, week: dates });
  }

  const shifts = weekShifts.filter((s) => s.employeeId === session.userId);
  return NextResponse.json({ shifts, week: dates });
}
