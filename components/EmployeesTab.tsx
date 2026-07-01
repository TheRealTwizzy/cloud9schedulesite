"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { LOCATION_COLORS, locationColor } from "@/lib/locationColors";
import type { Group, Shift, User } from "@/lib/types";
import { DAYS, formatTime } from "@/lib/week";

type EmployeeSafe = Omit<User, "hashedPassword">;

const GROUPS: Group[] = ["general", "security", "warehouse", "overnight"];
const LOCATIONS = Object.keys(LOCATION_COLORS);

export default function EmployeesTab() {
  const toast = useToast();
  const [employees, setEmployees] = useState<EmployeeSafe[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/employees");
    if (res.ok) setEmployees((await res.json()).employees ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(emp: EmployeeSafe) {
    if (!confirm(`Permanently delete ${emp.displayName}? This removes their shifts too.`))
      return;
    const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
    if (res.ok) {
      toast(`${emp.displayName} deleted.`, "success");
      load();
    } else {
      toast((await res.json()).error ?? "Could not delete.", "error");
    }
  }

  async function toggleActive(emp: EmployeeSafe) {
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: emp.active === false }),
    });
    if (res.ok) {
      toast(emp.active === false ? "Reactivated." : "Deactivated.", "success");
      load();
    } else {
      toast("Could not update.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-lg bg-c9-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {adding ? "Close" : "Add Employee"}
        </button>
      </div>

      {adding && (
        <AddEmployeeForm
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      <ul className="space-y-2">
        {employees.map((emp) => (
          <li
            key={emp.id}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium text-gray-900">{emp.displayName}</span>
                <span className="ml-2 text-xs text-gray-400">@{emp.username}</span>
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {emp.group}
                </span>
                {emp.active === false && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                    Inactive
                  </span>
                )}
                <div className="mt-0.5 text-xs text-gray-500">
                  {(emp.primaryLocations ?? []).join(", ") || "No primary locations"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setScheduleId(scheduleId === emp.id ? null : emp.id)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Schedule
                </button>
                <button
                  onClick={() => setEditingId(editingId === emp.id ? null : emp.id)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(emp)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  {emp.active === false ? "Activate" : "Deactivate"}
                </button>
                <button
                  onClick={() => remove(emp)}
                  className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            {editingId === emp.id && (
              <EditEmployeeForm
                employee={emp}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
              />
            )}
            {scheduleId === emp.id && <ShiftEditor employee={emp} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (loc: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LOCATIONS.map((loc) => {
        const on = selected.includes(loc);
        return (
          <button
            type="button"
            key={loc}
            onClick={() => onToggle(loc)}
            style={on ? { backgroundColor: locationColor(loc), color: "white" } : undefined}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              on ? "" : "bg-gray-100 text-gray-600"
            }`}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}

function AddEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [group, setGroup] = useState<Group>("general");
  const [primaryLocations, setPrimary] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username, group, primaryLocations }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Employee added.", "success");
      onCreated();
    } else {
      toast((await res.json()).error ?? "Could not add employee.", "error");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            Username (optional)
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="derived from name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">Group</span>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as Group)}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <div className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">Primary locations</span>
        <LocationPicker
          selected={primaryLocations}
          onToggle={(loc) =>
            setPrimary((cur) =>
              cur.includes(loc) ? cur.filter((l) => l !== loc) : [...cur, loc]
            )
          }
        />
      </div>
      <button
        onClick={submit}
        disabled={saving || !displayName.trim()}
        className="rounded-lg bg-c9-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Create employee"}
      </button>
    </div>
  );
}

function EditEmployeeForm({
  employee,
  onSaved,
}: {
  employee: EmployeeSafe;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [group, setGroup] = useState<Group>(employee.group);
  const [primaryLocations, setPrimary] = useState<string[]>(
    employee.primaryLocations ?? []
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, group, primaryLocations }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Saved.", "success");
      onSaved();
    } else {
      toast((await res.json()).error ?? "Could not save.", "error");
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Group</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as Group)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">Primary locations</span>
        <LocationPicker
          selected={primaryLocations}
          onToggle={(loc) =>
            setPrimary((cur) =>
              cur.includes(loc) ? cur.filter((l) => l !== loc) : [...cur, loc]
            )
          }
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-c9-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function ShiftEditor({ employee }: { employee: EmployeeSafe }) {
  const toast = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [dayOfWeek, setDay] = useState<string>("Mon");
  const [startTime, setStart] = useState("09:00");
  const [endTime, setEnd] = useState("17:00");
  const [location, setLocation] = useState(LOCATIONS[0]);

  const load = useCallback(async () => {
    const res = await fetch("/api/schedule/week");
    if (res.ok) {
      const all: Shift[] = (await res.json()).shifts ?? [];
      setShifts(all.filter((s) => s.employeeId === employee.id));
    }
  }, [employee.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addShift() {
    const res = await fetch(`/api/employees/${employee.id}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek, startTime, endTime, location }),
    });
    if (res.ok) {
      toast("Shift added.", "success");
      load();
    } else {
      toast((await res.json()).error ?? "Could not add shift.", "error");
    }
  }

  async function removeShift(id: string) {
    const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Shift removed.", "success");
      load();
    } else {
      toast("Could not remove shift.", "error");
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <p className="text-xs text-gray-500">
        Shifts added to this week become {employee.displayName}&apos;s recurring
        weekly pattern.
      </p>
      {shifts.length === 0 ? (
        <p className="text-sm text-gray-400">No shifts this week.</p>
      ) : (
        <ul className="space-y-1">
          {shifts
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{s.dayOfWeek}</span>{" "}
                  {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-xs text-white"
                    style={{ backgroundColor: locationColor(s.location) }}
                  >
                    {s.location}
                  </span>
                </span>
                <button
                  onClick={() => removeShift(s.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <select
          value={dayOfWeek}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          onClick={addShift}
          className="rounded-lg bg-c9-purple px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Add shift
        </button>
      </div>
    </div>
  );
}
