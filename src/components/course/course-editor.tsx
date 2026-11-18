"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Eye, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  regenerateLessonAction,
  updateCourseAction,
  updateLessonAction,
  updateModuleAction,
} from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

type LessonEditData = {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  introduction: string;
  sections: { heading: string; body: string }[];
  key_takeaways: string[];
};
type ModuleEditData = { id: string; title: string; description: string | null; lessons: LessonEditData[] };

export function CourseEditor({
  course,
  modules,
}: {
  course: {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    is_public: boolean;
    require_final_assessment: boolean;
    passing_score: number;
  };
  modules: ModuleEditData[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(course);
  const [pending, start] = useTransition();

  const saveCourse = () =>
    start(async () => {
      const r = await updateCourseAction(course.id, {
        title: form.title,
        subtitle: form.subtitle || null,
        description: form.description || null,
        is_public: form.is_public,
        require_final_assessment: form.require_final_assessment,
        passing_score: Number(form.passing_score),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Course saved");
      router.refresh();
    });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold">Course details</h2>
        <div className="mt-5 grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" value={form.subtitle ?? ""} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (markdown)</Label>
            <Textarea id="desc" rows={8} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <h3 className="mt-8 text-sm font-semibold">Sharing & completion</h3>
        <div className="mt-3 divide-y rounded-xl border">
          <label className="flex items-center justify-between gap-4 p-4">
            <span>
              <span className="block text-sm font-medium">Public course</span>
              <span className="block text-xs text-muted-foreground">
                Listed in Explore Courses so other learners can take it. Only share content you have the right to share.
              </span>
            </span>
            <Switch checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} />
          </label>
          <label className="flex items-center justify-between gap-4 p-4">
            <span>
              <span className="block text-sm font-medium">Require final assessment for certificate</span>
              <span className="block text-xs text-muted-foreground">Learners must pass the final assessment to complete the course.</span>
            </span>
            <Switch
              checked={form.require_final_assessment}
              onCheckedChange={(v) => setForm({ ...form, require_final_assessment: v })}
            />
          </label>
          <div className="flex items-center justify-between gap-4 p-4">
            <span>
              <span className="block text-sm font-medium">Passing score</span>
              <span className="block text-xs text-muted-foreground">Applies to every quiz in this course.</span>
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                className="w-20"
                value={form.passing_score}
                onChange={(e) => setForm({ ...form, passing_score: Number(e.target.value) })}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveCourse} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save course
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">Modules & lessons</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Edits update lessons in place — learners keep their progress, notes and bookmarks.
        </p>
        <div className="space-y-4">
          {modules.map((m, mi) => (
            <ModuleEditor key={m.id} courseId={course.id} module={m} index={mi} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleEditor({ courseId, module: m, index }: { courseId: string; module: ModuleEditData; index: number }) {
  const [title, setTitle] = useState(m.title);
  const [description, setDescription] = useState(m.description ?? "");
  const [pending, start] = useTransition();
  const dirty = title !== m.title || description !== (m.description ?? "");
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">{index + 1}</span>
        <div className="flex-1 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-medium" aria-label="Module title" />
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Module description" />
        </div>
        <Button
          variant="outline"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await updateModuleAction(courseId, m.id, { title, description: description || null });
              if (!r.ok) toast.error(r.error);
              else toast.success("Module saved");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </div>
      <div className="mt-4 space-y-2 sm:pl-11">
        {m.lessons.map((l, li) => (
          <LessonEditor key={l.id} courseId={courseId} lesson={l} label={`${index + 1}.${li + 1}`} />
        ))}
      </div>
    </div>
  );
}

function LessonEditor({ courseId, lesson, label }: { courseId: string; lesson: LessonEditData; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(lesson);
  const [pending, start] = useTransition();
  const [regen, startRegen] = useTransition();

  const save = () =>
    start(async () => {
      const r = await updateLessonAction(courseId, lesson.id, {
        title: state.title,
        description: state.description,
        introduction: state.introduction,
        sections: state.sections,
        key_takeaways: state.key_takeaways,
        is_required: state.is_required,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Lesson saved");
      router.refresh();
    });

  return (
    <div className="rounded-xl border">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-xs tabular-nums text-muted-foreground">{label}</span>
        <span className="flex-1 text-sm font-medium">{state.title}</span>
        {!state.is_required && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">Optional</span>}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={state.title} onChange={(e) => setState({ ...state, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Short description</Label>
              <Input value={state.description ?? ""} onChange={(e) => setState({ ...state, description: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Introduction (markdown)</Label>
            <Textarea rows={4} value={state.introduction} onChange={(e) => setState({ ...state, introduction: e.target.value })} />
          </div>
          <div className="space-y-3">
            <Label>Explanation sections</Label>
            {state.sections.map((s, i) => (
              <div key={i} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex gap-2">
                  <Input
                    value={s.heading}
                    placeholder="Heading"
                    onChange={(e) =>
                      setState({ ...state, sections: state.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove section"
                    onClick={() => setState({ ...state, sections: state.sections.filter((_, j) => j !== i) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Textarea
                  rows={6}
                  value={s.body}
                  onChange={(e) =>
                    setState({ ...state, sections: state.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })
                  }
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setState({ ...state, sections: [...state.sections, { heading: "", body: "" }] })}>
              <Plus /> Add section
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Key takeaways (one per line)</Label>
            <Textarea
              rows={4}
              value={state.key_takeaways.join("\n")}
              onChange={(e) => setState({ ...state, key_takeaways: e.target.value.split("\n") })}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={state.is_required} onCheckedChange={(v) => setState({ ...state, is_required: v })} />
            Required for course completion
          </label>
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <div className="flex gap-2">
              <Link href={`/dashboard/courses/${courseId}/learn?lesson=${lesson.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Eye /> Preview
              </Link>
              <Button
                variant="ghost"
                size="sm"
                disabled={regen}
                onClick={() =>
                  startRegen(async () => {
                    const r = await regenerateLessonAction(courseId, lesson.id);
                    if (!r.ok) toast.error(r.error);
                    else toast.success("Regenerating in the background");
                  })
                }
              >
                {regen ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate with AI
              </Button>
            </div>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Save lesson
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
