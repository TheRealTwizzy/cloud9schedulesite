"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequestCard, { type ShiftSummary } from "@/components/RequestCard";
import ShiftCard from "@/components/ShiftCard";
import SwapRequestModal from "@/components/SwapRequestModal";
import { useToast } from "@/components/Toast";
import type { RequestType, Shift, SwapRequest } from "@/lib/types";
import { DAYS, toISODate, weekDates } from "@/lib/week";

type RequestsResponse = {
  requests: SwapRequest[];
  userNames: Record<string, string>;
  shiftIndex: Record<string, ShiftSummary>;
};

export default function DashboardClient({ userId }: { userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [modal, setModal] = useState<RequestType | null>(null);

  const today = toISODate(new Date());
  const week = useMemo(() => weekDates(new Date()), []);

  const load = useCallback(async () => {
    const [sRes, rRes] = await Promise.all([
      fetch("/api/schedule"),
      fetch("/api/requests"),
    ]);
    if (sRes.ok) setShifts((await sRes.json()).shifts ?? []);
    if (rRes.ok) setData(await rRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shiftByDate = useMemo(() => {
    const map: Record<string, Shift> = {};
    for (const s of shifts) map[s.date] = s;
    return map;
  }, [shifts]);

  const upcoming = useMemo(
    () => shifts.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, today]
  );

  const myRequests = (data?.requests ?? []).filter((r) => r.requesterId === userId);
  const pendingMine = (data?.requests ?? []).filter(
    (r) =>
      r.overallStatus === "pending_employee_approval" &&
      r.proposedChain.some((l) => l.employeeId === userId && l.status === "pending")
  );

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Request cancelled.", "success");
      load();
    } else {
      toast("Could not cancel.", "error");
    }
  }

  async function respond(id: string, decision: "accept" | "decline") {
    if (decision === "decline" && !confirm("Decline this coverage request?")) return;
    const res = await fetch(`/api/requests/${id}/respond`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (res.ok) {
      toast(decision === "accept" ? "Accepted." : "Declined.", "success");
      load();
    } else {
      toast("Could not save response.", "error");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Image src="/cloud9-logo.png" alt="Cloud 9" width={48} height={48} />
        <button
          onClick={logout}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Sign out
        </button>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">This Week</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setModal("time-off")}
              className="rounded-lg bg-c9-purple px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Request Time Off
            </button>
            <button
              onClick={() => setModal("shift-swap")}
              className="rounded-lg bg-c9-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Request Shift Swap
            </button>
          </div>
        </div>
        {shifts.length === 0 ? (
          <p className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
            No shifts scheduled this week.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {week.map((date, i) => (
              <ShiftCard
                key={date}
                day={DAYS[i]}
                date={date}
                shift={shiftByDate[date]}
              />
            ))}
          </div>
        )}
      </section>

      {pendingMine.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Pending Your Response</h2>
          <div className="space-y-3">
            {pendingMine.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                userNames={data!.userNames}
                shiftIndex={data!.shiftIndex}
              >
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => respond(r.id, "accept")}
                    className="rounded-lg bg-c9-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(r.id, "decline")}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Decline
                  </button>
                </div>
              </RequestCard>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">My Requests</h2>
        {myRequests.length === 0 ? (
          <p className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
            You have no requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {myRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                userNames={data!.userNames}
                shiftIndex={data!.shiftIndex}
              >
                {r.overallStatus === "pending_employee_approval" && (
                  <button
                    onClick={() => cancel(r.id)}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </RequestCard>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <SwapRequestModal
          type={modal}
          myShifts={upcoming}
          onClose={() => setModal(null)}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
