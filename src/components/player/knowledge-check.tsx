"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function KnowledgeCheck({ items }: { items: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Answer each question in your head first, then reveal the answer.</p>
      {items.map((it, i) => {
        const isOpen = open.has(i);
        return (
          <div key={i} className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <button
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(i)) n.delete(i);
                  else n.add(i);
                  return n;
                })
              }
            >
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="flex-1 text-sm font-medium">{it.question}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {isOpen ? "Hide" : "Reveal"}
                <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
              </span>
            </button>
            {isOpen && <div className="border-t bg-muted/30 px-4 py-3 pl-11 text-sm">{it.answer}</div>}
          </div>
        );
      })}
    </div>
  );
}
