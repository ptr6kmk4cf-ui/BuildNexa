import { Suspense } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary font-heading text-sm text-sidebar-primary-foreground">
            AO
          </span>
          <div>
            <p className="font-heading text-base leading-tight text-sidebar-foreground">
              AI Project Optimizer
            </p>
            <p className="text-xs text-sidebar-foreground/65">Cost per successful result</p>
          </div>
        </div>
        <div className="px-3">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <AppNav />
          </Suspense>
        </div>
        <p className="mt-auto px-4 py-4 text-xs text-sidebar-foreground/55">Phase 1, records only</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <MobileNav />
          <p className="font-heading text-base">AI Project Optimizer</p>
        </header>
        <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
