import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { materializeWeek, recursOn, shiftsForWeek } from "../lib/recurrence";
import type { RecurrenceMap, Shift } from "../lib/types";

// Seeded template week: Sun 2026-06-28 .. Sat 2026-07-04.
const template: Shift[] = [
  shift("shf_a", "u_quince", "Mon", "Cloud 9", "2026-06-29"),
  shift("shf_b", "u_quince", "Wed", "Cloud 9", "2026-07-01"),
  shift("shf_c", "u_corben", "Tue", "Spearfish", "2026-06-30"),
];

const nextWeek = isoWeek("2026-07-05"); // Sun..Sat 2026-07-05 .. 07-11

function shift(
  id: string,
  employeeId: string,
  dayOfWeek: string,
  location: string,
  date: string
): Shift {
  return {
    id,
    employeeId,
    date,
    dayOfWeek,
    startTime: "09:00",
    endTime: "17:00",
    location,
    crossesMidnight: false,
    endsNextDay: false,
  };
}

function isoWeek(sunday: string): string[] {
  const start = new Date(`${sunday}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

describe("recursOn", () => {
  it("recurs by default when there is no entry", () => {
    assert.equal(recursOn({}, "u_quince", "2026-09-01"), true);
  });

  it("always recurs for a permanent employee", () => {
    const rec: RecurrenceMap = { u_quince: { permanent: true } };
    assert.equal(recursOn(rec, "u_quince", "2030-01-01"), true);
  });

  it("recurs only through the expiration date for a temporary employee", () => {
    const rec: RecurrenceMap = {
      u_corben: { permanent: false, expiresOn: "2026-07-07" },
    };
    assert.equal(recursOn(rec, "u_corben", "2026-07-07"), true); // on the date
    assert.equal(recursOn(rec, "u_corben", "2026-07-06"), true); // before
    assert.equal(recursOn(rec, "u_corben", "2026-07-08"), false); // after
  });
});

describe("materializeWeek", () => {
  it("maps each template shift onto the matching day of the target week", () => {
    const out = materializeWeek(template, nextWeek, {});
    assert.equal(out.length, 3);
    const quinceMon = out.find((s) => s.id.startsWith("shf_a"));
    assert.equal(quinceMon?.date, "2026-07-06"); // Monday of next week
    assert.equal(quinceMon?.recurring, true);
    assert.equal(quinceMon?.employeeId, "u_quince");
  });

  it("drops a temporary employee once the week is past their expiration", () => {
    const rec: RecurrenceMap = {
      u_corben: { permanent: false, expiresOn: "2026-07-04" },
    };
    const out = materializeWeek(template, nextWeek, rec);
    assert.ok(!out.some((s) => s.employeeId === "u_corben"));
    // Permanent/default employee still recurs.
    assert.ok(out.some((s) => s.employeeId === "u_quince"));
  });

  it("keeps a temporary employee for days up to their expiration (partial week)", () => {
    // Expires Tuesday of next week — Corben's Tue shift should still appear,
    // but a hypothetical later-day shift would not.
    const rec: RecurrenceMap = {
      u_corben: { permanent: false, expiresOn: "2026-07-07" },
    };
    const out = materializeWeek(template, nextWeek, rec);
    assert.ok(out.some((s) => s.employeeId === "u_corben" && s.date === "2026-07-07"));
  });

  it("recurs from the original owner when a shift was covered (one-off swap)", () => {
    // An owner-approved swap mutates the concrete shift in place: Corben's Tue
    // shift is now worked by Quince, with the original owner preserved. Future
    // weeks must still recur to Corben, and must not carry coverage metadata.
    const covered: Shift[] = template.map((s) =>
      s.id === "shf_c"
        ? { ...s, employeeId: "u_quince", coveredBy: "u_quince", originalEmployeeId: "u_corben" }
        : s
    );
    const out = materializeWeek(covered, nextWeek, {});
    const tue = out.find((s) => s.id.startsWith("shf_c"));
    assert.equal(tue?.employeeId, "u_corben"); // original owner, not the coverer
    assert.equal(tue?.coveredBy, undefined);
    assert.equal(tue?.originalEmployeeId, undefined);
  });

  it("applies a temporary expiration against the original owner of a covered shift", () => {
    const covered: Shift[] = template.map((s) =>
      s.id === "shf_c"
        ? { ...s, employeeId: "u_quince", coveredBy: "u_quince", originalEmployeeId: "u_corben" }
        : s
    );
    // Corben (the original owner) is temporary and already expired.
    const rec: RecurrenceMap = {
      u_corben: { permanent: false, expiresOn: "2026-07-04" },
    };
    const out = materializeWeek(covered, nextWeek, rec);
    assert.ok(!out.some((s) => s.id.startsWith("shf_c")));
  });
});

describe("shiftsForWeek", () => {
  it("returns concrete shifts when the week has its own", () => {
    const seededWeek = isoWeek("2026-06-28");
    const out = shiftsForWeek(template, template, seededWeek, {});
    // Concrete records returned as-is (not materialized / re-id'd).
    assert.deepEqual(
      out.map((s) => s.id).sort(),
      ["shf_a", "shf_b", "shf_c"]
    );
  });

  it("materializes when the week has no concrete shifts", () => {
    const out = shiftsForWeek(template, template, nextWeek, {});
    assert.ok(out.every((s) => s.recurring === true));
    assert.equal(out.length, 3);
  });
});
