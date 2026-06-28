import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageOptions,
  suggestChains,
  validateChain,
} from "../lib/swapEngine";
import type { Shift, SwapConfig, User } from "../lib/types";

// --- Fixtures --------------------------------------------------------------

// Mirrors data/swap_config.json's group rules.
const config: SwapConfig = {
  maxChainLength: 2,
  maxSuggestions: 3,
  groupRules: {
    overnight: { canSwapWithGroups: [], canCoverLocations: [] },
    warehouse: { canSwapWithGroups: ["warehouse"], canCoverLocations: ["Warehouse"] },
    security: {
      canSwapWithGroups: ["security", "general"],
      canCoverLocations: [
        "Security",
        "Overnight Security",
        "Cloud 9",
        "Noc9",
        "Spearfish",
        "Black Hawk",
      ],
      preferredLocations: ["Security", "Overnight Security"],
    },
    general: {
      canSwapWithGroups: ["general", "security"],
      canCoverLocations: ["Cloud 9", "Noc9", "Spearfish", "Black Hawk", "Security"],
    },
  },
  suggestionRankingCriteria: [],
  approvalFlow: [],
};

function user(
  id: string,
  group: User["group"],
  primaryLocations: string[] = [],
  role: User["role"] = "employee"
): User {
  return {
    id,
    username: id,
    displayName: id,
    role,
    group,
    mustSetPassword: false,
    hashedPassword: "x",
    primaryLocations,
  };
}

function shift(
  id: string,
  employeeId: string,
  startTime: string,
  endTime: string,
  location: string,
  date = "2026-06-28"
): Shift {
  return {
    id,
    employeeId,
    date,
    dayOfWeek: "Sun",
    startTime,
    endTime,
    location,
    crossesMidnight: false,
    endsNextDay: false,
  };
}

const names = (links: { employeeName: string }[]) => links.map((l) => l.employeeName);

// --- Tests -----------------------------------------------------------------

describe("suggestChains — direct cover", () => {
  const users = [
    user("req", "general", ["Cloud 9"]),
    user("alice", "general", ["Cloud 9"]), // primary match
    user("bob", "general", ["Noc9"]), // non-primary store
    user("sec", "security", ["Security"]), // security covering a store -> last
    user("james", "overnight", ["Overnight Security"]), // must never appear
  ];
  const schedule = [shift("T", "req", "08:00", "16:00", "Cloud 9")];

  it("ranks primary-location match first and security-on-store last", () => {
    const { suggestions } = suggestChains({
      targetShiftId: "T",
      users,
      schedule,
      config,
    });
    assert.deepEqual(
      suggestions.map((s) => s.links[0].employeeName),
      ["alice", "bob", "sec"]
    );
    assert.equal(suggestions[0].primaryMatch, true);
    assert.equal(suggestions[2].securityStore, true);
  });

  it("never suggests the overnight employee", () => {
    const { suggestions } = suggestChains({
      targetShiftId: "T",
      users,
      schedule,
      config,
    });
    const everyone = suggestions.flatMap((s) => names(s.links));
    assert.ok(!everyone.includes("james"));
  });

  it("caps suggestions at maxSuggestions", () => {
    const many = [
      ...users,
      user("carol", "general", ["Cloud 9"]),
      user("dave", "general", ["Cloud 9"]),
    ];
    const { suggestions } = suggestChains({
      targetShiftId: "T",
      users: many,
      schedule,
      config,
    });
    assert.equal(suggestions.length, 3);
  });
});

describe("suggestChains — overnight is untouchable", () => {
  it("returns no coverage for an overnight shift and explains why", () => {
    const users = [
      user("james", "overnight", ["Overnight Security"]),
      user("alice", "general", ["Cloud 9"]),
    ];
    const schedule = [shift("J", "james", "23:00", "07:00", "Overnight Security")];
    const result = suggestChains({ targetShiftId: "J", users, schedule, config });
    assert.equal(result.suggestions.length, 0);
    assert.match(result.message ?? "", /overnight/i);
  });
});

describe("suggestChains — double-booking", () => {
  // carol can cover Cloud 9 but already works an overlapping Noc9 shift, so she
  // can only help via a relay where dave takes her Noc9 shift.
  const users = [
    user("req", "general", ["Cloud 9"]),
    user("carol", "general", ["Cloud 9"]),
    user("dave", "general", ["Noc9"]),
  ];
  const schedule = [
    shift("T", "req", "08:00", "16:00", "Cloud 9"),
    shift("C", "carol", "10:00", "14:00", "Noc9"), // overlaps T
  ];

  it("excludes a double-booked employee from direct cover", () => {
    const { suggestions } = suggestChains({
      targetShiftId: "T",
      users,
      schedule,
      config,
    });
    const directCovers = suggestions
      .filter((s) => s.hops === 1)
      .map((s) => s.links[0].employeeName);
    assert.ok(!directCovers.includes("carol"));
  });

  it("finds a 2-hop relay that frees the busy employee", () => {
    const { suggestions } = suggestChains({
      targetShiftId: "T",
      users,
      schedule,
      config,
    });
    const relay = suggestions.find((s) => s.hops === 2);
    assert.ok(relay, "expected a relay suggestion");
    assert.deepEqual(names(relay!.links), ["carol", "dave"]);
    assert.equal(relay!.links[0].coversShiftId, "T");
    assert.equal(relay!.links[1].coversShiftId, "C");
  });
});

