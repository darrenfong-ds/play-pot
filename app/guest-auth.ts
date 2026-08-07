import { env } from "cloudflare:workers";
import {
  createSessionToken,
  GUEST_SESSION_SECONDS,
  pinMatches,
  sessionTokenIsValid,
  type GuestSessionConfig,
} from "./guest-session-core";

const SECURE_COOKIE_NAME = "__Host-play_pot_session";
const LOCAL_COOKIE_NAME = "play_pot_session";

type GuestRuntimeEnv = {
  PLAY_POT_GUEST_PIN?: string;
  PLAY_POT_SESSION_SECRET?: string;
};

function getGuestConfig(): GuestSessionConfig {
  const runtime = env as unknown as GuestRuntimeEnv;
  const pin = runtime.PLAY_POT_GUEST_PIN ?? "";
  const sessionSecret = runtime.PLAY_POT_SESSION_SECRET ?? "";

  if (!/^\d{6}$/.test(pin) || sessionSecret.length < 32) {
    throw new Error("guest_access_not_configured");
  }

  return {
    pin,
    sessionSecret,
  };
}

function readCookie(request: Request) {
  const cookies = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim()) ?? [];

  for (const name of [SECURE_COOKIE_NAME, LOCAL_COOKIE_NAME]) {
    const prefix = `${name}=`;
    const cookie = cookies.find((part) => part.startsWith(prefix));
    if (cookie) return cookie.slice(prefix.length);
  }
  return "";
}

export async function guestPinMatches(value: unknown) {
  return pinMatches(value, getGuestConfig());
}

export async function hasGuestSession(request: Request) {
  const token = readCookie(request);
  return Boolean(token) && sessionTokenIsValid(token, getGuestConfig());
}

export async function createGuestSessionCookie(request: Request) {
  const token = await createSessionToken(getGuestConfig());
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0];
  const isSecure = forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
  const cookieName = isSecure ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
  return [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${GUEST_SESSION_SECONDS}`,
    isSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredGuestSessionCookies() {
  return [
    `${SECURE_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    `${LOCAL_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  ];
}

export function guardSameOriginJson(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: "Cross-origin requests are not allowed.", code: "origin_forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json(
      { error: "Use a JSON request.", code: "json_required" },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}

export async function guardGuestRequest(request: Request) {
  try {
    if (await hasGuestSession(request)) return null;
    return Response.json(
      { error: "Guest PIN required.", code: "guest_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Guest access is temporarily unavailable.", code: "guest_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
