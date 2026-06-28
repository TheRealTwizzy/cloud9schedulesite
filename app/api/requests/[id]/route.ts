import { NextResponse } from "next/server";
import { getRequests, saveRequests } from "@/lib/db";
import { getSession } from "@/lib/session";

// Requester cancels their own request — only while still awaiting team response.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.userId || session.mustSetPassword) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const requests = getRequests();
  const idx = requests.findIndex((r) => r.id === params.id);
  if (idx === -1) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const request = requests[idx];
  if (request.requesterId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (request.overallStatus !== "pending_employee_approval") {
    return NextResponse.json(
      { error: "Only requests awaiting team response can be cancelled." },
      { status: 400 }
    );
  }

  request.overallStatus = "cancelled";
  request.resolvedAt = new Date().toISOString();
  saveRequests(requests);

  return NextResponse.json({ request });
}
