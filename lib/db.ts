// JSON file data layer. Import ONLY from API route handlers — never from
// client or page components. Reads and writes are synchronous; at this scale
// (< 25 employees) a read -> mutate-in-memory -> write-back pattern is fine.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  Location,
  RecurrenceMap,
  Shift,
  SwapConfig,
  SwapRequest,
  User,
} from "./types";

// Overridable via env so deployments can point at a persistent volume
// (see fly.toml / scripts/seed-volume.mjs). Defaults to ./data for local dev.
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");

function readJson<T>(file: string): T {
  const raw = readFileSync(join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

function writeJson<T>(file: string, data: T): void {
  // Always pretty-print to keep the seed files diff-friendly.
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf-8");
}

// --- Users -----------------------------------------------------------------

export function getUsers(): User[] {
  return readJson<User[]>("users.json");
}

export function getUserById(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

export function getUserByUsername(username: string): User | undefined {
  const target = username.trim().toLowerCase();
  return getUsers().find((u) => u.username.toLowerCase() === target);
}

export function saveUsers(users: User[]): void {
  writeJson("users.json", users);
}

// --- Schedule --------------------------------------------------------------

export function getSchedule(): Shift[] {
  return readJson<Shift[]>("schedule.json");
}

export function getShiftById(id: string): Shift | undefined {
  return getSchedule().find((s) => s.id === id);
}

export function saveSchedule(shifts: Shift[]): void {
  writeJson("schedule.json", shifts);
}

// --- Locations -------------------------------------------------------------

export function getLocations(): Location[] {
  return readJson<Location[]>("locations.json");
}

// --- Swap config (read-only) ----------------------------------------------

export function getSwapConfig(): SwapConfig {
  return readJson<SwapConfig>("swap_config.json");
}

// --- Recurrence ------------------------------------------------------------

export function getRecurrence(): RecurrenceMap {
  return readJson<RecurrenceMap>("recurrence.json");
}

export function saveRecurrence(map: RecurrenceMap): void {
  writeJson("recurrence.json", map);
}

// --- Requests --------------------------------------------------------------

export function getRequests(): SwapRequest[] {
  return readJson<SwapRequest[]>("requests.json");
}

export function saveRequests(requests: SwapRequest[]): void {
  writeJson("requests.json", requests);
}
