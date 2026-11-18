"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ isAdmin, footer }: { isAdmin: boolean; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" className="lg:hidden" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="mt-8">
          <SidebarNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </div>
        {footer ? <div className="mt-auto">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
