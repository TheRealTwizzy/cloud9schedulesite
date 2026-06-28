import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/db";
import { getSession } from "@/lib/session";

// Current user's shifts (owner sees all). The client filters to the visible
// week; we return everything for the user so week navigation works offline.
export async function GET() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const all = getSchedule();
  const shifts =
    session.role === "owner"
      ? all
      : all.filter((s) => s.employeeId === session.userId);

  return NextResponse.json({ shifts });
}
