// iron-session configuration and helpers.

import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "./types";

// NOTE: In production, move this secret to an environment variable
// (e.g. process.env.SESSION_SECRET). Hardcoded here to keep the app fully
// self-contained and runnable with no setup. Must be at least 32 chars.
const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? "cloud9-local-dev-session-secret-32ch";

export const sessionOptions: SessionOptions = {
  password: SESSION_PASSWORD,
  cookieName: "cloud9_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
