export const CAPACITY = 15;
export const FLEX_CAPACITY = 20;
export const DEFAULT_TIME_LIMIT_MINUTES = 15;
export const MAX_TIME_LIMIT_MINUTES = 120;
export const PLAY_MILLISECONDS = DEFAULT_TIME_LIMIT_MINUTES * 60_000;
export const UNDO_MILLISECONDS = 10_000;
export const RECENT_OUT_MILLISECONDS = 15 * 60_000;
export const LOCAL_STORAGE_KEY = "play-pot.device-state.v2";
export const LOCAL_STORAGE_BACKUP_KEY = "play-pot.device-state.v2.backup";
export const LEGACY_LOCAL_STORAGE_KEY = "play-pot.device-state.v1";
export const LEGACY_LOCAL_STORAGE_BACKUP_KEY = "play-pot.device-state.v1.backup";

export type Family = {
  id: string;
  familyNumber: number;
  adults: number;
  children: number;
  timeLimitMinutes: number;
  visual: string;
  status: "inside" | "completed";
  createdAt: string;
  enteredAt: string;
  departedAt: string | null;
};

export type PlayPotState = {
  schemaVersion: 2;
  revision: number;
  shift: {
    id: string;
    number: number;
    startedAt: string;
  };
  nextFamilyNumber: number;
  families: Family[];
  undo: {
    familyId: string;
    afterRevision: number;
    expiresAt: string;
  } | null;
  savedAt: string;
};

type LocalStateErrorCode =
  | "invalid_count"
  | "invalid_time_limit"
  | "capacity_exceeded"
  | "delete_unavailable"
  | "family_changed"
  | "restore_unavailable"
  | "undo_unavailable"
  | "active_families";

export class LocalStateError extends Error {
  readonly code: LocalStateErrorCode;

  constructor(code: LocalStateErrorCode, message: string) {
    super(message);
    this.name = "LocalStateError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeCounts(adults: number, children: number) {
  if (
    !Number.isSafeInteger(adults) ||
    !Number.isSafeInteger(children) ||
    adults < 1 ||
    children < 1 ||
    adults + children > FLEX_CAPACITY
  ) {
    throw new LocalStateError(
      "invalid_count",
      `Use at least 1 adult and 1 child, with no more than ${FLEX_CAPACITY} pax.`,
    );
  }
  return { adults, children };
}

function normalizeVisual(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 60);
}

function normalizeTimeLimit(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > MAX_TIME_LIMIT_MINUTES
  ) {
    throw new LocalStateError(
      "invalid_time_limit",
      `Use a time limit from 1 to ${MAX_TIME_LIMIT_MINUTES} minutes.`,
    );
  }
  return Number(value);
}

function parseFamily(value: unknown, schemaVersion: 1 | 2): Family | null {
  if (!isRecord(value)) return null;
  if (value.status !== "inside" && value.status !== "completed") return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (!isSafePositiveInteger(value.familyNumber)) return null;
  if (!Number.isSafeInteger(value.adults) || !Number.isSafeInteger(value.children)) return null;

  try {
    normalizeCounts(Number(value.adults), Number(value.children));
  } catch {
    return null;
  }

  let timeLimitMinutes = DEFAULT_TIME_LIMIT_MINUTES;
  if (schemaVersion === 2 && value.timeLimitMinutes === undefined) return null;
  if (value.timeLimitMinutes !== undefined) {
    try {
      timeLimitMinutes = normalizeTimeLimit(value.timeLimitMinutes);
    } catch {
      return null;
    }
  }

  if (!validIso(value.createdAt) || !validIso(value.enteredAt)) return null;
  if (typeof value.visual !== "string" || value.visual.length > 60) return null;

  if (value.status === "inside" && value.departedAt !== null) return null;
  if (value.status === "completed") {
    if (!validIso(value.departedAt)) return null;
    if (Date.parse(String(value.departedAt)) < Date.parse(String(value.enteredAt))) return null;
  }

  return {
    id: value.id,
    familyNumber: value.familyNumber,
    adults: Number(value.adults),
    children: Number(value.children),
    timeLimitMinutes,
    visual: normalizeVisual(value.visual),
    status: value.status,
    createdAt: value.createdAt as string,
    enteredAt: value.enteredAt as string,
    departedAt: value.departedAt as string | null,
  };
}

