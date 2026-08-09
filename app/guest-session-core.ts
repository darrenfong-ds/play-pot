export const GUEST_SESSION_SECONDS = 60 * 60 * 24 * 30;

export type GuestSessionConfig = {
  pin: string;
  sessionSecret: string;
};

const encoder = new TextEncoder();

function encodeBase64Url(value: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(value)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signingSecret(config: GuestSessionConfig) {
  return `${config.sessionSecret}:${config.pin}`;
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encodeBase64Url(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function pinMatches(value: unknown, config: GuestSessionConfig) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) return false;
  return secretMatches(
    value,
    config.pin,
    `${signingSecret(config)}:pin-check`,
    6,
  );
}

export async function secretMatches(
  value: unknown,
  expected: string,
  comparisonSecret: string,
  minimumLength = 12,
) {
  if (
    typeof value !== "string" ||
    value.length < minimumLength ||
    value.length > 128 ||
    expected.length < minimumLength ||
    expected.length > 128
  ) {
    return false;
  }
  const [actual, expectedSignature] = await Promise.all([
    sign(value, comparisonSecret),
    sign(expected, comparisonSecret),
  ]);
  return safeEqual(actual, expectedSignature);
}

export async function createSessionToken(
  config: GuestSessionConfig,
  now = Math.floor(Date.now() / 1_000),
  sessionSeconds = GUEST_SESSION_SECONDS,
) {
  const expiresAt = now + sessionSeconds;
  const randomBytes = crypto.getRandomValues(new Uint8Array(18));
  const nonce = encodeBase64Url(randomBytes.buffer as ArrayBuffer);
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${await sign(payload, signingSecret(config))}`;
}

export async function sessionTokenIsValid(
  token: string,
  config: GuestSessionConfig,
  now = Math.floor(Date.now() / 1_000),
) {
  const [expiresValue, nonce, signature, ...extra] = token.split(".");
  if (
    extra.length ||
    !/^\d+$/.test(expiresValue ?? "") ||
    !/^[A-Za-z0-9_-]{20,}$/.test(nonce ?? "")
  ) {
    return false;
  }

  const expiresAt = Number(expiresValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  const payload = `${expiresValue}.${nonce}`;
  const expected = await sign(payload, signingSecret(config));
  return safeEqual(signature ?? "", expected);
}
