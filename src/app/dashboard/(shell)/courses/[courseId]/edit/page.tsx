import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { CourseEditor } from "@/components/course/course-editor";
import { PageHeader } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Edit course" };

type Content = { introduction?: string; explanation_sections?: { heading: string; body: string }[]; key_takeaways?: string[] };

export default async function EditCoursePage({ params }: PageProps<"/dashboard/courses/[courseId]/edit">) {
  const { courseId } = await params;
  const user = await requireUser(`/dashboard/courses/${courseId}/edit`);
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
  if (!course) notFound();
  if (course.user_id !== user.id && user.role !== "admin") redirect(`/dashboard/courses/${courseId}`);

  const [{ data: modules }, { data: lessons }, platform] = await Promise.all([
    supabase.from("course_modules").select("id, title, description, position").eq("course_id", courseId).order("position"),
    supabase
      .from("lessons")
      .select("id, module_id, title, description, content, is_required, position")
      .eq("course_id", courseId)
      .order("position"),
    getSetting("completion"),
  ]);
  const settings = (course.completion_settings ?? {}) as { require_final_assessment?: boolean; passing_score?: number };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/dashboard/courses/${courseId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to course
      </Link>
      <PageHeader title="Edit course" description={course.title} />
      <CourseEditor
        course={{
          id: course.id,
          title: course.title,
          subtitle: course.subtitle,
          description: course.description,
          is_public: course.is_public,
          require_final_assessment: settings.require_final_assessment ?? platform.require_final_assessment,
          passing_score: settings.passing_score ?? platform.default_passing_score,
        }}
        modules={(modules ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          lessons: (lessons ?? [])
            .filter((l) => l.module_id === m.id)
            .map((l) => {
              const c = (l.content ?? {}) as Content;
              return {
                id: l.id,
                title: l.title,
                description: l.description,
                is_required: l.is_required,
                introduction: c.introduction ?? "",
                sections: c.explanation_sections ?? [],
                key_takeaways: c.key_takeaways ?? [],
              };
            }),
        }))}
      />
    </div>
  );
}
