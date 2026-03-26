"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, Eye } from "lucide-react";
import { type Issue } from "@/lib/api";
import { TopBar, RefreshButton } from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import { IssueDetailModal } from "@/components/IssueDetailModal";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type StatusFilter = "all" | "open" | "acknowledged" | "resolved";

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/guard/api/proxy/issues${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Issue[];
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  async function handleUpdateStatus(
    issueId: string,
    status: "acknowledged" | "resolved"
  ) {
    setUpdatingId(issueId);
    try {
      const res = await fetch(`/guard/api/proxy/issues/${issueId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  const severityOptions: SeverityFilter[] = [
    "all",
    "critical",
    "high",
    "medium",
    "low",
  ];
  const statusOptions: StatusFilter[] = [
    "all",
    "open",
    "acknowledged",
    "resolved",
  ];

  return (
    <>
      <TopBar
        title="Issues"
        subtitle={`${issues.length} issues`}
        actions={
          <RefreshButton onClick={() => void loadIssues()} loading={loading} />
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Severity:</span>
            {severityOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setSeverityFilter(opt)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                  severityFilter === opt
                    ? "bg-cyan-600 text-white"
                    : "border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Status:</span>
            {statusOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                  statusFilter === opt
                    ? "bg-cyan-600 text-white"
                    : "border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && issues.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                    <th className="px-5 py-3 text-left font-medium">Severity</th>
                    <th className="px-5 py-3 text-left font-medium">Rule</th>
                    <th className="px-5 py-3 text-left font-medium">Container</th>
                    <th className="px-5 py-3 text-left font-medium">Image</th>
                    <th className="px-5 py-3 text-left font-medium">Port</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">First Seen</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {issues.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-zinc-500"
                      >
                        No issues found
                      </td>
                    </tr>
                  ) : (
                    issues.map((issue) => (
                      <tr
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3.5">
                          <SeverityBadge severity={issue.severity} />
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-300">
                          {issue.rule_id}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-zinc-100">
                          {issue.container_name ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-400 max-w-[200px] truncate">
                          {issue.image ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-400">
                          {issue.host_port ? `${issue.host_ip}:${issue.host_port}` : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={issue.status} />
                        </td>
                        <td className="px-5 py-3.5 text-zinc-400 text-xs">
                          {formatRelativeTime(issue.first_seen_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {issue.status === "open" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleUpdateStatus(issue.id, "acknowledged");
                                }}
                                disabled={updatingId === issue.id}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-yellow-500/20 hover:text-yellow-400 transition-colors disabled:opacity-50"
                                title="Acknowledge"
                              >
                                {updatingId === issue.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            {issue.status !== "resolved" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleUpdateStatus(issue.id, "resolved");
                                }}
                                disabled={updatingId === issue.id}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors disabled:opacity-50"
                                title="Mark resolved"
                              >
                                {updatingId === issue.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </>
  );
}
