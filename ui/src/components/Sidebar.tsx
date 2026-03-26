"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Container, Disc3, ShieldAlert } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/containers", label: "Containers", icon: Container },
  { href: "/images", label: "Images", icon: Disc3 },
  { href: "/issues", label: "Issues", icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Logo */}
      <div className="p-3">
        <img src="/guard/logo.png" alt="Container Guard" className="w-full object-contain" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-1 px-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_8px_rgba(0,229,255,0.05)]"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* App Info */}
      <div className="border-t border-zinc-800 px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-zinc-400">Container Guard <span className="text-zinc-600">v1.0.0</span></p>
        <p className="text-[10px] text-zinc-600">© 2026 VirtuComputing s.r.o.</p>
        <div className="flex items-center gap-2">
          <a href="mailto:support@virtucomputing.com" className="text-[10px] text-zinc-500 hover:text-cyan-400 transition-colors">support@virtucomputing.com</a>
        </div>
        <a href="https://vcs.virtucomputing.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-500 hover:text-cyan-400 transition-colors">vcs.virtucomputing.com</a>
      </div>

    </aside>
  );
}