describe("suggestChains — group isolation", () => {
  it("only warehouse employees can cover a warehouse shift", () => {
    const users = [
      user("nate", "warehouse", ["Warehouse"]),
      user("jessie", "warehouse", ["Warehouse"]),
      user("alice", "general", ["Cloud 9"]),
    ];
    const schedule = [shift("W", "nate", "09:00", "17:00", "Warehouse")];
    const { suggestions } = suggestChains({
      targetShiftId: "W",
      users,
      schedule,
      config,
    });
    assert.deepEqual(names(suggestions[0].links), ["jessie"]);
    const everyone = suggestions.flatMap((s) => names(s.links));
    assert.ok(!everyone.includes("alice"));
  });

  it("returns an empty result when no coverage exists within 2 hops", () => {
    const users = [
      user("req", "general", ["Cloud 9"]),
      user("busy", "general", ["Cloud 9"]),
    ];
    const schedule = [
      shift("T", "req", "08:00", "16:00", "Cloud 9"),
      shift("B", "busy", "08:00", "16:00", "Noc9"), // busy, and nobody can free them
    ];
    const result = suggestChains({ targetShiftId: "T", users, schedule, config });
    assert.equal(result.suggestions.length, 0);
    assert.match(result.message ?? "", /no simple coverage/i);
  });
});

describe("validateChain", () => {
  const users = [
    user("req", "general", ["Cloud 9"]),
    user("alice", "general", ["Cloud 9"]),
    user("nate", "warehouse", ["Warehouse"]),
    user("carol", "general", ["Cloud 9"]),
    user("dave", "general", ["Noc9"]),
  ];
  const schedule = [
    shift("T", "req", "08:00", "16:00", "Cloud 9"),
    shift("C", "carol", "10:00", "14:00", "Noc9"),
  ];

  it("accepts a valid direct cover", () => {
    const r = validateChain({
      targetShiftId: "T",
      chain: [{ employeeId: "alice", coversShiftId: "T" }],
      users,
      schedule,
      config,
    });
    assert.equal(r.valid, true);
  });

  it("rejects a coverer whose group can't work the location", () => {
    const r = validateChain({
      targetShiftId: "T",
      chain: [{ employeeId: "nate", coversShiftId: "T" }],
      users,
      schedule,
      config,
    });
    assert.equal(r.valid, false);
    assert.match(r.error ?? "", /can't cover/i);
  });

  it("accepts a well-formed relay", () => {
    const r = validateChain({
      targetShiftId: "T",
      chain: [
        { employeeId: "carol", coversShiftId: "T", originalShiftId: "C" },
        { employeeId: "dave", coversShiftId: "C" },
      ],
      users,
      schedule,
      config,
    });
    assert.equal(r.valid, true);
  });

  it("rejects a relay whose second link doesn't match the freed shift", () => {
    const r = validateChain({
      targetShiftId: "T",
      chain: [
        { employeeId: "carol", coversShiftId: "T", originalShiftId: "C" },
        { employeeId: "dave", coversShiftId: "T" }, // wrong: should cover C
      ],
      users,
      schedule,
      config,
    });
    assert.equal(r.valid, false);
  });

  it("rejects a chain longer than the hop cap", () => {
    const r = validateChain({
      targetShiftId: "T",
      chain: [
        { employeeId: "alice", coversShiftId: "T" },
        { employeeId: "dave", coversShiftId: "C" },
        { employeeId: "carol", coversShiftId: "C" },
      ],
      users,
      schedule,
      config,
    });
    assert.equal(r.valid, false);
  });
});

describe("coverageOptions", () => {
  const users = [
    user("req", "general", ["Cloud 9"]),
    user("alice", "general", ["Cloud 9"]), // direct
    user("carol", "general", ["Cloud 9"]), // relay candidate (busy)
    user("dave", "general", ["Noc9"]), // can free carol
  ];
  const schedule = [
    shift("T", "req", "08:00", "16:00", "Cloud 9"),
    shift("C", "carol", "10:00", "14:00", "Noc9"),
  ];

  it("separates directly-available coverers from relay options", () => {
    const opts = coverageOptions({ targetShiftId: "T", users, schedule, config });
    // alice and dave are both free general employees who can work the store;
    // carol is busy and only available via a relay.
    assert.deepEqual(
      opts.direct.map((d) => d.employeeId).sort(),
      ["alice", "dave"]
    );
    assert.ok(!opts.direct.some((d) => d.employeeId === "carol"));
    const carol = opts.relays.find((r) => r.employeeId === "carol");
    assert.ok(carol, "carol should be a relay option");
    assert.equal(carol!.conflictShift.id, "C");
    assert.ok(carol!.coverers.some((c) => c.employeeId === "dave"));
  });
});
