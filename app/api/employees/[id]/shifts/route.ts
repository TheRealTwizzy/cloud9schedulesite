import { NextResponse } from "next/server";
import { getLocations, getSchedule, getUserById, saveSchedule } from "@/lib/db";
import { getSession } from "@/lib/session";
import { templateWeekAnchor } from "@/lib/recurrence";
import type { Shift } from "@/lib/types";
import { DAYS, toISODate, weekDatesFromISO } from "@/lib/week";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function requireOwner() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  if (session.role !== "owner") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
}

// The seven dates of the canonical template week (falls back to the current
// week when there are no shifts yet to anchor to).
function templateWeek(): string[] {
  const anchor = templateWeekAnchor(getSchedule()) ?? toISODate(new Date());
  return weekDatesFromISO(anchor);
}

// An employee's recurring pattern shifts (concrete template-week records with
// real ids). Filtered by the *recurring owner* so a covered shift shows under
// the original owner, not the temporary coverer.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const week = new Set(templateWeek());
  const shifts = getSchedule().filter(
    (s) => week.has(s.date) && (s.originalEmployeeId ?? s.employeeId) === params.id
  );
  return NextResponse.json({ shifts });
}

// Add a shift to an employee's recurring pattern. It is written into the
// template week so it repeats in every materialized week.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const employee = getUserById(params.id);
  if (!employee || employee.role !== "employee") {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { dayOfWeek, startTime, endTime, location } = body as Record<string, string>;
  const crossesMidnight = Boolean(body.crossesMidnight);
  const endsNextDay = Boolean(body.endsNextDay);

  const dayIndex = DAYS.indexOf(dayOfWeek as (typeof DAYS)[number]);
  if (dayIndex === -1) {
    return NextResponse.json({ error: "Invalid day of week." }, { status: 400 });
  }
  if (!TIME_RE.test(startTime ?? "") || !TIME_RE.test(endTime ?? "")) {
    return NextResponse.json({ error: "Times must be 24h HH:MM." }, { status: 400 });
  }
  if (!getLocations().some((l) => l.name === location)) {
    return NextResponse.json({ error: "Unknown location." }, { status: 400 });
  }

  const date = templateWeek()[dayIndex];
  const shift: Shift = {
    id: `shf_${crypto.randomUUID().slice(0, 8)}`,
    employeeId: employee.id,
    date,
    dayOfWeek,
    startTime,
    endTime,
    location,
    crossesMidnight,
    endsNextDay,
  };

  const schedule = getSchedule();
  schedule.push(shift);
  saveSchedule(schedule);

  return NextResponse.json({ shift }, { status: 201 });
}
