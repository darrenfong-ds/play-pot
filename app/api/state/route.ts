import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const CAPACITY = 15;
const PLAY_MINUTES = 15;

type Mode = "quiet" | "busy";
type AgeStatus = "unchecked" | "under4" | "4plus";
type FamilyStatus = "waiting" | "inside" | "completed" | "left_queue";

type ShiftRow = {
  id: number;
  started_at: string;
  ended_at: string | null;
  mode: Mode;
};

type FamilyRow = {
  id: number;
  shift_id: number;
  family_number: number;
  operation_id: string;
  adults: number;
  children: number;
  visual: string;
  age_status: AgeStatus;
  status: FamilyStatus;
  created_at: string;
  queued_at: string | null;
  entered_at: string | null;
  due_at: string | null;
  departed_at: string | null;
};

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    mode TEXT NOT NULL DEFAULT 'quiet' CHECK (mode IN ('quiet', 'busy'))
  )`,
  `CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shifts(id),
    family_number INTEGER NOT NULL,
    operation_id TEXT NOT NULL UNIQUE,
    adults INTEGER NOT NULL CHECK (adults >= 1),
    children INTEGER NOT NULL CHECK (children >= 1),
    visual TEXT NOT NULL DEFAULT '',
    age_status TEXT NOT NULL DEFAULT 'unchecked'
      CHECK (age_status IN ('unchecked', 'under4', '4plus')),
    status TEXT NOT NULL
      CHECK (status IN ('waiting', 'inside', 'completed', 'left_queue')),
    created_at TEXT NOT NULL,
    queued_at TEXT,
    entered_at TEXT,
    due_at TEXT,
    departed_at TEXT,
    UNIQUE (shift_id, family_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shifts_active ON shifts(ended_at)`,
  `CREATE INDEX IF NOT EXISTS idx_families_shift_status_entered
    ON families(shift_id, status, entered_at)`,
  `CREATE INDEX IF NOT EXISTS idx_families_shift_status_queued
    ON families(shift_id, status, queued_at)`,
];

function getD1() {
  if (!env.DB) {
    throw new ApiError(503, "database_unavailable", "Play Pot storage is unavailable.");
  }
  return env.DB;
}

async function ensureSchema() {
  const db = getD1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare("PRAGMA optimize").run();

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO shifts (started_at, mode)
       SELECT ?, 'quiet'
       WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE ended_at IS NULL)`,
    )
    .bind(now)
    .run();
}