function familyIsWithinRecentOutWindow(family: Family, now: number) {
  return (
    family.status === "completed" &&
    family.departedAt !== null &&
    Date.parse(family.departedAt) + RECENT_OUT_MILLISECONDS > now
  );
}

export function createInitialState(
  now = Date.now(),
  shiftId = crypto.randomUUID(),
): PlayPotState {
  const timestamp = new Date(now).toISOString();
  return {
    schemaVersion: 2,
    revision: 0,
    shift: { id: shiftId, number: 1, startedAt: timestamp },
    nextFamilyNumber: 1,
    families: [],
    undo: null,
    savedAt: timestamp,
  };
}

export function readLocalState(raw: string | null, now = Date.now()): PlayPotState | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2)
  ) {
    return null;
  }
  const schemaVersion = value.schemaVersion;
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return null;
  if (!isRecord(value.shift)) return null;
  if (typeof value.shift.id !== "string" || !value.shift.id.trim()) return null;
  if (!isSafePositiveInteger(value.shift.number) || !validIso(value.shift.startedAt)) return null;
  if (!isSafePositiveInteger(value.nextFamilyNumber)) return null;
  if (!Array.isArray(value.families) || !validIso(value.savedAt)) return null;

  const families = value.families.map((family) => parseFamily(family, schemaVersion));
  if (families.some((family) => family === null)) return null;
  const validFamilies = families as Family[];
  const ids = new Set(validFamilies.map((family) => family.id));
  const familyNumbers = new Set(validFamilies.map((family) => family.familyNumber));
  if (ids.size !== validFamilies.length || familyNumbers.size !== validFamilies.length) return null;

  const retainedFamilies = validFamilies.filter(
    (family) =>
      family.status === "inside" || familyIsWithinRecentOutWindow(family, now),
  );

  const highestFamilyNumber = validFamilies.reduce(
    (highest, family) => Math.max(highest, family.familyNumber),
    0,
  );
  const nextFamilyNumber = Math.max(Number(value.nextFamilyNumber), highestFamilyNumber + 1);

  let undo: PlayPotState["undo"] = null;
  if (value.undo !== null) {
    if (!isRecord(value.undo)) return null;
    const candidate = value.undo;
    const matchingFamily = retainedFamilies.find(
      (family) => family.id === candidate.familyId && family.status === "completed",
    );
    if (
      typeof candidate.familyId !== "string" ||
      !Number.isSafeInteger(candidate.afterRevision) ||
      !validIso(candidate.expiresAt)
    ) {
      return null;
    }
    if (
      matchingFamily &&
      candidate.afterRevision === value.revision &&
      Date.parse(candidate.expiresAt as string) >= now
    ) {
      undo = {
        familyId: candidate.familyId,
        afterRevision: candidate.afterRevision as number,
        expiresAt: candidate.expiresAt as string,
      };
    }
  }

  return {
    schemaVersion: 2,
    revision: Number(value.revision),
    shift: {
      id: value.shift.id,
      number: value.shift.number,
      startedAt: value.shift.startedAt as string,
    },
    nextFamilyNumber,
    families: retainedFamilies,
    undo,
    savedAt:
      retainedFamilies.length === validFamilies.length
        ? (value.savedAt as string)
        : new Date(now).toISOString(),
  };
}

export function serializeLocalState(state: PlayPotState) {
  return JSON.stringify(state);
}

export function familyPax(family: Family) {
  return family.adults + family.children;
}

export function insideFamilies(state: PlayPotState) {
  return state.families
    .filter((family) => family.status === "inside")
    .sort(
      (left, right) =>
        Date.parse(left.enteredAt) - Date.parse(right.enteredAt) ||
        left.familyNumber - right.familyNumber,
    );
}

export function completedFamilies(state: PlayPotState) {
  return state.families
    .filter((family) => family.status === "completed")
    .sort(
      (left, right) =>
        Date.parse(right.departedAt ?? "") - Date.parse(left.departedAt ?? "") ||
        right.familyNumber - left.familyNumber,
    );
}

