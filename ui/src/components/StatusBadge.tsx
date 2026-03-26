import { cn } from "@/lib/utils";

type IssueStatus = "open" | "acknowledged" | "resolved";
type ContainerStatus = string;

interface StatusBadgeProps {
  status: IssueStatus | ContainerStatus;
  className?: string;
}

function getStatusStyle(status: string): { label: string; className: string } {
  switch (status.toLowerCase()) {
    case "running":
      return {
        label: "Running",
        className: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
      };
    case "stopped":
    case "exited":
      return {
        label: status === "stopped" ? "Stopped" : "Exited",
        className: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
      };
    case "open":
      return {
        label: "Open",
        className: "bg-red-500/20 text-red-400 border border-red-500/30",
      };
    case "acknowledged":
      return {
        label: "Acknowledged",
        className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      };
    case "resolved":
      return {
        label: "Resolved",
        className: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
      };
    default:
      return {
        label: status,
        className: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
      };
  }
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusStyle(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
