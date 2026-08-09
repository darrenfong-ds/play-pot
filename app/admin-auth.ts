import { env } from "cloudflare:workers";
import {
  createSessionToken,
  secretMatches,
  sessionTokenIsValid,
  type GuestSessionConfig,
} from "./guest-session-core";

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

const SECURE_COOKIE_NAME = "__Host-play_pot_admin";
const LOCAL_COOKIE_NAME = "play_pot_admin";

type AdminRuntimeEnv = {
  PLAY_POT_ADMIN_PASSWORD?: string;
  PLAY_POT_SESSION_SECRET?: string;
};

function getAdminConfig() {
  const runtime = env as unknown as AdminRuntimeEnv;
  const password = runtime.PLAY_POT_ADMIN_PASSWORD ?? "";
  const sessionSecret = runtime.PLAY_POT_SESSION_SECRET ?? "";
  if (password.length < 16 || password.length > 128 || sessionSecret.length < 32) {
    throw new Error("admin_access_not_configured");
  }
  const sessionConfig: GuestSessionConfig = {
    pin: `admin:${password}`,
    sessionSecret,
  };
  return { password, sessionSecret, sessionConfig };
}

function readCookie(request: Request) {
  const cookies =
    request.headers
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

export async function adminPasswordMatches(value: unknown) {
  const config = getAdminConfig();
  return secretMatches(
    value,
    config.password,
    `${config.sessionSecret}:${config.password}:admin-check`,
  );
}

export async function hasAdminSession(request: Request) {
  const token = readCookie(request);
  return (
    Boolean(token) &&
    sessionTokenIsValid(token, getAdminConfig().sessionConfig)
  );
}

export async function createAdminSessionCookie(request: Request) {
  const config = getAdminConfig();
  const token = await createSessionToken(
    config.sessionConfig,
    Math.floor(Date.now() / 1_000),
    ADMIN_SESSION_SECONDS,
  );
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0];
  const isSecure =
    forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
  const cookieName = isSecure ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
  return [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${ADMIN_SESSION_SECONDS}`,
    isSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredAdminSessionCookies() {
  return [
    `${SECURE_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    `${LOCAL_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  ];
}

export async function guardAdminRequest(request: Request) {
  try {
    if (await hasAdminSession(request)) return null;
    return Response.json(
      { error: "Admin access required.", code: "admin_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Admin access is temporarily unavailable.", code: "admin_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
