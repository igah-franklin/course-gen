import type { Metadata } from "next";
import { CreateCourseForm } from "@/components/course/create-course-form";
import { PageHeader } from "@/components/shared/ui-bits";
import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/provider";
import { transcriptProviderConfigured } from "@/lib/transcript/providers";

export const metadata: Metadata = { title: "Create a Course" };

export default async function NewCoursePage({ searchParams }: PageProps<"/dashboard/courses/new">) {
  const user = await requireUser("/dashboard/courses/new");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Create a Course"
        description="Start from a YouTube video, your own recording, a document or an article. We analyse all of it and build a complete, structured course."
      />
      <CreateCourseForm
        userId={user.id}
        initialUrl={typeof sp.url === "string" ? sp.url : ""}
        capabilities={{ ai: aiConfigured(), transcriptProvider: transcriptProviderConfigured() }}
      />
    </div>
  );
}
