import { serverEnv } from "@/lib/env";
import { findStalledJobs, kickJob } from "@/lib/jobs/runner";

/**
 * Recovery cron: resumes jobs whose slice crashed, timed out, or is waiting on
 * a delayed retry. Schedule every minute (see vercel.json) or call from any
 * scheduler with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ids = await findStalledJobs(20);
  await Promise.all(ids.map((id) => kickJob(id)));
  return Response.json({ resumed: ids.length });
}
