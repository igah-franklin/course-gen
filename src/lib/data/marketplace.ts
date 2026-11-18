import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const READY = ["ready", "needs_review"];

export type CourseLandingData = NonNullable<Awaited<ReturnType<typeof getCourseLanding>>>;

/**
 * Public "sales page" data for a shared course: catalog info and the lesson
 * titles only — never lesson content, quizzes or answers. Returns null unless
 * the course is public and finished.
 */
export async function getCourseLanding(courseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) return null;
  const db = createAdminClient();
  const { data: course } = await db
    .from("courses")
    .select(
      "id, user_id, title, subtitle, description, thumbnail_url, difficulty, estimated_duration, learning_objectives, prerequisites, target_audience, status, is_public, price_amount, currency, source_type, source_name, channel_name, original_video_title, created_at",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (!course || !course.is_public || !READY.includes(course.status)) return null;

  const [modules, lessons, quizzes, creator, learners] = await Promise.all([
    db.from("course_modules").select("id, title, position").eq("course_id", courseId).order("position"),
    db.from("lessons").select("id, module_id, title, position, estimated_reading_time").eq("course_id", courseId).order("position"),
    db.from("quizzes").select("id, module_id, kind").eq("course_id", courseId),
    db.from("profiles").select("full_name, avatar_url").eq("id", course.user_id).maybeSingle(),
    db.from("course_access").select("id", { count: "exact", head: true }).eq("course_id", courseId),
  ]);

  const mods = (modules.data ?? []).map((m) => ({
    id: m.id as string,
    title: m.title as string,
    lessons: (lessons.data ?? [])
      .filter((l) => l.module_id === m.id)
      .map((l) => ({ id: l.id as string, title: l.title as string, minutes: (l.estimated_reading_time as number | null) ?? null })),
    hasQuiz: (quizzes.data ?? []).some((q) => q.module_id === m.id),
  }));

  return {
    course: {
      ...course,
      learning_objectives: (course.learning_objectives ?? []) as string[],
      prerequisites: (course.prerequisites ?? []) as string[],
    },
    modules: mods,
    totalLessons: mods.reduce((n, m) => n + m.lessons.length, 0),
    hasFinalQuiz: (quizzes.data ?? []).some((q) => q.kind === "final"),
    creator: { name: (creator.data?.full_name as string | null) ?? "Course creator", avatarUrl: (creator.data?.avatar_url as string | null) ?? null },
    learners: learners.count ?? 0,
  };
}

/** Whether a (signed-in) user can study a course: owner, admin, or granted access. */
export async function userHasCourseAccess(userId: string, courseId: string, ownerId: string, isAdmin: boolean) {
  if (ownerId === userId || isAdmin) return true;
  const { data } = await createAdminClient()
    .from("course_access")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  return Boolean(data);
}

/** Sales of a creator's courses (successful payments only). */
export async function getCreatorEarnings(creatorId: string) {
  const db = createAdminClient();
  const [{ data: sales }, { data: courses }] = await Promise.all([
    db
      .from("payments")
      .select("id, course_id, course_title, amount, currency, platform_fee, creator_earnings, payout_status, paid_at, paid_out_at")
      .eq("creator_id", creatorId)
      .eq("status", "success")
      .order("paid_at", { ascending: false })
      .limit(500),
    db
      .from("courses")
      .select("id, title, is_public, price_amount, currency, status")
      .eq("user_id", creatorId)
      .in("status", READY)
      .order("created_at", { ascending: false }),
  ]);

  const courseIds = (courses ?? []).map((c) => c.id);
  const { data: access } = courseIds.length
    ? await db.from("course_access").select("course_id").in("course_id", courseIds)
    : { data: [] as { course_id: string }[] };
  const learnerCount = new Map<string, number>();
  for (const a of access ?? []) learnerCount.set(a.course_id, (learnerCount.get(a.course_id) ?? 0) + 1);

  const totals = new Map<string, { gross: number; earned: number; unpaid: number; paidOut: number; sales: number }>();
  for (const s of sales ?? []) {
    const t = totals.get(s.currency) ?? { gross: 0, earned: 0, unpaid: 0, paidOut: 0, sales: 0 };
    t.gross += s.amount;
    t.earned += s.creator_earnings;
    t.sales += 1;
    if (s.payout_status === "paid_out") t.paidOut += s.creator_earnings;
    else t.unpaid += s.creator_earnings;
    totals.set(s.currency, t);
  }

  return {
    sales: sales ?? [],
    totals: [...totals.entries()].map(([currency, t]) => ({ currency, ...t })),
    courses: (courses ?? []).map((c) => ({ ...c, learners: learnerCount.get(c.id) ?? 0 })),
  };
}

/** Admin: balances owed to each creator, per currency, plus recent sales. */
export async function getPayoutOverview() {
  const db = createAdminClient();
  const { data: sales } = await db
    .from("payments")
    .select("id, creator_id, course_title, amount, currency, platform_fee, creator_earnings, payout_status, status, paid_at, created_at, reference")
    .order("created_at", { ascending: false })
    .limit(1000);

  const ok = (sales ?? []).filter((s) => s.status === "success");
  const creatorIds = [...new Set((sales ?? []).map((s) => s.creator_id).filter(Boolean))] as string[];
  const { data: profiles } = creatorIds.length
    ? await db.from("profiles").select("id, full_name, email").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const who = new Map((profiles ?? []).map((p) => [p.id, p]));

  const balances = new Map<string, { creatorId: string; name: string; email: string | null; currency: string; owed: number; sales: number }>();
  const revenue = new Map<string, { gross: number; fees: number }>();
  for (const s of ok) {
    const r = revenue.get(s.currency) ?? { gross: 0, fees: 0 };
    r.gross += s.amount;
    r.fees += s.platform_fee;
    revenue.set(s.currency, r);
    if (!s.creator_id || s.payout_status !== "unpaid") continue;
    const key = `${s.creator_id}:${s.currency}`;
    const p = who.get(s.creator_id);
    const b = balances.get(key) ?? { creatorId: s.creator_id, name: p?.full_name || p?.email || "Unknown", email: p?.email ?? null, currency: s.currency, owed: 0, sales: 0 };
    b.owed += s.creator_earnings;
    b.sales += 1;
    balances.set(key, b);
  }

  return {
    balances: [...balances.values()].sort((a, b) => b.owed - a.owed),
    revenue: [...revenue.entries()].map(([currency, r]) => ({ currency, ...r })),
    recent: (sales ?? []).slice(0, 50).map((s) => ({ ...s, creatorName: s.creator_id ? (who.get(s.creator_id)?.full_name ?? who.get(s.creator_id)?.email ?? "—") : "—" })),
  };
}
