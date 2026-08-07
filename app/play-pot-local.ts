export const CAPACITY = 15;
export const PLAY_MILLISECONDS = 15 * 60_000;
export const UNDO_MILLISECONDS = 10_000;
export const LOCAL_STORAGE_KEY = "play-pot.device-state.v1";
export const LOCAL_STORAGE_BACKUP_KEY = "play-pot.device-state.v1.backup";

export type Family = {
  id: string;
  familyNumber: number;
  adults: number;
  children: number;
  visual: string;
  status: "inside" | "completed";
  createdAt: string;
  enteredAt: string;
  departedAt: string | null;
};

export type PlayPotState = {
  schemaVersion: 1;
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
  | "capacity_exceeded"
  | "family_changed"
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
    adults + children > CAPACITY
  ) {
    throw new LocalStateError(
      "invalid_count",
      `Use at least 1 adult and 1 child, with no more than ${CAPACITY} pax.`,
    );
  }
  return { adults, children };
}

function normalizeVisual(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 60);
}

function parseFamily(value: unknown): Family | null {
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
    visual: normalizeVisual(value.visual),
    status: value.status,
    createdAt: value.createdAt as string,
    enteredAt: value.enteredAt as string,
    departedAt: value.departedAt as string | null,
  };
}

export function createInitialState(
  now = Date.now(),
  shiftId = crypto.randomUUID(),
): PlayPotState {
  const timestamp = new Date(now).toISOString();
  return {
    schemaVersion: 1,
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

  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return null;
  if (!isRecord(value.shift)) return null;
  if (typeof value.shift.id !== "string" || !value.shift.id.trim()) return null;
  if (!isSafePositiveInteger(value.shift.number) || !validIso(value.shift.startedAt)) return null;
  if (!isSafePositiveInteger(value.nextFamilyNumber)) return null;
  if (!Array.isArray(value.families) || !validIso(value.savedAt)) return null;

  const families = value.families.map(parseFamily);
  if (families.some((family) => family === null)) return null;
  const validFamilies = families as Family[];
  const ids = new Set(validFamilies.map((family) => family.id));
  const familyNumbers = new Set(validFamilies.map((family) => family.familyNumber));
  if (ids.size !== validFamilies.length || familyNumbers.size !== validFamilies.length) return null;

  const highestFamilyNumber = validFamilies.reduce(
    (highest, family) => Math.max(highest, family.familyNumber),
    0,
  );
  const nextFamilyNumber = Math.max(Number(value.nextFamilyNumber), highestFamilyNumber + 1);

  let undo: PlayPotState["undo"] = null;
  if (value.undo !== null) {
    if (!isRecord(value.undo)) return null;
    const candidate = value.undo;
    const matchingFamily = validFamilies.find(
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
    schemaVersion: 1,
    revision: Number(value.revision),
    shift: {
      id: value.shift.id,
      number: value.shift.number,
      startedAt: value.shift.startedAt as string,
    },
    nextFamilyNumber,
    families: validFamilies,
    undo,
    savedAt: value.savedAt as string,
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
        Date.parse(right.departedAt ?? "") - Date.parse(left.departedAt ?? ""),
    );
}

export function currentPax(state: PlayPotState) {
  return insideFamilies(state).reduce((total, family) => total + familyPax(family), 0);
}

export function spacesLeft(state: PlayPotState) {
  return CAPACITY - currentPax(state);
}

export function familyDueAt(family: Family) {
  return new Date(Date.parse(family.enteredAt) + PLAY_MILLISECONDS).toISOString();
}

function nextRevision(state: PlayPotState) {
  return state.revision + 1;
}

export function addLocalFamily(
  state: PlayPotState,
  details: { adults: number; children: number; visual: string },
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const counts = normalizeCounts(details.adults, details.children);
  const pax = counts.adults + counts.children;
  if (currentPax(state) + pax > CAPACITY) {
    throw new LocalStateError(
      "capacity_exceeded",
      `That family needs ${pax} spaces. Only ${Math.max(0, spacesLeft(state))} remain.`,
    );
  }
  if (!familyId.trim() || state.families.some((family) => family.id === familyId)) {
    throw new LocalStateError("family_changed", "That family could not be recorded safely.");
  }

  const timestamp = new Date(now).toISOString();
  const family: Family = {
    id: familyId,
    familyNumber: state.nextFamilyNumber,
    ...counts,
    visual: normalizeVisual(details.visual),
    status: "inside",
    createdAt: timestamp,
    enteredAt: timestamp,
    departedAt: null,
  };

  return {
    ...state,
    revision: nextRevision(state),
    nextFamilyNumber: state.nextFamilyNumber + 1,
    families: [...state.families, family],
    undo: null,
    savedAt: timestamp,
  };
}

export function markLocalFamilyOut(
  state: PlayPotState,
  familyId: string,
  now = Date.now(),
): PlayPotState {
  const family = state.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "inside",
  );
  if (!family) {
    throw new LocalStateError("family_changed", "That family is no longer inside.");
  }

  const revision = nextRevision(state);
  const timestamp = new Date(now).toISOString();
  return {
    ...state,
    revision,
    families: state.families.map((candidate) =>
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
  const undo = state.undo;
  const family = state.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "completed",
  );
  if (
    !undo ||
    undo.familyId !== familyId ||
    undo.afterRevision !== state.revision ||
    Date.parse(undo.expiresAt) < now ||
    !family
  ) {
    throw new LocalStateError("undo_unavailable", "That OUT action can no longer be undone.");
  }
  if (currentPax(state) + familyPax(family) > CAPACITY) {
    throw new LocalStateError(
      "capacity_exceeded",
      "Undo would exceed 15 pax. Correct the live count first.",
    );
  }

  const timestamp = new Date(now).toISOString();
  return {
    ...state,
    revision: nextRevision(state),
    families: state.families.map((candidate) =>
      candidate.id === familyId
        ? { ...candidate, status: "inside" as const, departedAt: null }
        : candidate,
    ),
    undo: null,
    savedAt: timestamp,
  };
}

export function editLocalFamily(
  state: PlayPotState,
  familyId: string,
  details: { adults: number; children: number; visual: string },
  now = Date.now(),
): PlayPotState {
  const family = state.families.find(
    (candidate) => candidate.id === familyId && candidate.status === "inside",
  );
  if (!family) {
    throw new LocalStateError("family_changed", "That family is no longer inside.");
  }
  const counts = normalizeCounts(details.adults, details.children);
  const timestamp = new Date(now).toISOString();
  return {
    ...state,
    revision: nextRevision(state),
    families: state.families.map((candidate) =>
      candidate.id === familyId
        ? { ...candidate, ...counts, visual: normalizeVisual(details.visual) }
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
  if (insideFamilies(state).length) {
    throw new LocalStateError(
      "active_families",
      "Check every family OUT before starting a new shift.",
    );
  }
  const timestamp = new Date(now).toISOString();
  return {
    schemaVersion: 1,
    revision: nextRevision(state),
    shift: {
      id: shiftId,
      number: state.shift.number + 1,
      startedAt: timestamp,
    },
    nextFamilyNumber: 1,
    families: [],
    undo: null,
    savedAt: timestamp,
  };
}
