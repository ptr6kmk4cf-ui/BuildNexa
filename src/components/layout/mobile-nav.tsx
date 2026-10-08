"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AppNav } from "@/components/layout/app-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label="Open navigation"
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground sm:max-w-xs">
        <SheetHeader className="border-b border-sidebar-border px-4 py-5">
          <SheetTitle className="font-heading text-sidebar-foreground">AI Project Optimizer</SheetTitle>
          <SheetDescription className="text-sidebar-foreground/70">
            Cost per successful result
          </SheetDescription>
        </SheetHeader>
        <div className="px-3 py-4">
          <AppNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
