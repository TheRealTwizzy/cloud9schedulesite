import { NextResponse } from "next/server";
import { getSchedule, getUsers } from "@/lib/db";
import { getSession } from "@/lib/session";

// Owner-only: the full schedule for all employees, plus the employee roster so
// the grid can label rows.
export async function GET() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const shifts = getSchedule();
  const employees = getUsers()
    .filter((u) => u.role === "employee")
    .map(({ hashedPassword, ...rest }) => rest);

  return NextResponse.json({ shifts, employees });
}
