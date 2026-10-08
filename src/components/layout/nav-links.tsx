import Link from "next/link";
import { isActivePath, navigation, type NavItem } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary">
      <ul className="grid gap-1">
        {navigation.map((item) => (
          <li key={item.href}>
            <NavItemLink item={item} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavItemLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
      )}
    >
      <Icon aria-hidden="true" />
      {item.label}
    </Link>
  );
}
