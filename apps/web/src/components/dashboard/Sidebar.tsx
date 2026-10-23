import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/generate/image", label: "AI Images" },
  { href: "/dashboard/generate/video", label: "AI Videos" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/billing", label: "Billing" },
];

export function Sidebar({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-border p-4">
      <div>
        <p className="mb-6 px-2 text-lg font-semibold">ClipForge AI</p>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/70 transition hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className="rounded-md px-3 py-2 text-sm text-amber-400 transition hover:bg-muted"
            >
              Admin
            </Link>
          )}
        </nav>
      </div>
      <div>
        <p className="truncate px-2 pb-2 text-xs text-foreground/40">{email}</p>
        <SignOutButton />
      </div>
    </aside>
  );
}
