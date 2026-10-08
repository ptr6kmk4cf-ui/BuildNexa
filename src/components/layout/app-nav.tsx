"use client";

import { usePathname } from "next/navigation";
import { NavLinks } from "@/components/layout/nav-links";

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} onNavigate={onNavigate} />;
}
