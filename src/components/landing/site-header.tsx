import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { HeaderAuthActions } from "./auth-actions";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/#how-it-works" className="transition-colors hover:text-foreground">How it works</Link>
          <Link href="/#features" className="transition-colors hover:text-foreground">Features</Link>
          <Link href="/#community" className="transition-colors hover:text-foreground">Community</Link>
          <Link href="/help" className="transition-colors hover:text-foreground">Help</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <HeaderAuthActions />
        </div>
      </div>
    </header>
  );
}
