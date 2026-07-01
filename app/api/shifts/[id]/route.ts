import { NextResponse } from "next/server";
import { getSchedule, saveSchedule } from "@/lib/db";
import { getSession } from "@/lib/session";

// Owner removes a concrete shift from the schedule.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const schedule = getSchedule();
  if (!schedule.some((s) => s.id === params.id)) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }
  saveSchedule(schedule.filter((s) => s.id !== params.id));
  return NextResponse.json({ deleted: params.id });
}
