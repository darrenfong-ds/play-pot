import { env } from "cloudflare:workers";
import {
  CREATE_LIVE_DEVICE_EXPIRY_INDEX,
  CREATE_LIVE_DEVICE_SNAPSHOTS_TABLE,
  CREATE_LIVE_DEVICE_UPDATED_INDEX,
} from "../db/schema";
import {
  LIVE_RETENTION_MILLISECONDS,
  mergeLiveDeviceRow,
  toAdminLiveDevice,
  type AdminLiveDevice,
  type LiveDeviceRow,
  type LiveSyncPayload,
} from "./live-view-core";

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
};

type DatabaseRow = {
  device_id: string;
  device_label: string;
  shift_id: string;
  client_revision: number;
  snapshot_json: string;
  seen_family_ids_json: string;
  entry_count: number;
  session_started_at: number;
  updated_at: number;
  expires_at: number;
};

function database(): D1Database {
  const binding = (env as Record<string, unknown>).DB;
  if (
    !binding ||
    typeof binding !== "object" ||
    !("prepare" in binding) ||
    !("batch" in binding)
  ) {
    throw new Error("live_storage_unavailable");
  }
  return binding as D1Database;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(CREATE_LIVE_DEVICE_SNAPSHOTS_TABLE),
    db.prepare(CREATE_LIVE_DEVICE_EXPIRY_INDEX),
    db.prepare(CREATE_LIVE_DEVICE_UPDATED_INDEX),
  ]);
}

function fromDatabaseRow(row: DatabaseRow): LiveDeviceRow {
  return {
    deviceId: row.device_id,
    deviceLabel: row.device_label,
    shiftId: row.shift_id,
    clientRevision: Number(row.client_revision),
    snapshotJson: row.snapshot_json,
    seenFamilyIdsJson: row.seen_family_ids_json,
    entryCount: Number(row.entry_count),
    sessionStartedAt: Number(row.session_started_at),
    updatedAt: Number(row.updated_at),
    expiresAt: Number(row.expires_at),
  };
}

async function removeExpired(db: D1Database, now: number) {
  await db
    .prepare("DELETE FROM live_device_snapshots WHERE expires_at <= ?")
    .bind(now)
    .run();
}

export async function saveLiveSnapshot(
  payload: LiveSyncPayload,
  now = Date.now(),
) {
  const db = database();
  await ensureSchema(db);
  await removeExpired(db, now);

  const stored = await db
    .prepare(
      `SELECT device_id, device_label, shift_id, client_revision,
        snapshot_json, seen_family_ids_json, entry_count, session_started_at,
        updated_at, expires_at
       FROM live_device_snapshots
       WHERE device_id = ?`,
    )
    .bind(payload.deviceId)
    .first<DatabaseRow>();
  const next = mergeLiveDeviceRow(
    stored ? fromDatabaseRow(stored) : null,
    payload,
    now,
  );

  await db
    .prepare(
      `INSERT INTO live_device_snapshots (
        device_id, device_label, shift_id, client_revision, snapshot_json,
        seen_family_ids_json, entry_count, session_started_at, updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        device_label = excluded.device_label,
        shift_id = excluded.shift_id,
        client_revision = excluded.client_revision,
        snapshot_json = excluded.snapshot_json,
        seen_family_ids_json = excluded.seen_family_ids_json,
        entry_count = excluded.entry_count,
        session_started_at = excluded.session_started_at,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at`,
    )
    .bind(
      next.deviceId,
      next.deviceLabel,
      next.shiftId,
      next.clientRevision,
      next.snapshotJson,
      next.seenFamilyIdsJson,
      next.entryCount,
      next.sessionStartedAt,
      next.updatedAt,
      next.expiresAt,
    )
    .run();
}

export async function listLiveDevices(
  now = Date.now(),
): Promise<AdminLiveDevice[]> {
  const db = database();
  await ensureSchema(db);
  await removeExpired(db, now);
  const response = await db
    .prepare(
      `SELECT device_id, device_label, shift_id, client_revision,
        snapshot_json, seen_family_ids_json, entry_count, session_started_at,
        updated_at, expires_at
       FROM live_device_snapshots
       WHERE updated_at >= ?
       ORDER BY updated_at DESC`,
    )
    .bind(now - LIVE_RETENTION_MILLISECONDS)
    .all<DatabaseRow>();

  return (response.results ?? []).map((row) =>
    toAdminLiveDevice(fromDatabaseRow(row), now),
  );
}
