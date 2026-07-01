import { NextResponse } from "next/server";
import {
  getLocations,
  getRecurrence,
  getSchedule,
  getUsers,
  saveRecurrence,
  saveSchedule,
  saveUsers,
} from "@/lib/db";
import { applyEmployeeUpdate } from "@/lib/employees";
import { getSession } from "@/lib/session";

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

// Edit an employee (name, group, primary locations) or toggle active state.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const users = getUsers();
  const idx = users.findIndex((u) => u.id === params.id);
  if (idx === -1) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (users[idx].role === "owner") {
    return NextResponse.json({ error: "The owner cannot be edited here." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const result = applyEmployeeUpdate(users[idx], body, getLocations());
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  users[idx] = result.user;
  saveUsers(users);

  const { hashedPassword, ...safe } = result.user;
  return NextResponse.json({ employee: safe });
}

// Permanently remove an employee, along with their shifts and recurrence entry.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const users = getUsers();
  const target = users.find((u) => u.id === params.id);
  if (!target) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "The owner cannot be deleted." }, { status: 400 });
  }

  saveUsers(users.filter((u) => u.id !== params.id));
  // Drop their shifts so future weeks don't materialize a ghost employee.
  saveSchedule(getSchedule().filter((s) => s.employeeId !== params.id));
  const recurrence = getRecurrence();
  if (recurrence[params.id]) {
    delete recurrence[params.id];
    saveRecurrence(recurrence);
  }

  return NextResponse.json({ deleted: params.id });
}
