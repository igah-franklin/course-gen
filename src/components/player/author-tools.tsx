"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Shapes, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  addLessonScreenshotAction,
  regenerateIllustrationsAction,
  regenerateLessonAction,
} from "@/lib/actions/courses";

type Mode = "lesson" | "illustrations" | "screenshot" | null;

export function AuthorTools({ courseId, lessonId, userId }: { courseId: string; lessonId: string; userId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [instructions, setInstructions] = useState("");
  const [shot, setShot] = useState<{ file: File | null; title: string; description: string; ts: string }>({
    file: null,
    title: "",
    description: "",
    ts: "",
  });
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const run = () =>
    start(async () => {
      if (mode === "screenshot") {
        if (!shot.file) return void toast.error("Choose an image first.");
        const supabase = createClient();
        const path = `${userId}/frames/${crypto.randomUUID()}-${shot.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("uploads").upload(path, shot.file, { contentType: shot.file.type });
        if (error) return void toast.error(error.message);
        const ts = shot.ts.trim() ? shot.ts.split(":").map(Number).reduce((a, n) => a * 60 + n, 0) : null;
        const r = await addLessonScreenshotAction(courseId, lessonId, {
          path,
          title: shot.title || "Screenshot",
          description: shot.description,
          timestamp: Number.isFinite(ts) ? ts : null,
        });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Screenshot added to this lesson");
      } else {
        const action = mode === "lesson" ? regenerateLessonAction : regenerateIllustrationsAction;
        const r = await action(courseId, lessonId, instructions || undefined);
        if (!r.ok) return void toast.error(r.error);
        toast.success(
          mode === "lesson"
            ? "Regenerating this lesson in the background. Learner progress is preserved."
            : "Regenerating illustrations in the background.",
        );
      }
      setMode(null);
      setInstructions("");
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <Wand2 /> <span className="hidden sm:inline">Author</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => setMode("lesson")}>
            <RefreshCw /> Regenerate lesson
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("illustrations")}>
            <Shapes /> Regenerate illustrations
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("screenshot")}>
            <ImagePlus /> Add a screenshot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "lesson" ? "Regenerate lesson" : mode === "illustrations" ? "Regenerate illustrations" : "Add a screenshot"}
            </DialogTitle>
            <DialogDescription>
              {mode === "screenshot"
                ? "Upload a frame from the video (or your own screenshot) so learners see what's on screen."
                : "The lesson is rebuilt from the original video analysis. Learner progress, notes and bookmarks are kept."}
            </DialogDescription>
          </DialogHeader>

          {mode === "screenshot" ? (
            <div className="space-y-3">
              <div>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {shot.file ? shot.file.name : "Choose image"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => setShot((s) => ({ ...s, file: e.target.files?.[0] ?? null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={shot.title} onChange={(e) => setShot((s) => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>What does it show?</Label>
                <Textarea rows={3} value={shot.description} onChange={(e) => setShot((s) => ({ ...s, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Video timestamp (mm:ss, optional)</Label>
                <Input value={shot.ts} onChange={(e) => setShot((s) => ({ ...s, ts: e.target.value }))} placeholder="12:34" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="instr">Instructions (optional)</Label>
              <Textarea
                id="instr"
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={
                  mode === "lesson"
                    ? "e.g. Explain the configuration step in more detail and add a beginner-friendly example."
                    : "e.g. Add an architecture diagram showing how the client talks to the API."
                }
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {mode === "screenshot" ? "Add screenshot" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
