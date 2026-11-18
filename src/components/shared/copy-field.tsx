"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyField({ value, label, multiline = false, className }: { value: string; label?: string; multiline?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border bg-muted/40 p-1.5 pl-3", className)}>
      <code className={cn("min-w-0 flex-1 py-1.5 font-mono text-[13px]", multiline ? "whitespace-pre-wrap" : "truncate")} aria-label={label}>
        {value}
      </code>
      <Button size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label ?? ""}`}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
