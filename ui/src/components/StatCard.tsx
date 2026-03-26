import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconClassName?: string;
  trend?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconClassName,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex items-start gap-4",
        className
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 rounded-lg p-2.5",
          iconClassName ?? "bg-zinc-800 text-zinc-400"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-400 truncate">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
        {trend && <p className="mt-1 text-xs text-zinc-500">{trend}</p>}
      </div>
    </div>
  );
}
