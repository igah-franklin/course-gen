import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { kickJob, runJobSlice } from "@/lib/jobs/runner";

// One slice can run long (several AI calls). Platforms read this to set limits.
export const maxDuration = 800;

function authorized(request: Request) {
  const secret = serverEnv.jobRunnerSecret;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/** Internal: runs one job slice after responding, then chains the next slice. */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId) return Response.json({ error: "jobId required" }, { status: 400 });
  const jobId = body.jobId;

  after(async () => {
    try {
      const result = await runJobSlice(jobId);
      // Chain the next slice. Short back-offs (rate limits, async transcription) wait here;
      // longer ones are resumed by the recovery cron or the status poller.
      if (!result.needsMore) return;
      if (result.delaySeconds && result.delaySeconds > 90) return; // long waits: cron / poller resume it
      if (result.delaySeconds) await new Promise((r) => setTimeout(r, result.delaySeconds! * 1000));
      await kickJob(jobId);
    } catch (e) {
      console.error("[jobs/run] slice crashed", e);
    }
  });

  return Response.json({ accepted: true }, { status: 202 });
}
