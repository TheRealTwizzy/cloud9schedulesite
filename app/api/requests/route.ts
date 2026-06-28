import { NextResponse } from "next/server";
import {
  getRequests,
  getSchedule,
  getShiftById,
  getSwapConfig,
  getUsers,
  saveRequests,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import { validateChain } from "@/lib/swapEngine";
import type { ChainLink, SwapRequest } from "@/lib/types";

// Requests relevant to the session user. Owner sees all; an employee sees the
// ones they raised plus any where they're a chain participant. Lookup maps for
// names and shift summaries are included so clients can render chains without
// extra round-trips.
export async function GET() {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const all = getRequests();
  const requests =
    session.role === "owner"
      ? all
      : all.filter(
          (r) =>
            r.requesterId === session.userId ||
            r.proposedChain.some((l) => l.employeeId === session.userId)
        );

  const userNames: Record<string, string> = {};
  for (const u of getUsers()) userNames[u.id] = u.displayName;

  const shiftIndex: Record<
    string,
    { date: string; location: string; startTime: string; endTime: string }
  > = {};
  for (const s of getSchedule()) {
    shiftIndex[s.id] = {
      date: s.date,
      location: s.location,
      startTime: s.startTime,
      endTime: s.endTime,
    };
  }

  return NextResponse.json({ requests, userNames, shiftIndex });
}

// Submit a new time-off or shift-swap request.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { type, targetShiftId, note, chain } = body as {
    type: SwapRequest["type"];
    targetShiftId: string;
    note?: string;
    chain?: Array<{ employeeId: string; coversShiftId: string; originalShiftId?: string }>;
  };

  if (type !== "time-off" && type !== "shift-swap") {
    return NextResponse.json({ error: "Invalid request type." }, { status: 400 });
  }

  const target = getShiftById(String(targetShiftId));
  if (!target) {
    return NextResponse.json({ error: "Target shift not found." }, { status: 404 });
  }
  if (target.employeeId !== session.userId) {
    return NextResponse.json(
      { error: "You can only request coverage for your own shifts." },
      { status: 403 }
    );
  }

  // Block requests targeting an overnight employee's shift.
  const owner = getUsers().find((u) => u.id === target.employeeId);
  if (owner?.group === "overnight") {
    return NextResponse.json(
      { error: "Overnight shifts cannot be swapped." },
      { status: 400 }
    );
  }

  // Validate any proposed chain against the engine's rules before accepting it —
  // a manually-built chain must be just as valid as a suggested one.
  if (chain && chain.length > 0) {
    const result = validateChain({
      targetShiftId: target.id,
      chain,
      users: getUsers(),
      schedule: getSchedule(),
      config: getSwapConfig(),
    });
    if (!result.valid) {
      return NextResponse.json(
        { error: result.error ?? "Invalid coverage chain." },
        { status: 400 }
      );
    }
  }

  const proposedChain: ChainLink[] = (chain ?? []).map((link) => ({
    employeeId: link.employeeId,
    coversShiftId: link.coversShiftId,
    originalShiftId: link.originalShiftId,
    status: "pending",
  }));

  const newRequest: SwapRequest = {
    id: crypto.randomUUID(),
    type,
    requesterId: session.userId,
    submittedAt: new Date().toISOString(),
    targetShiftId: target.id,
    note: note ? String(note) : undefined,
    proposedChain,
    // With a proposed chain, employees must accept first; otherwise it goes
    // straight to the owner to arrange coverage.
    overallStatus:
      proposedChain.length > 0
        ? "pending_employee_approval"
        : "pending_owner_approval",
  };

  const requests = getRequests();
  requests.push(newRequest);
  saveRequests(requests);

  return NextResponse.json({ request: newRequest }, { status: 201 });
}
