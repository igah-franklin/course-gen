"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Award, Download, Loader2, Lock, PartyPopper } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CommunityButtons } from "@/components/shared/community-buttons";
import type { CommunityLinks } from "@/lib/settings";
import { claimCertificateAction } from "@/lib/actions/certificates";
import { cn } from "@/lib/utils";

const CONFETTI_COLORS = ["#d0645a", "#f2a490", "#7cc79a", "#f3cf6b", "#9fcfe6", "#c9a6e0"];

function Confetti() {
  const [pieces, setPieces] = useState<{ x: number; d: number; r: number; c: string; s: number; delay: number }[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Generated client-side only (after hydration) so server and client markup match.
    const raf = requestAnimationFrame(() =>
      setPieces(
        Array.from({ length: 70 }, (_, i) => ({
          x: Math.random() * 100,
          d: 2.5 + Math.random() * 2.5,
          r: Math.random() * 360,
          c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          s: 6 + Math.random() * 6,
          delay: Math.random() * 0.6,
        })),
      ),
    );
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={{ left: `${p.x}%`, width: p.s, height: p.s * 0.45, backgroundColor: p.c }}
          initial={{ y: -20, rotate: p.r, opacity: 1 }}
          animate={{ y: "105vh", rotate: p.r + 540, opacity: [1, 1, 0] }}
          transition={{ duration: p.d, ease: "easeIn", delay: p.delay }}
        />
      ))}
    </div>
  );
}

export function CompletionScreen({
  courseId,
  courseTitle,
  eligible,
  missing,
  existingCertificateId,
  links,
}: {
  courseId: string;
  courseTitle: string;
  eligible: boolean;
  missing: string[];
  existingCertificateId: string | null;
  links: CommunityLinks;
}) {
  const [certId, setCertId] = useState(existingCertificateId);
  const [pending, start] = useTransition();

  if (!eligible) {
    return (
      <div className="py-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Lock className="size-7" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Almost there</h1>
        <p className="mt-2 text-muted-foreground">To complete &ldquo;{courseTitle}&rdquo; and earn your certificate:</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm">
          {missing.map((m) => (
            <li key={m} className="rounded-lg border bg-card px-4 py-2.5">
              {m}
            </li>
          ))}
        </ul>
        <Link href={`/dashboard/courses/${courseId}`} className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Back to course
        </Link>
      </div>
    );
  }

  const download = () => {
    start(async () => {
      let id = certId;
      if (!id) {
        const r = await claimCertificateAction(courseId);
        if (!r.ok) return void toast.error(r.error);
        id = r.data.certificateId;
        setCertId(id);
      }
      const a = document.createElement("a");
      a.href = `/api/certificates/${id}/download`;
      a.download = "";
      a.click();
    });
  };

  return (
    <div className="py-6 text-center">
      <Confetti />
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}>
        <span className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          <PartyPopper className="size-10" />
        </span>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Congratulations! You&apos;ve Successfully Completed This Course.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          You&apos;ve put in the work, learned new skills, and reached another milestone. Your certificate is ready.
        </p>
        <p className="mt-3 text-sm font-medium">{courseTitle}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-12 rounded-xl px-6 text-[15px] shadow-lg shadow-primary/25" onClick={download} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Download />}
            Download My Certificate
          </Button>
          <Link href="/dashboard/certificates" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-xl px-5")}>
            <Award /> View all certificates
          </Link>
        </div>
      </motion.div>

      <div className="mx-auto mt-14 max-w-xl rounded-2xl border bg-card p-6 shadow-xs">
        <h2 className="font-semibold">Share your win with the community</h2>
        <p className="mt-1 text-sm text-muted-foreground">Celebrate, help others, and find your next course to learn.</p>
        <CommunityButtons links={links} className="mt-5 justify-center" />
      </div>
    </div>
  );
}
