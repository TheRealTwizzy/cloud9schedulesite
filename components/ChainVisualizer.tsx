"use client";

import type { ChainLink, ChainSuggestion } from "@/lib/types";

type LinkView = {
  employeeName: string;
  primaryLocations: string[];
  coversLocation?: string;
  status?: ChainLink["status"];
};

function statusMark(status?: ChainLink["status"]) {
  if (status === "accepted") return <span className="text-c9-green">✓</span>;
  if (status === "declined") return <span className="text-red-600">✗</span>;
  if (status === "pending") return <span className="text-yellow-500">⏳</span>;
  return null;
}

// Renders a coverage chain as "You → A covers X → B covers Y".
// Accepts either an engine suggestion or a stored request's chain (with names
// resolved by the caller).
export default function ChainVisualizer({
  requesterName,
  links,
}: {
  requesterName: string;
  links: LinkView[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded bg-gray-100 px-2 py-1 font-medium text-gray-700">
        {requesterName} (off)
      </span>
      {links.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-gray-400">→</span>
          <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">
            <span className="font-medium text-gray-900">{link.employeeName}</span>
            {link.coversLocation && (
              <span className="text-gray-500"> covers {link.coversLocation}</span>
            )}{" "}
            {statusMark(link.status)}
            {link.primaryLocations.length > 0 && (
              <span className="block text-[11px] text-gray-400">
                home: {link.primaryLocations.join(", ")}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// Helper to map an engine suggestion into ChainVisualizer's link shape.
export function suggestionToLinks(s: ChainSuggestion): LinkView[] {
  return s.links.map((l) => ({
    employeeName: l.employeeName,
    primaryLocations: l.primaryLocations,
    coversLocation: l.coversLocation,
  }));
}
