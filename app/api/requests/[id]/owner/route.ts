import { NextResponse } from "next/server";
import { getRequests, getSchedule, saveRequests, saveSchedule } from "@/lib/db";
import { getSession } from "@/lib/session";

// Owner approves or denies a request.
// - Approve applies the coverage chain to schedule.json.
// - Deny requires a note and leaves the schedule untouched.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { decision, note } = await req.json().catch(() => ({}));
  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const requests = getRequests();
  const request = requests.find((r) => r.id === params.id);
  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (["approved", "declined", "cancelled"].includes(request.overallStatus)) {
    return NextResponse.json(
      { error: "This request has already been resolved." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  if (decision === "deny") {
    if (!note || !String(note).trim()) {
      return NextResponse.json(
        { error: "A note is required when denying a request." },
        { status: 400 }
      );
    }
    request.overallStatus = "declined";
    request.ownerNote = String(note).trim();
    request.resolvedAt = now;
    saveRequests(requests);
    return NextResponse.json({ request });
  }

  // Approve: only once all employees have accepted.
  if (request.overallStatus !== "pending_owner_approval") {
    return NextResponse.json(
      { error: "Employees must accept before the owner can approve." },
      { status: 400 }
    );
  }

  // Apply the chain to the schedule. Each link reassigns the covered shift to
  // the covering employee, preserving who originally held it.
  const schedule = getSchedule();
  for (const link of request.proposedChain) {
    const shift = schedule.find((s) => s.id === link.coversShiftId);
    if (!shift) continue;
    if (shift.originalEmployeeId === undefined) {
      shift.originalEmployeeId = shift.employeeId;
    }
    shift.employeeId = link.employeeId;
    shift.coveredBy = link.employeeId;
  }
  saveSchedule(schedule);

  request.overallStatus = "approved";
  request.resolvedAt = now;
  if (note && String(note).trim()) {
    request.ownerNote = String(note).trim();
  }
  saveRequests(requests);

  return NextResponse.json({ request });
}
