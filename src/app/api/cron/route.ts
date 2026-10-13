import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/order-access";
import { runScheduledWork } from "@/lib/scheduler";

/**
 * Runs due webhook retries and abandoned checkout emails, for an outside
 * scheduler. Answers only a request bearing `CRON_SECRET`; without the secret
 * configured it does not exist.
 */
export async function POST(request: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await runScheduledWork();
  return NextResponse.json(result ?? { skipped: true });
}
