CREATE TABLE IF NOT EXISTS live_device_snapshots (
  device_id TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  client_revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  seen_family_ids_json TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  session_started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_device_snapshots_expires_at
ON live_device_snapshots(expires_at);

CREATE INDEX IF NOT EXISTS idx_live_device_snapshots_updated_at
ON live_device_snapshots(updated_at DESC);

PRAGMA optimize;
