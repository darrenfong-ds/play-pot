import { guardGuestRequest, guardSameOriginJson } from "../../guest-auth";
import { saveLiveSnapshot } from "../../live-store";
import { parseLiveSyncPayload } from "../../live-view-core";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authError = await guardGuestRequest(request);
  if (authError) return authError;
  const requestError = guardSameOriginJson(request);
  if (requestError) return requestError;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_000) {
    return Response.json(
      { error: "Live update is too large." },
      { status: 413, headers: noStore },
    );
  }

  let value: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 32_000) throw new Error("payload_too_large");
    value = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Live update is invalid." },
      { status: 400, headers: noStore },
    );
  }

  const payload = parseLiveSyncPayload(value);
  if (!payload) {
    return Response.json(
      { error: "Live update is invalid." },
      { status: 400, headers: noStore },
    );
  }

  try {
    await saveLiveSnapshot(payload);
    return Response.json({ recorded: true }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Live view is temporarily unavailable." },
      { status: 503, headers: noStore },
    );
  }
}
