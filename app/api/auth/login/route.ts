import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByUsername } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const user = getUserByUsername(String(username));
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const session = await getSession();

  // First-login flow: do NOT validate the password. The stored hash is null;
  // send the user to set their password. This must feel like onboarding, not a
  // failed login.
  if (user.mustSetPassword || !user.hashedPassword) {
    session.userId = user.id;
    session.username = user.username;
    session.displayName = user.displayName;
    session.role = user.role;
    session.group = user.group;
    session.mustSetPassword = true;
    session.isLoggedIn = false;
    await session.save();
    return NextResponse.json({ mustSetPassword: true, redirect: "/set-password" });
  }

  const ok = await bcrypt.compare(String(password ?? ""), user.hashedPassword);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  session.userId = user.id;
  session.username = user.username;
  session.displayName = user.displayName;
  session.role = user.role;
  session.group = user.group;
  session.mustSetPassword = false;
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({
    mustSetPassword: false,
    redirect: user.role === "owner" ? "/owner" : "/dashboard",
  });
}
