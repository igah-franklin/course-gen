"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VerifyLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      className="rounded-xl border bg-card p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) router.push(`/certificate/verify/${encodeURIComponent(v)}`);
      }}
    >
      <label htmlFor="cert-id" className="text-sm font-medium">
        Verify another certificate
      </label>
      <div className="mt-2 flex gap-2">
        <Input id="cert-id" placeholder="Certificate ID, e.g. CO-2026-ABCD2345" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" variant="outline">
          <Search /> Verify
        </Button>
      </div>
    </form>
  );
}
