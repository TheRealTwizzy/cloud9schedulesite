import { NextResponse } from "next/server";
import { getLocations, getUsers, saveUsers } from "@/lib/db";
import { buildNewEmployee } from "@/lib/employees";
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

// Owner-only roster (no password hashes).
export async function GET() {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const employees = getUsers()
    .filter((u) => u.role === "employee")
    .map(({ hashedPassword, ...rest }) => rest);
  return NextResponse.json({ employees });
}

// Create a new employee. They set their own password on first login.
export async function POST(req: Request) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const users = getUsers();
  const result = buildNewEmployee(body, users, getLocations());
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  users.push(result.user);
  saveUsers(users);

  const { hashedPassword, ...safe } = result.user;
  return NextResponse.json({ employee: safe }, { status: 201 });
}
