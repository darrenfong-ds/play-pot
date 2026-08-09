import { guardAdminRequest } from "../../../admin-auth";
import { listLiveDevices } from "../../../live-store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const authError = await guardAdminRequest(request);
  if (authError) return authError;

  try {
    const checkedAt = Date.now();
    return Response.json(
      {
        checkedAt: new Date(checkedAt).toISOString(),
        devices: await listLiveDevices(checkedAt),
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Live view is temporarily unavailable." },
      { status: 503, headers: noStore },
    );
  }
}
