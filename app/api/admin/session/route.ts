import {
  adminPasswordMatches,
  createAdminSessionCookie,
  expiredAdminSessionCookies,
  hasAdminSession,
} from "../../../admin-auth";
import { guardSameOriginJson } from "../../../guest-auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    return Response.json(
      { authenticated: await hasAdminSession(request) },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Admin access is temporarily unavailable." },
      { status: 503, headers: noStore },
    );
  }
}

export async function POST(request: Request) {
  const requestError = guardSameOriginJson(request);
  if (requestError) return requestError;

  let password: unknown;
  try {
    const payload = (await request.json()) as { password?: unknown };
    password = payload.password;
  } catch {
    return Response.json(
      { error: "Enter the admin password." },
      { status: 400, headers: noStore },
    );
  }

  try {
    if (!(await adminPasswordMatches(password))) {
      return Response.json(
        { error: "Wrong admin password." },
        { status: 401, headers: noStore },
      );
    }
    return Response.json(
      { authenticated: true },
      {
        headers: {
          ...noStore,
          "Set-Cookie": await createAdminSessionCookie(request),
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Admin access is temporarily unavailable." },
      { status: 503, headers: noStore },
    );
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403, headers: noStore },
    );
  }

  const headers = new Headers(noStore);
  for (const cookie of expiredAdminSessionCookies()) {
    headers.append("Set-Cookie", cookie);
  }
  return Response.json({ authenticated: false }, { headers });
}
