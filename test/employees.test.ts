import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEmployeeUpdate,
  buildNewEmployee,
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

  it("never suggests a deactivated employee", () => {
    const users = [user("req"), user("active_one"), user("gone", false)];
    const schedule: Shift[] = [
      {
        id: "T",
        employeeId: "req",
        date: "2026-06-28",
        dayOfWeek: "Sun",
        startTime: "08:00",
        endTime: "16:00",
        location: "Cloud 9",
        crossesMidnight: false,
        endsNextDay: false,
      },
    ];
    const { suggestions } = suggestChains({ targetShiftId: "T", users, schedule, config });
    const names = suggestions.flatMap((s) => s.links.map((l) => l.employeeId));
    assert.ok(names.includes("active_one"));
    assert.ok(!names.includes("gone"));
  });
});
