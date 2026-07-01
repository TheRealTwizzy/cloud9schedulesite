// Employee-management helpers. Pure and I/O-free so they can be unit-tested;
// the API routes pass in the current data.

import type { Group, Location, Shift, User } from "./types";

// Groups an owner can assign (everything except the owner's own group).
export const EMPLOYEE_GROUPS: Group[] = [
  "general",
  "security",
  "warehouse",
  "overnight",
];

// Normalize a display name / username into a safe username slug.
export function slugifyUsername(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isActive(user: Pick<User, "active">): boolean {
  return user.active !== false;
}

export type NewEmployeeInput = {
  displayName?: string;
  username?: string;
  group?: string;
  primaryLocations?: string[];
};

export type ValidationResult =
  | { valid: true; user: User }
  | { valid: false; error: string };

// Validate owner-supplied fields and build a ready-to-store User. New accounts
// always start with `mustSetPassword` so the employee sets their own password.
export function buildNewEmployee(
  input: NewEmployeeInput,
  existing: User[],
  locations: Location[]
): ValidationResult {
  const displayName = (input.displayName ?? "").trim();
  if (!displayName) return { valid: false, error: "A display name is required." };

  const username = slugifyUsername(input.username || displayName);
  if (!username) {
    return { valid: false, error: "Could not derive a valid username." };
  }
  if (existing.some((u) => u.username.toLowerCase() === username)) {
    return { valid: false, error: `Username "${username}" is already taken.` };
  }

  const group = input.group as Group;
  if (!EMPLOYEE_GROUPS.includes(group)) {
    return { valid: false, error: "Choose a valid group." };
  }

  const known = new Set(locations.map((l) => l.name));
  const primaryLocations = input.primaryLocations ?? [];
  const bad = primaryLocations.find((loc) => !known.has(loc));
  if (bad) {
    return { valid: false, error: `Unknown location: ${bad}.` };
  }

  const id = `usr_${username}`;
  if (existing.some((u) => u.id === id)) {
    return { valid: false, error: `An account with id ${id} already exists.` };
  }

  return {
    valid: true,
    user: {
      id,
      username,
      displayName,
      role: "employee",
      group,
      primaryLocations,
      mustSetPassword: true,
      hashedPassword: null,
      active: true,
    },
  };
}

// Schedule after deleting an employee. Shifts the employee *owns* (their
// recurring pattern) are removed; shifts they only *cover* for someone else
// (via an approved swap) are reverted to the original owner so that owner's
// pattern is preserved rather than deleted along with the coverer.
export function cascadeDeleteShifts(
  schedule: Shift[],
  deletedId: string
): Shift[] {
  const kept: Shift[] = [];
  for (const shift of schedule) {
    const owner = shift.originalEmployeeId ?? shift.employeeId;
    if (owner === deletedId) continue; // owned by the deleted employee → drop
    if (shift.employeeId === deletedId) {
      // Only a coverer → hand the shift back to its original owner.
      const { coveredBy, originalEmployeeId, ...base } = shift;
      void coveredBy;
      kept.push({ ...base, employeeId: originalEmployeeId ?? shift.employeeId });
    } else {
      kept.push(shift);
    }
  }
  return kept;
}

export type EmployeeUpdate = {
  displayName?: string;
  group?: string;
  primaryLocations?: string[];
  active?: boolean;
};

// Apply owner edits to an existing user, validating each provided field.
export function applyEmployeeUpdate(
  user: User,
  update: EmployeeUpdate,
  locations: Location[]
): ValidationResult {
  const next: User = { ...user };

  if (update.displayName !== undefined) {
    const name = update.displayName.trim();
    if (!name) return { valid: false, error: "Display name cannot be empty." };
    next.displayName = name;
  }

  if (update.group !== undefined) {
    if (!EMPLOYEE_GROUPS.includes(update.group as Group)) {
      return { valid: false, error: "Choose a valid group." };
    }
    next.group = update.group as Group;
  }

  if (update.primaryLocations !== undefined) {
    const known = new Set(locations.map((l) => l.name));
    const bad = update.primaryLocations.find((loc) => !known.has(loc));
    if (bad) return { valid: false, error: `Unknown location: ${bad}.` };
    next.primaryLocations = update.primaryLocations;
  }

  if (update.active !== undefined) {
    next.active = update.active;
  }

  return { valid: true, user: next };
}
