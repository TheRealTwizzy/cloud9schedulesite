// Shared TypeScript types — mirror the shapes in /data/*.json exactly.

export type Role = "owner" | "employee";
export type Group = "owner" | "general" | "security" | "warehouse" | "overnight";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  group: Group;
  mustSetPassword: boolean;
  hashedPassword: string | null;
  primaryLocations?: string[];
  note?: string;
};

export type Shift = {
  id: string;
  employeeId: string;
  date: string; // ISO 8601 date "2026-06-28"
  dayOfWeek: string; // "Sun" | ... | "Sat"
  startTime: string; // 24h "HH:MM"
  endTime: string; // 24h "HH:MM"
  location: string;
  crossesMidnight: boolean;
  endsNextDay: boolean;
  // Optional coverage metadata written when a time-off request is approved.
  coveredBy?: string;
  originalEmployeeId?: string;
};

export type LocationHours =
  | Record<string, { open: string; close: string } | null>
  | string;

export type Location = {
  id: string;
  name: string;
  color: string;
  hours: LocationHours;
};

export type GroupRule = {
  canSwapWithGroups: Group[];
  canCoverLocations: string[];
  preferredLocations?: string[];
  note?: string;
};

export type SwapConfig = {
  maxChainLength: number;
  maxSuggestions: number;
  groupRules: Record<string, GroupRule>;
  suggestionRankingCriteria: string[];
  approvalFlow: string[];
};

export type ChainStatus = "pending" | "accepted" | "declined";

export type ChainLink = {
  employeeId: string; // who is covering
  coversShiftId: string; // which shift they're taking
  originalShiftId?: string; // their own shift being vacated (if relay)
  status: ChainStatus;
  respondedAt?: string;
};

export type RequestType = "time-off" | "shift-swap";

export type OverallStatus =
  | "pending_employee_approval"
  | "pending_owner_approval"
  | "approved"
  | "declined"
  | "cancelled";

export type SwapRequest = {
  id: string;
  type: RequestType;
  requesterId: string;
  submittedAt: string;
  targetShiftId: string;
  note?: string;
  proposedChain: ChainLink[];
  overallStatus: OverallStatus;
  ownerNote?: string;
  resolvedAt?: string;
};

// A ranked coverage suggestion returned by the swap engine.
export type ChainSuggestion = {
  hops: number; // 1 = direct cover, 2 = one relay
  links: Array<{
    employeeId: string;
    employeeName: string;
    primaryLocations: string[];
    coversShiftId: string;
    coversLocation: string;
    originalShiftId?: string;
  }>;
  locationChanges: number;
  primaryMatch: boolean;
  // True when the first coverer is a security employee taking a store shift —
  // allowed, but ranked last per the group rules.
  securityStore: boolean;
};

// iron-session payload.
export type SessionData = {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  group: Group;
  mustSetPassword: boolean;
  isLoggedIn?: boolean;
};
