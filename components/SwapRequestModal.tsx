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

type Person = {
  employeeId: string;
  employeeName: string;
  primaryLocations: string[];
};
type RelayOption = Person & {
  conflictShift: {
    id: string;
    location: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  coverers: Person[];
};
type CoverageOptions = {
  direct: Person[];
  relays: RelayOption[];
  message?: string;
};

type Mode = "suggest" | "manual";

// Modal for requesting time off or a shift swap. Picks a shift, then either
// chooses an engine suggestion or builds a coverage chain by hand. Both paths
// are validated server-side before submission.
export default function SwapRequestModal({
  type,
  myShifts,
  onClose,
  onSubmitted,
}: Props) {
  const toast = useToast();
  const [shiftId, setShiftId] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<Mode>("suggest");
  const [loading, setLoading] = useState(false);

  // Suggested-mode state.
  const [suggestions, setSuggestions] = useState<ChainSuggestion[] | null>(null);
  const [engineMessage, setEngineMessage] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  // Manual-mode state.
  const [options, setOptions] = useState<CoverageOptions | null>(null);
  // The person covering the requested shift (a direct candidate or a relay B).
  const [coverId, setCoverId] = useState("");
  // For a relay, the person covering that B's freed shift.
  const [relayCovererId, setRelayCovererId] = useState("");

  function resetCoverageState() {
    setSuggestions(null);
    setSelected(null);
    setEngineMessage("");
    setOptions(null);
    setCoverId("");
    setRelayCovererId("");
  }

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

  async function loadOptions() {
    if (!shiftId) return;
    setLoading(true);
    setOptions(null);
    setCoverId("");
    setRelayCovererId("");
    try {
      const res = await fetch("/api/swap/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId }),
      });
      const data = (await res.json()) as CoverageOptions;
      setOptions(data);
    } catch {
      toast("Could not load coverage options.", "error");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    if (!shiftId) return;
    if (next === "suggest" && suggestions === null) loadSuggestions();
    if (next === "manual" && options === null) loadOptions();
  }

  // The relay currently selected as the cover (if coverId is a relay B).
  const selectedRelay =
    options?.relays.find((r) => r.employeeId === coverId) ?? null;

  function buildManualChain() {
    if (!options || !coverId) return null;
    const direct = options.direct.find((d) => d.employeeId === coverId);
    if (direct) {
      return [{ employeeId: coverId, coversShiftId: shiftId }];
    }
    if (selectedRelay) {
      if (!relayCovererId) return null;
      return [
        {
          employeeId: selectedRelay.employeeId,
          coversShiftId: shiftId,
          originalShiftId: selectedRelay.conflictShift.id,
        },
        {
          employeeId: relayCovererId,
          coversShiftId: selectedRelay.conflictShift.id,
        },
      ];
    }
    return null;
  }

  async function submit() {
    if (!shiftId) {
      toast("Select a shift first.", "error");
      return;
    }

    let chain:
      | Array<{ employeeId: string; coversShiftId: string; originalShiftId?: string }>
      | [] = [];

    if (mode === "suggest") {
      chain =
        selected != null && suggestions
          ? suggestions[selected].links.map((l) => ({
              employeeId: l.employeeId,
              coversShiftId: l.coversShiftId,
              originalShiftId: l.originalShiftId,
            }))
          : [];
    } else {
      const manual = buildManualChain();
      if (coverId && !manual) {
        toast("Finish picking who covers the relay shift.", "error");
        return;
      }
      chain = manual ?? [];
    }

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

  const noManualOptions =
    options && options.direct.length === 0 && options.relays.length === 0;

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
            resetCoverageState();
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

        {/* Mode toggle */}
        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
          {(["suggest", "manual"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={!shiftId}
              className={`flex-1 rounded-md py-1.5 font-medium transition disabled:opacity-50 ${
                mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
              }`}
            >
              {m === "suggest" ? "Suggested" : "Build manually"}
            </button>
          ))}
        </div>

        {/* Suggested mode */}
        {mode === "suggest" && (
          <>
            <button
              onClick={loadSuggestions}
              disabled={!shiftId || loading}
              className="mb-4 w-full rounded-lg border border-c9-purple py-2 text-sm font-semibold text-c9-purple transition hover:bg-purple-50 disabled:opacity-50"
            >
              {loading ? "Finding coverage…" : "Find coverage suggestions"}
            </button>

            {suggestions && suggestions.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Suggested coverage</p>
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
                {engineMessage || "No simple coverage found."} You can build a chain
                manually or submit and let the owner arrange coverage.
              </p>
            )}
          </>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <div className="mb-4">
            {!options && (
              <button
                onClick={loadOptions}
                disabled={!shiftId || loading}
                className="w-full rounded-lg border border-c9-purple py-2 text-sm font-semibold text-c9-purple transition hover:bg-purple-50 disabled:opacity-50"
              >
                {loading ? "Loading options…" : "Load coverage options"}
              </button>
            )}

            {noManualOptions && (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                No eligible coverers found. You can still submit and let the owner
                arrange coverage.
              </p>
            )}

            {options && !noManualOptions && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Who covers your shift?
                  </label>
                  <select
                    value={coverId}
                    onChange={(e) => {
                      setCoverId(e.target.value);
                      setRelayCovererId("");
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">Select someone…</option>
                    {options.direct.length > 0 && (
                      <optgroup label="Available now">
                        {options.direct.map((d) => (
                          <option key={d.employeeId} value={d.employeeId}>
                            {d.employeeName}
                            {d.primaryLocations.length
                              ? ` — ${d.primaryLocations.join(", ")}`
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {options.relays.length > 0 && (
                      <optgroup label="Needs a relay (they're scheduled)">
                        {options.relays.map((r) => (
                          <option key={r.employeeId} value={r.employeeId}>
                            {r.employeeName} (needs cover for{" "}
                            {r.conflictShift.location})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {selectedRelay && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Who covers {selectedRelay.employeeName}&apos;s{" "}
                      {selectedRelay.conflictShift.location} shift (
                      {formatTime(selectedRelay.conflictShift.startTime)}–
                      {formatTime(selectedRelay.conflictShift.endTime)})?
                    </label>
                    <select
                      value={relayCovererId}
                      onChange={(e) => setRelayCovererId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="">Select someone…</option>
                      {selectedRelay.coverers.map((c) => (
                        <option key={c.employeeId} value={c.employeeId}>
                          {c.employeeName}
                          {c.primaryLocations.length
                            ? ` — ${c.primaryLocations.join(", ")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
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
