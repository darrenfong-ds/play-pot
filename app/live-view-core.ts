export const LIVE_DEVICE_STORAGE_KEY = "play-pot.live-device-id.v1";
export const LIVE_HEARTBEAT_MILLISECONDS = 30_000;
export const LIVE_ACTIVE_MILLISECONDS = 2 * 60_000;
export const LIVE_SESSION_RESET_MILLISECONDS = 6 * 60 * 60_000;
export const LIVE_RETENTION_MILLISECONDS = 12 * 60 * 60_000;

const MAX_FAMILY_PAX = 20;
const MAX_TIME_LIMIT_MINUTES = 120;

type LiveSourceFamily = {
  id: string;
  familyNumber: number;
  adults: number;
  children: number;
  timeLimitMinutes: number;
  visual: string;
  status: "inside" | "completed";
  enteredAt: string;
};

type LiveSourceState = {
  revision: number;
  shift: { id: string };
  families: LiveSourceFamily[];
};

export type LiveFamilyRecord = Pick<
  LiveSourceFamily,
  | "id"
  | "familyNumber"
  | "adults"
  | "children"
  | "timeLimitMinutes"
  | "visual"
  | "enteredAt"
>;

export type LiveSyncPayload = {
  deviceId: string;
  shiftId: string;
  revision: number;
  familyIds: string[];
  insideFamilies: LiveFamilyRecord[];
};

export type LiveDeviceRow = {
  deviceId: string;
  deviceLabel: string;
  shiftId: string;
  clientRevision: number;
  snapshotJson: string;
  seenFamilyIdsJson: string;
  entryCount: number;
  sessionStartedAt: number;
  updatedAt: number;
  expiresAt: number;
};

export type AdminLiveDevice = {
  deviceId: string;
  deviceLabel: string;
  entryCount: number;
  sessionStartedAt: string;
  updatedAt: string;
  active: boolean;
  insideFamilies: LiveFamilyRecord[];
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value))
  );
}

function parseLiveFamily(value: unknown): LiveFamilyRecord | null {
  if (!isRecord(value) || !validId(value.id)) return null;
  if (
    !Number.isSafeInteger(value.familyNumber) ||
    Number(value.familyNumber) < 1 ||
    Number(value.familyNumber) > 100_000 ||
    !Number.isSafeInteger(value.adults) ||
    !Number.isSafeInteger(value.children)
  ) {
    return null;
  }

  const adults = Number(value.adults);
  const children = Number(value.children);
  if (
    adults < 1 ||
    children < 1 ||
    adults + children > MAX_FAMILY_PAX ||
    !Number.isSafeInteger(value.timeLimitMinutes) ||
    Number(value.timeLimitMinutes) < 1 ||
    Number(value.timeLimitMinutes) > MAX_TIME_LIMIT_MINUTES ||
    typeof value.visual !== "string" ||
    value.visual.length > 60 ||
    !validIso(value.enteredAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    familyNumber: Number(value.familyNumber),
    adults,
    children,
    timeLimitMinutes: Number(value.timeLimitMinutes),
    visual: value.visual.trim(),
    enteredAt: value.enteredAt,
  };
}

function parseFamilyIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  if (value.some((familyId) => !validId(familyId))) return null;
  return [...new Set(value as string[])];
}

function parseInsideFamilies(value: unknown): LiveFamilyRecord[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const families = value.map(parseLiveFamily);
  if (families.some((family) => family === null)) return null;
  const parsed = families as LiveFamilyRecord[];
  if (new Set(parsed.map((family) => family.id)).size !== parsed.length) {
    return null;
  }
  return parsed;
}

export function createLiveSyncPayload(
  state: LiveSourceState,
  deviceId: string,
): LiveSyncPayload {
  return {
    deviceId,
    shiftId: state.shift.id,
    revision: state.revision,
    familyIds: state.families.map((family) => family.id),
    insideFamilies: state.families
      .filter((family) => family.status === "inside")
      .map((family) => ({
        id: family.id,
        familyNumber: family.familyNumber,
        adults: family.adults,
        children: family.children,
        timeLimitMinutes: family.timeLimitMinutes,
        visual: family.visual,
        enteredAt: family.enteredAt,
      })),
  };
}

export function parseLiveSyncPayload(value: unknown): LiveSyncPayload | null {
  if (!isRecord(value) || !validId(value.deviceId) || !validId(value.shiftId)) {
    return null;
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    return null;
  }

  const familyIds = parseFamilyIds(value.familyIds);
  const insideFamilies = parseInsideFamilies(value.insideFamilies);
  if (!familyIds || !insideFamilies) return null;
  if (insideFamilies.some((family) => !familyIds.includes(family.id))) {
    return null;
  }

  return {
    deviceId: value.deviceId,
    shiftId: value.shiftId,
    revision: Number(value.revision),
    familyIds,
    insideFamilies,
  };
}

export function liveDeviceLabel(deviceId: string) {
  return `Phone ${deviceId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}`;
}

function readSeenFamilyIds(value: string) {
  try {
    return parseFamilyIds(JSON.parse(value)) ?? [];
  } catch {
    return [];
  }
}

export function mergeLiveDeviceRow(
  existing: LiveDeviceRow | null,
  payload: LiveSyncPayload,
  now = Date.now(),
): LiveDeviceRow {
  const resetsSession =
    !existing ||
    existing.shiftId !== payload.shiftId ||
    now - existing.updatedAt >= LIVE_SESSION_RESET_MILLISECONDS;
  const existingSeen = resetsSession
    ? []
    : readSeenFamilyIds(existing.seenFamilyIdsJson);
  const seen = new Set(existingSeen);
  let entryCount = resetsSession ? 0 : existing.entryCount;
  for (const familyId of payload.familyIds) {
    if (seen.has(familyId)) continue;
    seen.add(familyId);
    entryCount += 1;
  }

  const ignoresStaleSnapshot =
    !resetsSession && payload.revision < existing.clientRevision;

  return {
    deviceId: payload.deviceId,
    deviceLabel: liveDeviceLabel(payload.deviceId),
    shiftId: payload.shiftId,
    clientRevision: ignoresStaleSnapshot
      ? existing.clientRevision
      : payload.revision,
    snapshotJson: ignoresStaleSnapshot
      ? existing.snapshotJson
      : JSON.stringify(payload.insideFamilies),
    seenFamilyIdsJson: JSON.stringify([...seen].slice(-100)),
    entryCount,
    sessionStartedAt: resetsSession ? now : existing.sessionStartedAt,
    updatedAt: now,
    expiresAt: now + LIVE_RETENTION_MILLISECONDS,
  };
}

export function toAdminLiveDevice(
  row: LiveDeviceRow,
  now = Date.now(),
): AdminLiveDevice {
  let insideFamilies: LiveFamilyRecord[] = [];
  try {
    insideFamilies = parseInsideFamilies(JSON.parse(row.snapshotJson)) ?? [];
  } catch {
    insideFamilies = [];
  }

  return {
    deviceId: row.deviceId,
    deviceLabel: row.deviceLabel,
    entryCount: row.entryCount,
    sessionStartedAt: new Date(row.sessionStartedAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    active: now - row.updatedAt <= LIVE_ACTIVE_MILLISECONDS,
    insideFamilies,
  };
}
