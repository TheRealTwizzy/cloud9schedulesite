import { NextResponse } from "next/server";
import { getSchedule, getSwapConfig, getUsers } from "@/lib/db";
import { getSession } from "@/lib/session";
import { suggestChains } from "@/lib/swapEngine";

// Run the chain engine for a target shift and return up to 3 ranked suggestions.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { shiftId } = await req.json().catch(() => ({}));
  if (!shiftId) {
    return NextResponse.json({ error: "shiftId is required." }, { status: 400 });
  }

  const result = suggestChains({
    targetShiftId: String(shiftId),
    users: getUsers(),
    schedule: getSchedule(),
    config: getSwapConfig(),
  });

  return NextResponse.json(result);
}