export function recentOutFamilies(state: PlayPotState, now = Date.now()) {
  return completedFamilies(state).filter((family) =>
    familyIsWithinRecentOutWindow(family, now),
  );
}

export function purgeExpiredCompletedFamilies(
  state: PlayPotState,
  now = Date.now(),
): PlayPotState {
  const families = state.families.filter(
    (family) =>
      family.status === "inside" || familyIsWithinRecentOutWindow(family, now),
  );
  if (families.length === state.families.length) return state;

  const retainedIds = new Set(families.map((family) => family.id));
  return {
    ...state,
    families,
    undo:
      state.undo && retainedIds.has(state.undo.familyId) ? state.undo : null,
    savedAt: new Date(now).toISOString(),
  };
}

export function currentPax(state: PlayPotState) {
  return insideFamilies(state).reduce((total, family) => total + familyPax(family), 0);
}

export function spacesLeft(state: PlayPotState) {
  return CAPACITY - currentPax(state);
}

export function flexSpacesLeft(state: PlayPotState) {
  return Math.max(0, FLEX_CAPACITY - currentPax(state));
}

export function familyDueAt(family: Family) {
  return new Date(
    Date.parse(family.enteredAt) + family.timeLimitMinutes * 60_000,
  ).toISOString();
}

export function nextDueLocalFamily(state: PlayPotState) {
  return insideFamilies(state).reduce<Family | null>((earliest, family) => {
    if (!earliest) return family;
    const dueDifference =
      Date.parse(familyDueAt(family)) - Date.parse(familyDueAt(earliest));
    if (dueDifference < 0) return family;
    if (dueDifference === 0 && family.familyNumber < earliest.familyNumber) {
      return family;
    }
    return earliest;
  }, null);
}

function nextRevision(state: PlayPotState) {
  return state.revision + 1;
}

export function addLocalFamily(
  state: PlayPotState,
  details: { adults: number; children: number; visual: string },
  familyId: string,
  now = Date.now(),
  options: { allowFlex?: boolean } = {},
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const counts = normalizeCounts(details.adults, details.children);
  const pax = counts.adults + counts.children;
  const paxBeforeEntry = currentPax(currentState);
  const projectedPax = paxBeforeEntry + pax;
  const approvedFlexEntry =
    options.allowFlex === true &&
    projectedPax > CAPACITY &&
    projectedPax <= FLEX_CAPACITY;
  if (projectedPax > CAPACITY && !approvedFlexEntry) {
    throw new LocalStateError(
      "capacity_exceeded",
      projectedPax <= FLEX_CAPACITY
        ? `That entry would bring the total to ${projectedPax}. Confirm entry above ${CAPACITY} first.`
        : `That entry would exceed the maximum of ${FLEX_CAPACITY} pax.`,
    );
  }
  if (
    !familyId.trim() ||
    currentState.families.some((family) => family.id === familyId)
  ) {
    throw new LocalStateError("family_changed", "That family could not be recorded safely.");
  }

  const timestamp = new Date(now).toISOString();
  const family: Family = {
    id: familyId,
    familyNumber: currentState.nextFamilyNumber,
    ...counts,
    timeLimitMinutes: DEFAULT_TIME_LIMIT_MINUTES,
    visual: normalizeVisual(details.visual),
    status: "inside",
    createdAt: timestamp,
    enteredAt: timestamp,
    departedAt: null,
  };

  return {
    ...currentState,
    revision: nextRevision(currentState),
    nextFamilyNumber: currentState.nextFamilyNumber + 1,
    families: [...currentState.families, family],
    undo: null,
    savedAt: timestamp,
  };
}

export function markLocalFamilyOut(
  state: PlayPotState,
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const family = currentState.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "inside",
  );
  if (!family) {
    throw new LocalStateError("family_changed", "That family is no longer inside.");
  }

  const revision = nextRevision(currentState);
  const timestamp = new Date(now).toISOString();
  return {
    ...currentState,
    revision,
    families: currentState.families.map((candidate) =>
      candidate.id === familyId
        ? { ...candidate, status: "completed" as const, departedAt: timestamp }
        : candidate,
    ),
    undo: {
      familyId,
      afterRevision: revision,
      expiresAt: new Date(now + UNDO_MILLISECONDS).toISOString(),
    },
    savedAt: timestamp,
  };
}

