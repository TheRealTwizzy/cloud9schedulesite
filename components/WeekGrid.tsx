"use client";

import { locationColor } from "@/lib/locationColors";
import { formatTime, DAYS } from "@/lib/week";
import type { Shift, User } from "@/lib/types";

type EmployeeLite = Pick<User, "id" | "displayName" | "group">;

// Read-only grid: one row per employee, seven day columns for the given week.
export default function WeekGrid({
  employees,
  shifts,
  week,
  onShiftClick,
}: {
  employees: EmployeeLite[];
  shifts: Shift[];
  week: string[];
  onShiftClick?: (shift: Shift) => void;
}) {
  const byEmpDate = new Map<string, Shift>();
  for (const s of shifts) byEmpDate.set(`${s.employeeId}|${s.date}`, s);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="sticky left-0 z-10 bg-gray-50 p-2 text-left font-semibold text-gray-600">
              Employee
            </th>
            {week.map((date, i) => (
              <th key={date} className="p-2 text-center font-semibold text-gray-600">
                {DAYS[i]}
                <div className="text-[11px] font-normal text-gray-400">
                  {Number(date.slice(8, 10))}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-t border-gray-100">
              <td className="sticky left-0 z-10 bg-white p-2 font-medium text-gray-800">
                {emp.displayName}
              </td>
              {week.map((date) => {
                const shift = byEmpDate.get(`${emp.id}|${date}`);
                if (!shift) {
                  return (
                    <td key={date} className="p-1 text-center text-gray-300">
                      —
                    </td>
                  );
                }
                const color = locationColor(shift.location);
                return (
                  <td key={date} className="p-1">
                    <button
                      onClick={() => onShiftClick?.(shift)}
                      style={{ backgroundColor: color }}
                      className="w-full rounded px-1 py-1 text-[11px] font-medium text-white"
                      title={`${shift.location} ${shift.startTime}-${shift.endTime}`}
                    >
                      {formatTime(shift.startTime)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
