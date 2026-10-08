"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return active ? (
    <p className="text-xs text-muted-foreground" role="status">
      This page refreshes while a run is in progress.
    </p>
  ) : null;
}
