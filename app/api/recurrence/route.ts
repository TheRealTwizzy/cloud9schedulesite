import { NextResponse } from "next/server";
import { getRecurrence, getUserById, saveRecurrence } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { EmployeeRecurrence } from "@/lib/types";

// Owner-only: read and update per-employee recurrence settings.
export async function GET() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return NextResponse.json({ recurrence: getRecurrence() });
}

// Set one employee's recurrence: permanent, or temporary with an expiration.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { employeeId, permanent, expiresOn } = await req.json().catch(() => ({}));
  if (!employeeId || !getUserById(String(employeeId))) {
    return NextResponse.json({ error: "Unknown employee." }, { status: 400 });
  }
  if (typeof permanent !== "boolean") {
    return NextResponse.json(
      { error: "`permanent` must be true or false." },
      { status: 400 }
    );
  }
  if (!permanent) {
    const ok =
      typeof expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn);
    if (!ok) {
      return NextResponse.json(
        { error: "A temporary schedule needs an expiration date (YYYY-MM-DD)." },
        { status: 400 }
      );
    }
  }

  const entry: EmployeeRecurrence = permanent
    ? { permanent: true }
    : { permanent: false, expiresOn: String(expiresOn) };

  const map = getRecurrence();
  map[String(employeeId)] = entry;
  saveRecurrence(map);

  return NextResponse.json({ recurrence: map });
}
