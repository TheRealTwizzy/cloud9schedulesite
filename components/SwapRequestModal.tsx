"use client";

import { useState } from "react";
import ChainVisualizer, { suggestionToLinks } from "@/components/ChainVisualizer";
import { useToast } from "@/components/Toast";
import { formatTime } from "@/lib/week";
import type { ChainSuggestion, RequestType, Shift } from "@/lib/types";

type Props = {
  type: RequestType;
  myShifts: Shift[]; // upcoming shifts the user can request off/swap
  onClose: () => void;
  onSubmitted: () => void;
};

// Modal for requesting time off or a shift swap. Picks a shift, fetches engine
// suggestions, then submits the chosen coverage chain (or defers to the owner).
export default function SwapRequestModal({
  type,
  myShifts,
  onClose,
  onSubmitted,
}: Props) {
  const toast = useToast();
  const [shiftId, setShiftId] = useState("");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState<ChainSuggestion[] | null>(null);
  const [engineMessage, setEngineMessage] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadSuggestions() {
    if (!shiftId) return;
    setLoading(true);
    setSuggestions(null);
    setSelected(null);
    setEngineMessage("");
    try {
      const res = await fetch("/api/swap/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      if (data.message) setEngineMessage(data.message);
    } catch {
      toast("Could not load coverage suggestions.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!shiftId) {
      toast("Select a shift first.", "error");
      return;
    }
    const chain =
      selected != null && suggestions
        ? suggestions[selected].links.map((l) => ({
            employeeId: l.employeeId,
            coversShiftId: l.coversShiftId,
            originalShiftId: l.originalShiftId,
          }))
        : [];

    setLoading(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetShiftId: shiftId, note, chain }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not submit request.", "error");
        return;
      }
      toast("Request submitted.", "success");
      onSubmitted();
      onClose();
    } catch {
      toast("Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {type === "time-off" ? "Request Time Off" : "Request Shift Swap"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Which shift?
        </label>
        <select
          value={shiftId}
          onChange={(e) => {
            setShiftId(e.target.value);
            setSuggestions(null);
            setSelected(null);
          }}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Select a shift…</option>
          {myShifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.date} · {s.location} · {formatTime(s.startTime)}–
              {formatTime(s.endTime)}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Anything the team or owner should know…"
        />

        <button
          onClick={loadSuggestions}
          disabled={!shiftId || loading}
          className="mb-4 w-full rounded-lg border border-c9-purple py-2 text-sm font-semibold text-c9-purple transition hover:bg-purple-50 disabled:opacity-50"
        >
          {loading ? "Finding coverage…" : "Find coverage suggestions"}
        </button>

        {suggestions && suggestions.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Suggested coverage
            </p>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`block w-full rounded-lg border p-3 text-left transition ${
                  selected === i
                    ? "border-c9-green ring-1 ring-c9-green"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="mb-1 text-xs text-gray-400">
                  {s.hops === 1 ? "Direct cover" : "Relay (2 hops)"}
                </div>
                <ChainVisualizer requesterName="You" links={suggestionToLinks(s)} />
              </button>
            ))}
          </div>
        )}

        {suggestions && suggestions.length === 0 && (
          <p className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
            {engineMessage || "No simple coverage found."} You can still submit and
            let the owner arrange coverage.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !shiftId}
            className="rounded-lg bg-c9-green px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}
