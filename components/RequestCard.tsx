"use client";

import ChainVisualizer from "@/components/ChainVisualizer";
import { locationColor } from "@/lib/locationColors";
import { formatTime } from "@/lib/week";
import type { OverallStatus, SwapRequest } from "@/lib/types";

export type ShiftSummary = {
  date: string;
  location: string;
  startTime: string;
  endTime: string;
};

const STATUS_BADGE: Record<OverallStatus, { label: string; cls: string }> = {
  pending_employee_approval: {
    label: "Awaiting Team",
    cls: "bg-yellow-100 text-yellow-800",
  },
  pending_owner_approval: { label: "Awaiting Owner", cls: "bg-blue-100 text-blue-800" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-800" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800" },
};

export default function RequestCard({
  request,
  userNames,
  shiftIndex,
  children,
}: {
  request: SwapRequest;
  userNames: Record<string, string>;
  shiftIndex: Record<string, ShiftSummary>;
  children?: React.ReactNode;
}) {
  const target = shiftIndex[request.targetShiftId];
  const badge = STATUS_BADGE[request.overallStatus];

  const links = request.proposedChain.map((l) => ({
    employeeName: userNames[l.employeeId] ?? "Unknown",
    primaryLocations: [],
    coversLocation: shiftIndex[l.coversShiftId]?.location,
    status: l.status,
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase text-gray-600">
            {request.type === "time-off" ? "Time Off" : "Shift Swap"}
          </span>
          {target && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: locationColor(target.location) }}
              />
              {target.date} · {target.location} ·{" "}
              {formatTime(target.startTime)}–{formatTime(target.endTime)}
            </div>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {request.note && (
        <p className="mb-2 text-sm italic text-gray-500">“{request.note}”</p>
      )}

      {links.length > 0 && (
        <div className="mb-2">
          <ChainVisualizer
            requesterName={userNames[request.requesterId] ?? "Requester"}
            links={links}
          />
        </div>
      )}

      {request.ownerNote && (
        <p className="mb-2 text-sm text-red-600">Owner: {request.ownerNote}</p>
      )}

      {children}
    </div>
  );
}
