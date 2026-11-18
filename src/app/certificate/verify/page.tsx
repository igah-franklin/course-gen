import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { VerifyLookup } from "@/components/shared/verify-lookup";

export const metadata: Metadata = { title: "Verify a certificate" };

export default function VerifyIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
        <h1 className="text-2xl font-semibold tracking-tight">Verify a certificate</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          Enter the certificate ID printed on the certificate, or scan its QR code.
        </p>
        <VerifyLookup />
      </main>
    </div>
  );
}