async function getCurrentShift() {
  const shift = await getD1()
    .prepare(
      `SELECT id, started_at, ended_at, mode
       FROM shifts
       WHERE ended_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
    )
    .first<ShiftRow>();

  if (!shift) {
    throw new ApiError(500, "shift_missing", "No active Play Pot shift exists.");
  }
  return shift;
}

function toFamily(row: FamilyRow) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    familyNumber: row.family_number,
    adults: row.adults,
    children: row.children,
    pax: row.adults + row.children,
    visual: row.visual,
    ageStatus: row.age_status,
    status: row.status,
    createdAt: row.created_at,
    queuedAt: row.queued_at,
    enteredAt: row.entered_at,
    dueAt: row.due_at,
    departedAt: row.departed_at,
  };
}

async function getSnapshot() {
  const db = getD1();
  const shift = await getCurrentShift();
  const familyResult = await db
    .prepare(
      `SELECT id, shift_id, family_number, operation_id, adults, children, visual, age_status,
              status, created_at, queued_at, entered_at, due_at, departed_at
       FROM families
       WHERE shift_id = ?
       ORDER BY family_number ASC`,
    )
    .bind(shift.id)
    .all<FamilyRow>();

  const families = familyResult.results.map(toFamily);
  const inside = families
    .filter((family) => family.status === "inside")
    .sort((a, b) => (a.enteredAt ?? "").localeCompare(b.enteredAt ?? ""));
  const waiting = families
    .filter((family) => family.status === "waiting")
    .sort((a, b) => (a.queuedAt ?? "").localeCompare(b.queuedAt ?? ""));
  const history = families
    .filter(
      (family) =>
        family.status === "completed" || family.status === "left_queue",
    )
    .sort((a, b) => (b.departedAt ?? "").localeCompare(a.departedAt ?? ""));
  const currentPax = inside.reduce((sum, family) => sum + family.pax, 0);

  return {
    capacity: CAPACITY,
    currentPax,
    spacesLeft: CAPACITY - currentPax,
    mode: shift.mode,
    shift: {
      id: shift.id,
      startedAt: shift.started_at,
    },
    inside,
    waiting,
    history,
    serverTime: new Date().toISOString(),
  };
}

function readPositiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > CAPACITY) {
    throw new ApiError(400, "invalid_count", `${field} must be between 1 and 15.`);
  }
  return number;
}

function readFamilyId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "invalid_family", "Choose a valid family.");
  }
  return id;
}

function readAgeStatus(value: unknown): AgeStatus {
  if (value === "under4" || value === "4plus") return value;
  return "unchecked";
}

function cleanVisual(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

async function addFamily(payload: Record<string, unknown>) {
  const adults = readPositiveInteger(payload.adults, "Adults");
  const children = readPositiveInteger(payload.children, "Children");
  const pax = adults + children;
  if (pax > CAPACITY) {
    throw new ApiError(400, "family_too_large", "This family is larger than the full 15-person capacity.");
  }

  const ageStatus = readAgeStatus(payload.ageStatus);
  if (ageStatus === "4plus") {
    throw new ApiError(409, "age_ineligible", "Marked 4+. Check with staff before admission.");
  }

  const placement = payload.placement === "waiting" ? "waiting" : "inside";
  const visual = cleanVisual(payload.visual);
  const shift = await getCurrentShift();
  const db = getD1();
  const operationId =
    typeof payload.operationId === "string" ? payload.operationId.slice(0, 80) : "";
  if (!operationId) {
    throw new ApiError(400, "operation_missing", "This admission is missing its operation ID.");
  }

  const existing = await db
    .prepare(
      `SELECT id, shift_id, family_number, operation_id, adults, children, visual,
              age_status, status, created_at, queued_at, entered_at, due_at, departed_at
       FROM families WHERE operation_id = ? LIMIT 1`,
    )
    .bind(operationId)
    .first<FamilyRow>();
  if (existing) return existing;

  const now = new Date().toISOString();
  const due = new Date(Date.now() + PLAY_MINUTES * 60_000).toISOString();

  const statement =
    placement === "inside"
      ? db.prepare(
          `INSERT INTO families (
             shift_id, family_number, operation_id, adults, children, visual, age_status,
             status, created_at, queued_at, entered_at, due_at
           )
           SELECT
             s.id,
             (SELECT COALESCE(MAX(f.family_number), 0) + 1
                FROM families f WHERE f.shift_id = s.id),
             ?, ?, ?, ?, ?, 'inside', ?, NULL, ?, ?
           FROM shifts s
           WHERE s.id = ?
             AND s.ended_at IS NULL
             AND ? <= ${CAPACITY} - COALESCE((
               SELECT SUM(f2.adults + f2.children)
               FROM families f2
               WHERE f2.shift_id = s.id AND f2.status = 'inside'
             ), 0)
           RETURNING *`,
        )
      : db.prepare(
          `INSERT INTO families (
             shift_id, family_number, operation_id, adults, children, visual, age_status,
             status, created_at, queued_at, entered_at, due_at
           )
           SELECT
             s.id,
             (SELECT COALESCE(MAX(f.family_number), 0) + 1
                FROM families f WHERE f.shift_id = s.id),
             ?, ?, ?, ?, ?, 'waiting', ?, ?, NULL, NULL
           FROM shifts s
           WHERE s.id = ? AND s.ended_at IS NULL
           RETURNING *`,
        );

  const result =
    placement === "inside"
      ? await statement
          .bind(operationId, adults, children, visual, ageStatus, now, now, due, shift.id, pax)
          .all<FamilyRow>()
      : await statement
          .bind(operationId, adults, children, visual, ageStatus, now, now, shift.id)
          .all<FamilyRow>();

  const row = result.results[0];
  if (!row) {
    if (placement === "inside") {
      throw new ApiError(
        409,
        "capacity",
        `Cannot admit ${pax} pax. The 15-person limit would be exceeded.`,
      );
    }
    throw new ApiError(409, "shift_changed", "The active shift changed. Try again.");
  }
  return row;
}

async function editFamilyDetails(
  id: number,
  adultsValue: unknown,
  childrenValue: unknown,
  visualValue: unknown,
) {
  const adults = readPositiveInteger(adultsValue, "Adults");
  const children = readPositiveInteger(childrenValue, "Children");
  if (adults + children > CAPACITY) {
    throw new ApiError(400, "family_too_large", "This family is larger than the full 15-person capacity.");
  }

  const shift = await getCurrentShift();
  const visual = cleanVisual(visualValue);
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET adults = ?, children = ?, visual = ?
       WHERE id = ? AND shift_id = ? AND status IN ('inside', 'waiting')
       RETURNING *`,
    )
    .bind(adults, children, visual, id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) throw new ApiError(409, "family_changed", "That family can no longer be edited.");
  return row;
}

