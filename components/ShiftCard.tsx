"use client";

import { locationColor } from "@/lib/locationColors";
import { formatTime } from "@/lib/week";
import type { Shift } from "@/lib/types";

type Props = {
  day: string;
  date: string;
  shift?: Shift;
  onClick?: () => void;
};

// One day's cell in a week view. Renders an OFF state when no shift is present.
export default function ShiftCard({ day, date, shift, onClick }: Props) {
  const dayNum = Number(date.slice(8, 10));

  if (!shift) {
    return (
      <div className="flex min-h-[96px] flex-col rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-400">
        <div className="text-xs font-semibold uppercase">{day}</div>
        <div className="text-xs">{dayNum}</div>
        <div className="mt-auto text-xs italic">Off</div>
      </div>
    );
  }

  const color = locationColor(shift.location);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderLeftColor: color }}
      className="flex min-h-[96px] flex-col rounded-lg border border-l-4 border-gray-200 bg-white p-3 text-left shadow-sm transition hover:shadow"
    >
      <div className="text-xs font-semibold uppercase text-gray-700">{day}</div>
      <div className="text-xs text-gray-400">{dayNum}</div>
      <div className="mt-1 text-sm font-medium text-gray-900">
        {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
      </div>
      <span
        className="mt-auto inline-block w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {shift.location}
      </span>
    </button>
  );
}
