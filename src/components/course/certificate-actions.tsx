"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, Check, Copy, Download, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CertificateActions({ id, verifyUrl, linkedInUrl }: { id: string; verifyUrl: string; linkedInUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/certificates/${id}/download`} className={cn(buttonVariants({ size: "sm" }))}>
        <Download /> Download PDF
      </a>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(verifyUrl);
            setCopied(true);
            toast.success("Verification link copied");
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.error("Couldn't copy — select the link manually");
          }
        }}
      >
        {copied ? <Check /> : <Copy />} Share link
      </Button>
      <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <BriefcaseBusiness /> Add to LinkedIn
      </a>
      <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <ExternalLink /> Verify
      </a>
    </div>
  );
}
