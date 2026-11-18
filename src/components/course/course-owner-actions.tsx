"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteCourseAction } from "@/lib/actions/courses";

export function CourseOwnerActions({ courseId, title }: { courseId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="Course actions" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/dashboard/courses/${courseId}/edit`} />}>
            <Pencil /> Edit course
          </DropdownMenuItem>
          <AlertDialogTrigger render={<DropdownMenuItem variant="destructive" />}>
            <Trash2 /> Delete course
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this course?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{title}&rdquo; and all of its lessons, quizzes, progress, notes and certificates will be permanently
            deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteCourseAction(courseId);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Course deleted");
                router.push("/dashboard/courses");
              })
            }
          >
            Delete course
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
