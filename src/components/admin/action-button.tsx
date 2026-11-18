"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Invokes a bound server action, with optional confirm and toast feedback. */
export function ActionButton({
  action,
  label,
  success,
  confirm,
  variant = "outline",
}: {
  action: () => Promise<{ ok: boolean; error?: string }>;
  label: string;
  success?: string;
  confirm?: string;
  variant?: "outline" | "ghost" | "destructive" | "default";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (!r.ok) toast.error(r.error ?? "Failed");
          else {
            if (success) toast.success(success);
            router.refresh();
          }
        });
      }}
    >
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}
