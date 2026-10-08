import {
  FolderKanban,
  FolderGit,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  type LucideIcon,
  Waypoints,
} from "lucide-react";

export type NavItem = {
  href: "/" | "/projects" | "/github" | "/models" | "/costs" | "/activity" | "/settings";
  label: string;
  icon: LucideIcon;
};

export const navigation: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/github", label: "GitHub", icon: FolderGit },
  { href: "/models", label: "Models", icon: Waypoints },
  { href: "/costs", label: "Costs", icon: Receipt },
  { href: "/activity", label: "Activity", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string | null, href: NavItem["href"]): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
