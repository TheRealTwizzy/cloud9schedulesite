import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserById, getUsers, saveUsers } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { password, confirm } = await req.json().catch(() => ({}));
  const pw = String(password ?? "");

  if (pw.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (pw !== String(confirm ?? "")) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const hashed = await bcrypt.hash(pw, 12);

  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  users[idx] = { ...users[idx], hashedPassword: hashed, mustSetPassword: false };
  saveUsers(users);

  // Promote the session to fully authenticated.
  session.mustSetPassword = false;
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({
    redirect: user.role === "owner" ? "/owner" : "/dashboard",
  });
}
