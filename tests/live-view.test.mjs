import assert from "node:assert/strict";
import test from "node:test";

test("builds a live mirror with current families but no completed-family details", async () => {
  const local = await import(new URL("../app/play-pot-local.ts", import.meta.url));
  const live = await import(new URL("../app/live-view-core.ts", import.meta.url));
  const start = Date.parse("2026-08-09T04:00:00.000Z");
  let state = local.addLocalFamily(
    local.createInitialState(start, "shift-live-0001"),
    { adults: 1, children: 1, visual: "red shoes" },
    "family-live-0001",
    start,
  );
  state = local.markLocalFamilyOut(state, "family-live-0001", start + 1_000);
  state = local.addLocalFamily(
    state,
    { adults: 2, children: 1, visual: "blue stroller" },
    "family-live-0002",
    start + 2_000,
  );

  const payload = live.createLiveSyncPayload(state, "device-live-0001");
  assert.deepEqual(payload.familyIds, ["family-live-0001", "family-live-0002"]);
  assert.equal(payload.insideFamilies.length, 1);
  assert.equal(payload.insideFamilies[0].id, "family-live-0002");
  assert.equal(payload.insideFamilies[0].visual, "blue stroller");
  assert.doesNotMatch(JSON.stringify(payload.insideFamilies), /red shoes|departedAt/);
  assert.deepEqual(live.parseLiveSyncPayload(payload), payload);

  assert.equal(
    live.parseLiveSyncPayload({ ...payload, deviceId: "bad id" }),
    null,
  );
  assert.equal(
    live.parseLiveSyncPayload({
      ...payload,
      insideFamilies: [{ ...payload.insideFamilies[0], visual: "x".repeat(61) }],
    }),
    null,
  );
});

test("counts unique entries, ignores stale snapshots, and expires device sessions", async () => {
  const live = await import(new URL("../app/live-view-core.ts", import.meta.url));
  const start = Date.parse("2026-08-09T05:00:00.000Z");
  const firstPayload = {
    deviceId: "device-live-0002",
    shiftId: "shift-live-0002",
    revision: 2,
    familyIds: ["family-live-0101", "family-live-0102"],
    insideFamilies: [
      {
        id: "family-live-0102",
        familyNumber: 2,
        adults: 1,
        children: 1,
        timeLimitMinutes: 15,
        visual: "green bag",
        enteredAt: new Date(start).toISOString(),
      },
    ],
  };

  const first = live.mergeLiveDeviceRow(null, firstPayload, start);
  assert.equal(first.entryCount, 2);
  assert.equal(first.deviceLabel, "Phone VE0002");

  const stale = live.mergeLiveDeviceRow(
    first,
    {
      ...firstPayload,
      revision: 1,
      familyIds: [...firstPayload.familyIds, "family-live-0103"],
      insideFamilies: [],
    },
    start + 1_000,
  );
  assert.equal(stale.entryCount, 3);
  assert.equal(stale.clientRevision, 2);
  assert.equal(stale.snapshotJson, first.snapshotJson);

  const activeView = live.toAdminLiveDevice(stale, start + 2_000);
  assert.equal(activeView.active, true);
  assert.equal(activeView.insideFamilies[0].visual, "green bag");
  assert.equal(
    live.toAdminLiveDevice(stale, start + live.LIVE_ACTIVE_MILLISECONDS + 2_000)
      .active,
    false,
  );

  const reset = live.mergeLiveDeviceRow(
    stale,
    {
      ...firstPayload,
      revision: 0,
      familyIds: ["family-live-0201"],
      insideFamilies: [],
    },
    stale.updatedAt + live.LIVE_SESSION_RESET_MILLISECONDS,
  );
  assert.equal(reset.entryCount, 1);
  assert.equal(reset.clientRevision, 0);
  assert.equal(
    reset.expiresAt - reset.updatedAt,
    live.LIVE_RETENTION_MILLISECONDS,
  );
});
