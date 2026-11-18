import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { ArrowRight, Settings2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCourseLanding, userHasCourseAccess } from "@/lib/data/marketplace";
import { CourseLanding } from "@/components/course/course-landing";
import { EnrollButton } from "@/components/course/enroll-button";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { priceLabel } from "@/lib/money";
import { cn } from "@/lib/utils";

async function getCachedCourseMeta(courseId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`course-${courseId}`);
  const data = await getCourseLanding(courseId);
  if (!data) return null;
  return {
    title: data.course.title,
    description: data.course.subtitle ?? data.course.description?.slice(0, 200) ?? null,
    image: data.course.thumbnail_url,
    price: priceLabel(data.course.price_amount, data.course.currency),
  };
}

export async function generateMetadata({ params }: PageProps<"/courses/[courseId]">): Promise<Metadata> {
  const { courseId } = await params;
  const meta = await getCachedCourseMeta(courseId);
  if (!meta) return { title: "Course not found", robots: { index: false } };
  const description = `${meta.price} course. ${meta.description ?? ""}`.trim();
  return {
    title: meta.title,
    description,
    openGraph: { title: meta.title, description, images: meta.image ? [meta.image] : undefined },
    twitter: { card: meta.image ? "summary_large_image" : "summary", title: meta.title, description },
  };
}

export default function SharedCoursePage({ params }: PageProps<"/courses/[courseId]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <Suspense
        fallback={
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <Skeleton className="h-6 w-40 rounded-full" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-64 rounded-3xl" />
            </div>
            <Skeleton className="h-[480px] rounded-3xl" />
          </div>
        }
      >
        <SharedCourse params={params} />
      </Suspense>
    </div>
  );
}

async function SharedCourse({ params }: { params: PageProps<"/courses/[courseId]">["params"] }) {
  const { courseId } = await params;
  const [data, user] = await Promise.all([getCourseLanding(courseId), getCurrentUser()]);
  if (!data) notFound();

  let action: React.ReactNode;
  if (user && data.course.user_id === user.id) {
    action = (
      <Link href={`/dashboard/courses/${courseId}`} className={cn(buttonVariants({ variant: "ink", size: "lg" }), "h-12 w-full rounded-xl text-[15px]")}>
        <Settings2 /> Manage your course
      </Link>
    );
  } else if (user && (await userHasCourseAccess(user.id, courseId, data.course.user_id, user.role === "admin"))) {
    action = (
      <Link href={`/dashboard/courses/${courseId}/learn`} className={cn(buttonVariants({ size: "lg" }), "h-12 w-full rounded-xl text-[15px]")}>
        Continue learning <ArrowRight />
      </Link>
    );
  } else {
    action = <EnrollButton courseId={courseId} priceAmount={data.course.price_amount} currency={data.course.currency} signedIn={Boolean(user)} />;
  }

  return <CourseLanding data={data} action={action} />;
}
