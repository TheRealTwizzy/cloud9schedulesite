"use client";

import { useEffect, useState } from "react";
import type { RecurrenceMap, User } from "@/lib/types";

type EmployeeLite = Pick<User, "id" | "displayName" | "group">;

// Owner control for each employee's recurring schedule: permanent, or temporary
// with an expiration date after which their shifts stop recurring.
export default function RecurrenceEditor({
  employees,
  recurrence,
  onChange,
}: {
  employees: EmployeeLite[];
  recurrence: RecurrenceMap;
  onChange: (employeeId: string, permanent: boolean, expiresOn?: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Recurring schedule
        </h3>
        <p className="text-xs text-gray-500">
          Permanent schedules repeat every week. Set an expiration for temporary
          employees and their shifts stop recurring after that date.
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {employees.map((emp) => (
          <EmployeeRow
            key={emp.id}
            employee={emp}
            entry={recurrence[emp.id]}
            onChange={onChange}
          />
        ))}
      </ul>
    </div>
  );
}

function EmployeeRow({
  employee,
  entry,
  onChange,
}: {
  employee: EmployeeLite;
  entry: RecurrenceMap[string] | undefined;
  onChange: (employeeId: string, permanent: boolean, expiresOn?: string) => void;
}) {
  // Default (no entry) is permanent.
  const [mode, setMode] = useState<"permanent" | "temporary">(
    entry && !entry.permanent ? "temporary" : "permanent"
  );
  const [draftDate, setDraftDate] = useState(entry?.expiresOn ?? "");

  // Recurrence data is fetched separately from the employee list, so an entry
  // can arrive after this row first renders. Re-sync local state when it does
  // (and after a save echoes the updated entry back) so the row never shows
  // stale settings.
  useEffect(() => {
    setMode(entry && !entry.permanent ? "temporary" : "permanent");
    setDraftDate(entry?.expiresOn ?? "");
  }, [entry]);

  function commit(nextMode: "permanent" | "temporary", date: string) {
    if (nextMode === "permanent") onChange(employee.id, true);
    else if (date) onChange(employee.id, false, date);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <span className="font-medium text-gray-800">{employee.displayName}</span>
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as "permanent" | "temporary";
            setMode(next);
            commit(next, draftDate);
          }}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="permanent">Permanent</option>
          <option value="temporary">Temporary</option>
        </select>
        {mode === "temporary" && (
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            onBlur={() => commit("temporary", draftDate)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            title="Recurs until this date"
          />
        )}
      </div>
    </li>
  );
}