async function moveWaitingFamilyInside(id: number) {
  const shift = await getCurrentShift();
  const now = new Date().toISOString();
  const due = new Date(Date.now() + PLAY_MINUTES * 60_000).toISOString();
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET status = 'inside', entered_at = ?, due_at = ?
       WHERE id = ?
         AND shift_id = ?
         AND status = 'waiting'
         AND id = (
           SELECT id FROM families
           WHERE shift_id = ? AND status = 'waiting'
           ORDER BY queued_at ASC, id ASC
           LIMIT 1
         )
         AND (adults + children) <= ${CAPACITY} - COALESCE((
           SELECT SUM(f2.adults + f2.children)
           FROM families f2
           WHERE f2.shift_id = ? AND f2.status = 'inside'
         ), 0)
       RETURNING *`,
    )
    .bind(now, due, id, shift.id, shift.id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) {
    throw new ApiError(
      409,
      "queue_or_capacity",
      "The first waiting family cannot enter yet. Capacity or queue order changed.",
    );
  }
  return row;
}

async function markInsideFamilyOut(id: number) {
  const shift = await getCurrentShift();
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET status = 'completed', departed_at = ?
       WHERE id = ? AND shift_id = ? AND status = 'inside'
       RETURNING *`,
    )
    .bind(new Date().toISOString(), id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) throw new ApiError(409, "family_changed", "That family is no longer inside.");
  return row;
}

async function markWaitingFamilyLeft(id: number) {
  const shift = await getCurrentShift();
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET status = 'left_queue', departed_at = ?
       WHERE id = ? AND shift_id = ? AND status = 'waiting'
       RETURNING *`,
    )
    .bind(new Date().toISOString(), id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) throw new ApiError(409, "family_changed", "That family is no longer waiting.");
  return row;
}

async function restoreInsideFamily(id: number) {
  const shift = await getCurrentShift();
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET status = 'inside', departed_at = NULL
       WHERE id = ?
         AND shift_id = ?
         AND status = 'completed'
         AND entered_at IS NOT NULL
         AND (adults + children) <= ${CAPACITY} - COALESCE((
           SELECT SUM(f2.adults + f2.children)
           FROM families f2
           WHERE f2.shift_id = ? AND f2.status = 'inside'
         ), 0)
       RETURNING *`,
    )
    .bind(id, shift.id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) {
    throw new ApiError(409, "undo_capacity", "Undo would exceed the 15-person limit.");
  }
  return row;
}

async function restoreWaitingFamily(id: number) {
  const shift = await getCurrentShift();
  const result = await getD1()
    .prepare(
      `UPDATE families
       SET status = 'waiting', departed_at = NULL
       WHERE id = ? AND shift_id = ? AND status = 'left_queue'
       RETURNING *`,
    )
    .bind(id, shift.id)
    .all<FamilyRow>();

  const row = result.results[0];
  if (!row) throw new ApiError(409, "family_changed", "That queue record cannot be restored.");
  return row;
}

async function setMode(value: unknown) {
  const mode: Mode = value === "busy" ? "busy" : "quiet";
  const shift = await getCurrentShift();
  await getD1()
    .prepare("UPDATE shifts SET mode = ? WHERE id = ? AND ended_at IS NULL")
    .bind(mode, shift.id)
    .run();
}

async function startNewShift() {
  const shift = await getCurrentShift();
  const active = await getD1()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM families
       WHERE shift_id = ? AND status IN ('inside', 'waiting')`,
    )
    .bind(shift.id)
    .first<{ count: number }>();

  if ((active?.count ?? 0) > 0) {
    throw new ApiError(
      409,
      "shift_not_empty",
      "Check out or remove every family before starting a new shift.",
    );
  }

  const now = new Date().toISOString();
  const db = getD1();
  await db.batch([
    db.prepare("UPDATE shifts SET ended_at = ? WHERE id = ?").bind(now, shift.id),
    db.prepare("INSERT INTO shifts (started_at, mode) VALUES (?, ?)").bind(
      now,
      shift.mode,
    ),
  ]);
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json(
    { error: "Play Pot could not update. Please try again.", detail: message },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await ensureSchema();
    return Response.json(await getSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const payload = (await request.json()) as Record<string, unknown>;
    let affected: ReturnType<typeof toFamily> | null = null;

    switch (payload.type) {
      case "add":
        affected = toFamily(await addFamily(payload));
        break;
      case "enterWaiting":
        affected = toFamily(await moveWaitingFamilyInside(readFamilyId(payload.id)));
        break;
      case "out":
        affected = toFamily(await markInsideFamilyOut(readFamilyId(payload.id)));
        break;
      case "leaveQueue":
        affected = toFamily(await markWaitingFamilyLeft(readFamilyId(payload.id)));
        break;
      case "restoreInside":
        affected = toFamily(await restoreInsideFamily(readFamilyId(payload.id)));
        break;
      case "restoreWaiting":
        affected = toFamily(await restoreWaitingFamily(readFamilyId(payload.id)));
        break;
      case "editFamily":
        affected = toFamily(
          await editFamilyDetails(
            readFamilyId(payload.id),
            payload.adults,
            payload.children,
            payload.visual,
          ),
        );
        break;
      case "setMode":
        await setMode(payload.mode);
        break;
      case "newShift":
        await startNewShift();
        break;
      default:
        throw new ApiError(400, "invalid_action", "Choose a valid Play Pot action.");
    }

    return Response.json({ state: await getSnapshot(), affected });
  } catch (error) {
    return errorResponse(error);
  }
}
