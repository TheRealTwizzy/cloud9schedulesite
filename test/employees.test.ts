import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEmployeeUpdate,
  buildNewEmployee,
  cascadeDeleteShifts,
  slugifyUsername,
} from "../lib/employees";
import { suggestChains } from "../lib/swapEngine";
import type { Location, Shift, SwapConfig, User } from "../lib/types";

const locations: Location[] = [
  { id: "loc_cloud9", name: "Cloud 9", color: "#000", hours: "24/7" },
  { id: "loc_noc9", name: "Noc9", color: "#000", hours: "24/7" },
  { id: "loc_wh", name: "Warehouse", color: "#000", hours: "24/7" },
];

function user(id: string, active?: boolean): User {
  return {
    id,
    username: id,
    displayName: id,
    role: "employee",
    group: "general",
    mustSetPassword: false,
    hashedPassword: "x",
    primaryLocations: ["Cloud 9"],
    active,
  };
}

describe("slugifyUsername", () => {
  it("lowercases and strips non-alphanumerics", () => {
    assert.equal(slugifyUsername("  José O'Brien "), "josobrien");
    assert.equal(slugifyUsername("Anna Lee"), "annalee");
  });
});

describe("buildNewEmployee", () => {
  const existing = [user("usr_quince")];

  it("builds a first-login employee from valid input", () => {
    const r = buildNewEmployee(
      { displayName: "Anna Lee", group: "general", primaryLocations: ["Cloud 9"] },
      existing,
      locations
    );
    assert.equal(r.valid, true);
    if (r.valid) {
      assert.equal(r.user.id, "usr_annalee");
      assert.equal(r.user.mustSetPassword, true);
      assert.equal(r.user.hashedPassword, null);
      assert.equal(r.user.active, true);
    }
  });

  it("rejects a duplicate username", () => {
    const r = buildNewEmployee(
      { displayName: "Quince", username: "quince", group: "general" },
      [{ ...user("usr_quince"), username: "quince" }],
      locations
    );
    assert.equal(r.valid, false);
  });

  it("rejects an invalid group and an unknown location", () => {
    assert.equal(
      buildNewEmployee({ displayName: "X", group: "owner" }, [], locations).valid,
      false
    );
    assert.equal(
      buildNewEmployee(
        { displayName: "X", group: "general", primaryLocations: ["Mars"] },
        [],
        locations
      ).valid,
      false
    );
  });
});

describe("applyEmployeeUpdate", () => {
  it("updates provided fields and leaves others untouched", () => {
    const r = applyEmployeeUpdate(user("usr_x"), { displayName: "New", active: false }, locations);
    assert.equal(r.valid, true);
    if (r.valid) {
      assert.equal(r.user.displayName, "New");
      assert.equal(r.user.active, false);
      assert.equal(r.user.group, "general"); // unchanged
    }
  });

  it("rejects an empty display name", () => {
    assert.equal(applyEmployeeUpdate(user("x"), { displayName: "  " }, locations).valid, false);
  });
});

describe("cascadeDeleteShifts", () => {
  it("removes shifts the deleted employee owns", () => {
    const schedule: Shift[] = [
      { id: "s1", employeeId: "x", date: "2026-06-29", dayOfWeek: "Mon", startTime: "09:00", endTime: "17:00", location: "Cloud 9", crossesMidnight: false, endsNextDay: false },
      { id: "s2", employeeId: "y", date: "2026-06-29", dayOfWeek: "Mon", startTime: "09:00", endTime: "17:00", location: "Noc9", crossesMidnight: false, endsNextDay: false },
    ];
    const out = cascadeDeleteShifts(schedule, "x");
    assert.deepEqual(out.map((s) => s.id), ["s2"]);
  });

  it("reverts a shift the deleted employee only covered back to its owner", () => {
    // y owns s1 but x is currently covering it (approved swap).
    const schedule: Shift[] = [
      { id: "s1", employeeId: "x", originalEmployeeId: "y", coveredBy: "x", date: "2026-06-29", dayOfWeek: "Mon", startTime: "09:00", endTime: "17:00", location: "Cloud 9", crossesMidnight: false, endsNextDay: false },
    ];
    const out = cascadeDeleteShifts(schedule, "x");
    assert.equal(out.length, 1);
    assert.equal(out[0].employeeId, "y"); // reverted to owner
    assert.equal(out[0].originalEmployeeId, undefined); // coverage metadata cleared
    assert.equal(out[0].coveredBy, undefined);
  });

  it("removes an owned shift even when it is currently covered by someone else", () => {
    // x owns s1, temporarily covered by z. Deleting x removes it.
    const schedule: Shift[] = [
      { id: "s1", employeeId: "z", originalEmployeeId: "x", coveredBy: "z", date: "2026-06-29", dayOfWeek: "Mon", startTime: "09:00", endTime: "17:00", location: "Cloud 9", crossesMidnight: false, endsNextDay: false },
    ];
    assert.equal(cascadeDeleteShifts(schedule, "x").length, 0);
  });
});

describe("swap engine excludes inactive employees", () => {
  const config: SwapConfig = {
    maxChainLength: 2,
    maxSuggestions: 3,
    groupRules: {
      overnight: { canSwapWithGroups: [], canCoverLocations: [] },
      warehouse: { canSwapWithGroups: ["warehouse"], canCoverLocations: ["Warehouse"] },
      security: { canSwapWithGroups: ["security", "general"], canCoverLocations: ["Cloud 9"] },
      general: { canSwapWithGroups: ["general"], canCoverLocations: ["Cloud 9", "Noc9"] },
    },
    suggestionRankingCriteria: [],
    approvalFlow: [],
  };

  function shiftAt(
    id: string,
    employeeId: string,
    location: string,
    start = "08:00",
    end = "16:00"
  ): Shift {
    return {
      id,
      employeeId,
      date: "2026-06-28",
      dayOfWeek: "Sun",
      startTime: start,
      endTime: end,
      location,
      crossesMidnight: false,
      endsNextDay: false,
    };
  }

  it("never suggests a deactivated employee as a direct coverer", () => {
    const users = [user("req"), user("active_one"), user("gone", false)];
    const schedule = [shiftAt("T", "req", "Cloud 9")];
    const { suggestions } = suggestChains({ targetShiftId: "T", users, schedule, config });
    const ids = suggestions.flatMap((s) => s.links.map((l) => l.employeeId));
    assert.ok(ids.includes("active_one"));
    assert.ok(!ids.includes("gone"));
  });

  it("never suggests a deactivated employee as a relay (second) coverer", () => {
    // busy can cover the target but is occupied; only the inactive employee
    // could free them, so no valid chain should be produced.
    const busy = { ...user("busy"), primaryLocations: ["Cloud 9"] };
    const gone = { ...user("gone", false), primaryLocations: ["Noc9"] };
    const users = [user("req"), busy, gone];
    const schedule = [
      shiftAt("T", "req", "Cloud 9"),
      shiftAt("Bshift", "busy", "Noc9"), // busy overlaps the target
    ];
    const { suggestions } = suggestChains({ targetShiftId: "T", users, schedule, config });
    const ids = suggestions.flatMap((s) => s.links.map((l) => l.employeeId));
    assert.ok(!ids.includes("gone"));
  });
});
