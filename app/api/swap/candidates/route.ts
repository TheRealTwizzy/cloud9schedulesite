import { NextResponse } from "next/server";
import { getSchedule, getSwapConfig, getUsers } from "@/lib/db";
import { getSession } from "@/lib/session";
import { coverageOptions } from "@/lib/swapEngine";

// Valid manual-mode coverage choices for a target shift: who can cover directly,
// and which relays are buildable. Mirrors the engine's eligibility rules.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { shiftId } = await req.json().catch(() => ({}));
  if (!shiftId) {
    return NextResponse.json({ error: "shiftId is required." }, { status: 400 });
  }

  const options = coverageOptions({
    targetShiftId: String(shiftId),
    users: getUsers(),
    schedule: getSchedule(),
    config: getSwapConfig(),
  });

  return NextResponse.json(options);
}
