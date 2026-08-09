export const OFFLINE_ACCESS_KEY = "play-pot.offline-access.v1";
export const OFFLINE_ACCESS_MILLISECONDS = 12 * 60 * 60_000;

const OFFLINE_ACCESS_SCHEMA_VERSION = 1;
const SINGAPORE_OFFSET_MILLISECONDS = 8 * 60 * 60_000;

type OfflineAccess = {
  schemaVersion: 1;
  verifiedAt: string;
  singaporeDate: string;
  expiresAt: string;
};

function nextSingaporeMidnight(now: number) {
  const singaporeNow = new Date(now + SINGAPORE_OFFSET_MILLISECONDS);
  const nextMidnightAsUtc = Date.UTC(
    singaporeNow.getUTCFullYear(),
    singaporeNow.getUTCMonth(),
    singaporeNow.getUTCDate() + 1,
  );
  return nextMidnightAsUtc - SINGAPORE_OFFSET_MILLISECONDS;
}

function singaporeDate(now: number) {
  return new Date(now + SINGAPORE_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

export function createOfflineAccess(now = Date.now()): OfflineAccess {
  return {
    schemaVersion: OFFLINE_ACCESS_SCHEMA_VERSION,
    verifiedAt: new Date(now).toISOString(),
    singaporeDate: singaporeDate(now),
    expiresAt: new Date(
      Math.min(now + OFFLINE_ACCESS_MILLISECONDS, nextSingaporeMidnight(now)),
    ).toISOString(),
  };
}

export function readOfflineAccess(
  raw: string | null,
  now = Date.now(),
): OfflineAccess | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OfflineAccess>;
    if (
      value.schemaVersion !== OFFLINE_ACCESS_SCHEMA_VERSION ||
      typeof value.verifiedAt !== "string" ||
      typeof value.singaporeDate !== "string" ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.verifiedAt)) ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      value.singaporeDate !== singaporeDate(Date.parse(value.verifiedAt))
    ) {
      return null;
    }

    const verifiedAt = Date.parse(value.verifiedAt);
    const expiresAt = Date.parse(value.expiresAt);
    const latestAllowedExpiry = Math.min(
      verifiedAt + OFFLINE_ACCESS_MILLISECONDS,
      nextSingaporeMidnight(verifiedAt),
    );
    if (
      verifiedAt > now ||
      expiresAt <= verifiedAt ||
      expiresAt > latestAllowedExpiry ||
      expiresAt <= now ||
      value.singaporeDate !== singaporeDate(now)
    ) {
      return null;
    }

    return {
      schemaVersion: OFFLINE_ACCESS_SCHEMA_VERSION,
      verifiedAt: value.verifiedAt,
      singaporeDate: value.singaporeDate,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
