import {
  createGuestSessionCookie,
  expiredGuestSessionCookies,
  guardSameOriginJson,
  guestPinMatches,
  hasGuestSession,
} from "../../guest-auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    return Response.json(
      { authenticated: await hasGuestSession(request) },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Guest access is temporarily unavailable." },
      { status: 503, headers: noStore },
    );
  }
}

export async function POST(request: Request) {
  const requestError = guardSameOriginJson(request);
  if (requestError) return requestError;

  let pin: unknown;
  try {
    const payload = (await request.json()) as { pin?: unknown };
    pin = payload.pin;
  } catch {
    return Response.json(
      { error: "Enter the 6-digit staff PIN." },
      { status: 400, headers: noStore },
    );
  }

  try {
    if (!(await guestPinMatches(pin))) {
      return Response.json(
        { error: "Wrong PIN. Check the number and try again." },
        { status: 401, headers: noStore },
      );
    }

    return Response.json(
      { authenticated: true },
      {
        headers: {
          ...noStore,
          "Set-Cookie": await createGuestSessionCookie(request),
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Guest access is temporarily unavailable." },
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
  for (const cookie of expiredGuestSessionCookies()) {
    headers.append("Set-Cookie", cookie);
  }
  return Response.json({ authenticated: false }, { headers });
}
