import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { CheckCircle2 } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-muted/40 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.9_0.06_35/.8),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="text-sm font-medium text-primary">Learn from YouTube, properly</p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight">
            Structured lessons, illustrations, quizzes and a certificate — from any video.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            {[
              "Every topic and demonstration accounted for",
              "Step-by-step instructions you can follow",
              "Pick up exactly where you left off",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