export function restoreLocalFamily(
  state: PlayPotState,
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const undo = currentState.undo;
  const family = currentState.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "completed",
  );
  if (
    !undo ||
    undo.familyId !== familyId ||
    undo.afterRevision !== currentState.revision ||
    Date.parse(undo.expiresAt) < now ||
    !family
  ) {
    throw new LocalStateError("undo_unavailable", "That OUT action can no longer be undone.");
  }
  const timestamp = new Date(now).toISOString();
  return {
    ...currentState,
    revision: nextRevision(currentState),
    families: currentState.families.map((candidate) =>
      candidate.id === familyId
        ? { ...candidate, status: "inside" as const, departedAt: null }
        : candidate,
    ),
    undo: null,
    savedAt: timestamp,
  };
}

export function restoreRecentLocalFamily(
  state: PlayPotState,
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const family = currentState.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "completed",
  );
  if (!family || !familyIsWithinRecentOutWindow(family, now)) {
    throw new LocalStateError(
      "restore_unavailable",
      "That recent OUT record has already been deleted.",
    );
  }

  const timestamp = new Date(now).toISOString();
  return {
    ...currentState,
    revision: nextRevision(currentState),
    families: currentState.families.map((candidate) =>
      candidate.id === familyId
        ? { ...candidate, status: "inside" as const, departedAt: null }
        : candidate,
    ),
    undo: null,
    savedAt: timestamp,
  };
}

export function deleteRecentLocalFamily(
  state: PlayPotState,
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const family = currentState.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "completed",
  );
  if (!family || !familyIsWithinRecentOutWindow(family, now)) {
    throw new LocalStateError(
      "delete_unavailable",
      "That recent OUT record is no longer available to delete.",
    );
  }

  const timestamp = new Date(now).toISOString();
  const revision = nextRevision(currentState);
  return {
    ...currentState,
    revision,
    families: currentState.families.filter(
      (candidate) => candidate.id !== familyId,
    ),
    undo:
      currentState.undo &&
      currentState.undo.familyId !== familyId &&
      Date.parse(currentState.undo.expiresAt) >= now
        ? { ...currentState.undo, afterRevision: revision }
        : null,
    savedAt: timestamp,
  };
}

export function editLocalFamily(
  state: PlayPotState,
  familyId: string,
  details: {
    adults: number;
    children: number;
    visual: string;
    timeLimitMinutes?: number;
  },
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  const family = currentState.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "inside",
  );
  if (!family) {
    throw new LocalStateError("family_changed", "That family is no longer inside.");
  }
  const counts = normalizeCounts(details.adults, details.children);
  const timeLimitMinutes = normalizeTimeLimit(
    details.timeLimitMinutes === undefined
      ? family.timeLimitMinutes
      : details.timeLimitMinutes,
  );
  const timestamp = new Date(now).toISOString();
  return {
    ...currentState,
    revision: nextRevision(currentState),
    families: currentState.families.map((candidate) =>
      candidate.id === familyId
        ? {
            ...candidate,
            ...counts,
            timeLimitMinutes,
            visual: normalizeVisual(details.visual),
          }
        : candidate,
    ),
    undo: null,
    savedAt: timestamp,
  };
}

export function startLocalShift(
  state: PlayPotState,
  shiftId: string,
  now = Date.now(),
): PlayPotState {
  const currentState = purgeExpiredCompletedFamilies(state, now);
  if (insideFamilies(currentState).length) {
    throw new LocalStateError(
      "active_families",
      "Check every family OUT before starting a new shift.",
    );
  }
  const timestamp = new Date(now).toISOString();
  return {
    schemaVersion: 2,
    revision: nextRevision(currentState),
    shift: {
      id: shiftId,
      number: currentState.shift.number + 1,
      startedAt: timestamp,
    },
    nextFamilyNumber: 1,
    families: [],
    undo: null,
    savedAt: timestamp,
  };
}
