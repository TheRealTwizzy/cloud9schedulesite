import { NextResponse } from "next/server";
import { getLocations, getSchedule, getUserById, saveSchedule } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { Shift } from "@/lib/types";
import { DAYS, weekDates } from "@/lib/week";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Add a shift to an employee's current-week schedule. Because the current week
// is the recurring template, the shift also repeats in future weeks.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

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

  const date = weekDates()[dayIndex];
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
