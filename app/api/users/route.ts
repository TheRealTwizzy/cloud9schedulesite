import { NextResponse } from "next/server";
import { getUsers } from "@/lib/db";
import { getSession } from "@/lib/session";

// Owner-only roster. Strips password hashes.
export async function GET() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const users = getUsers().map(({ hashedPassword, ...rest }) => rest);
  return NextResponse.json({ users });
}
