"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequestCard, { type ShiftSummary } from "@/components/RequestCard";
import WeekGrid from "@/components/WeekGrid";
import { useToast } from "@/components/Toast";
import { locationColor } from "@/lib/locationColors";
import type { OverallStatus, Shift, SwapRequest, User } from "@/lib/types";
import { formatTime, weekDates } from "@/lib/week";

type EmployeeLite = Pick<User, "id" | "displayName" | "group">;
type RequestsResponse = {
  requests: SwapRequest[];
  userNames: Record<string, string>;
  shiftIndex: Record<string, ShiftSummary>;
};
type Tab = "pending" | "all" | "schedule";

export default function OwnerClient() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<OverallStatus | "all">("all");
  const [detailShift, setDetailShift] = useState<Shift | null>(null);

  const employeeNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of employees) m[e.id] = e.displayName;
    return m;
  }, [employees]);

  const week = useMemo(() => weekDates(new Date()), []);

  const load = useCallback(async () => {
    const [rRes, wRes] = await Promise.all([
      fetch("/api/requests"),
      fetch("/api/schedule/week"),
    ]);
    if (rRes.ok) setData(await rRes.json());
    if (wRes.ok) {
      const w = await wRes.json();
      setShifts(w.shifts ?? []);
      setEmployees(w.employees ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function decide(id: string, decision: "approve" | "deny" | "cancel") {
    const note = notes[id] ?? "";
    if (decision !== "approve" && !note.trim()) {
      toast(`A note is required to ${decision}.`, "error");
      return;
    }
    const res = await fetch(`/api/requests/${id}/owner`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) {
      const verb =
        decision === "approve"
          ? "Approved."
          : decision === "deny"
          ? "Denied."
          : "Cancelled.";
      toast(verb, "success");
      load();
    } else {
      const d = await res.json();
      toast(d.error ?? "Could not save decision.", "error");
    }
  }

  const requests = data?.requests ?? [];
  const pending = requests.filter((r) =>
    ["pending_employee_approval", "pending_owner_approval"].includes(r.overallStatus)
  );
  const filtered =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.overallStatus === statusFilter);

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: `Pending Approval (${pending.length})` },
    { key: "all", label: "All Requests" },
    { key: "schedule", label: "Employee Schedule" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/cloud9-logo.png" alt="Cloud 9" width={48} height={48} />
          <span className="font-semibold text-gray-700">Owner Console</span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Sign out
        </button>
      </header>

      <nav className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-b-2 border-c9-green text-c9-green"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "pending" && data && (
        <div className="space-y-3">
          {pending.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
              Nothing awaiting approval.
            </p>
          )}
          {pending.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              userNames={data.userNames}
              shiftIndex={data.shiftIndex}
            >
              {r.overallStatus === "pending_owner_approval" ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    placeholder="Optional note (required to deny)…"
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(r.id, "approve")}
                      className="rounded-lg bg-c9-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(r.id, "deny")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-500">
                    Awaiting employee responses.
                  </p>
                  <textarea
                    placeholder="Reason (required to force-cancel)…"
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => decide(r.id, "cancel")}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Force Cancel
                  </button>
                </div>
              )}
            </RequestCard>
          ))}
        </div>
      )}

      {tab === "all" && data && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as OverallStatus | "all")
              }
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="pending_employee_approval">Awaiting Team</option>
              <option value="pending_owner_approval">Awaiting Owner</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="space-y-3">
            {filtered.length === 0 && (
              <p className="rounded-lg bg-white p-4 text-sm text-gray-500 shadow-sm">
                No requests match.
              </p>
            )}
            {filtered.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                userNames={data.userNames}
                shiftIndex={data.shiftIndex}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <WeekGrid
          employees={employees}
          shifts={shifts}
          week={week}
          onShiftClick={setDetailShift}
        />
      )}

      {detailShift && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setDetailShift(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Shift details</h3>
              <button
                onClick={() => setDetailShift(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Employee</dt>
                <dd className="font-medium text-gray-900">
                  {employeeNames[detailShift.employeeId] ?? detailShift.employeeId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Date</dt>
                <dd className="text-gray-900">
                  {detailShift.dayOfWeek}, {detailShift.date}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Time</dt>
                <dd className="text-gray-900">
                  {formatTime(detailShift.startTime)}–
                  {formatTime(detailShift.endTime)}
                  {detailShift.crossesMidnight && " (overnight)"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Location</dt>
                <dd>
                  <span
                    className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: locationColor(detailShift.location) }}
                  >
                    {detailShift.location}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
