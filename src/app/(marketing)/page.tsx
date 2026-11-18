import Link from "next/link";
import {
  Award,
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  Clock,
  FileSearch,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListOrdered,
  MessagesSquare,
  MousePointerClick,
  ScanSearch,
  Shapes,
  Sparkles,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { HeroDemo } from "@/components/landing/hero-demo";
import { CommunityButtons } from "@/components/shared/community-buttons";
import { getCachedCommunityLinks } from "@/lib/settings-cached";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: MousePointerClick,
    title: "Paste a YouTube URL",
    body: "Drop in any educational video — full-length tutorials, lectures, or Shorts. We validate it and pull its details instantly.",
  },
  {
    icon: ScanSearch,
    title: "AI analyzes the entire video",
    body: "The full transcript is processed from first second to last, chunk by chunk, so every topic, demo and example is identified with timestamps.",
  },
  {
    icon: GraduationCap,
    title: "Start learning",
    body: "Work through structured modules with detailed lessons, step-by-step instructions, illustrations, practical exercises and quizzes.",
  },
];

const features = [
  { icon: FileSearch, title: "Complete video analysis", body: "Every teaching point is extracted and tracked on a coverage checklist — nothing important gets skipped." },
  { icon: Layers, title: "Automatic course generation", body: "Modules and lessons organized in a sensible learning order that preserves the video's progression." },
  { icon: ListOrdered, title: "Detailed step-by-step lessons", body: "Real learning documents: explanations, numbered instructions, commands, examples and common mistakes." },
  { icon: Shapes, title: "Educational illustrations", body: "Flowcharts, architecture diagrams, comparisons and annotated walkthroughs generated for each lesson." },
  { icon: BookOpenCheck, title: "Interactive learning experience", body: "A distraction-free player with progress, bookmarks, notes and links to the exact moment in the video." },
  { icon: ClipboardCheck, title: "Quizzes and assessments", body: "Module quizzes and a final assessment with instant feedback and explanations for every answer." },
  { icon: BarChart3, title: "Learning progress tracking", body: "Pick up exactly where you left off. See your streaks, hours and completion across all courses." },
  { icon: Award, title: "Downloadable certificates", body: "Earn a verifiable PDF certificate with a QR code you can share on LinkedIn." },
  { icon: LayoutDashboard, title: "Personal learning dashboard", body: "All your courses, activity and achievements in one beautiful workspace." },
  { icon: Users, title: "Learning community", body: "Ask questions, share progress and learn alongside others on WhatsApp and Telegram." },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.97_0.015_277),transparent_40%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,oklch(0.85_0.01_264)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent_55%)] opacity-60" />
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 md:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
              <Sparkles className="size-3.5 text-primary" /> AI-powered course builder
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Turn Any YouTube Video Into a <span className="text-primary">Complete Course.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              Stop jumping between video timestamps. Transform YouTube tutorials into structured lessons, detailed
              explanations, practical exercises, and complete learning experiences — powered by AI.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-6 text-[15px] shadow-lg shadow-primary/25")}>
                Create Your First Course
              </Link>
              <Link href="#how-it-works" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 rounded-xl px-6 text-[15px]")}>
                Explore How It Works
              </Link>
            </div>
          </div>
          <div className="mt-16">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-t bg-background py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From video to course in three steps" />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="group relative rounded-2xl border bg-card p-7 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything you need to actually learn from a video"
            body="Not a summary. A complete course that teaches you to understand and reproduce what the video shows."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md">
                <f.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honesty / quality */}
      <section className="border-t bg-background py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-primary">Built for completeness</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Every teaching point accounted for</h2>
            <p className="mt-4 text-muted-foreground">
              Long videos are processed in chunks and merged into one coherent course. A coverage checklist verifies
              that every topic, demonstration and example identified in the video appears in a lesson — and a quality
              review flags anything that doesn&apos;t.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Timestamps preserved for every lesson, step and illustration",
                "Supplementary examples clearly labelled — never passed off as the video's content",
                "Transparent about what was analysed: transcript coverage and on-screen visuals",
                "Background processing: close the tab, come back to a finished course",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="size-1.5 rounded-full bg-primary" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Coverage report</p>
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Example</span>
            </div>
            <div className="mt-5 space-y-4">
              {[
                ["Teaching points identified", "100%"],
                ["Demonstrations with step-by-step instructions", "100%"],
                ["Lessons linked to original timestamps", "100%"],
              ].map(([label, v]) => (
                <div key={label}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-full rounded-full bg-primary" />
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-muted-foreground">
                  When a video relies on visuals the transcript can&apos;t capture, the lesson says so and links you to that
                  exact moment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community */}
      <section id="community" className="scroll-mt-20 border-t bg-muted/30 py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center shadow-sm sm:px-12">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1DA851] via-primary to-[#229ED9]" />
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
              <MessagesSquare className="size-6" />
            </span>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Learn Better, Together.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Connect with other learners, ask questions, share your progress, and get support from the learning
              community.
            </p>
            <CommunityLinksBlock />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-background py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your next course is one link away</h2>
          <p className="mt-4 text-muted-foreground">
            Paste a YouTube URL and get a structured course with lessons, illustrations, quizzes and a certificate.
          </p>
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-12 rounded-xl px-6 text-[15px]")}>
            Create Your First Course
          </Link>
        </div>
      </section>
    </>
  );
}

async function CommunityLinksBlock() {
  const links = await getCachedCommunityLinks();
  return <CommunityButtons links={links} size="lg" className="mt-8 justify-center" />;
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-muted-foreground">{body}</p> : null}
    </div>
  );
}
