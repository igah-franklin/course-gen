import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Compass className="size-7" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
        Go to dashboard
      </Link>
    </div>
  );
}
