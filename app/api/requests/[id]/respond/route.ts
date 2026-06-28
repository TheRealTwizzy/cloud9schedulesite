import { NextResponse } from "next/server";
import { getRequests, saveRequests } from "@/lib/db";
import { getSession } from "@/lib/session";

// A chain participant accepts or declines their slot.
// - Any decline cancels the whole request.
// - When every participant has accepted, the request moves to owner approval.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { decision } = await req.json().catch(() => ({}));
  if (decision !== "accept" && decision !== "decline") {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const requests = getRequests();
  const request = requests.find((r) => r.id === params.id);
  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (request.overallStatus !== "pending_employee_approval") {
    return NextResponse.json(
      { error: "This request is no longer awaiting team responses." },
      { status: 400 }
    );
  }

  const link = request.proposedChain.find((l) => l.employeeId === session.userId);
  if (!link) {
    return NextResponse.json(
      { error: "You are not part of this chain." },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  link.respondedAt = now;

  if (decision === "decline") {
    link.status = "declined";
    request.overallStatus = "cancelled";
    request.resolvedAt = now;
  } else {
    link.status = "accepted";
    const allAccepted = request.proposedChain.every((l) => l.status === "accepted");
    if (allAccepted) {
      request.overallStatus = "pending_owner_approval";
    }
  }

  saveRequests(requests);
  return NextResponse.json({ request });
}
