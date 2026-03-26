"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Play,
  Plus,
  Square,
  RotateCcw,
  Terminal,
  ChevronRight,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  getContainers,
  getContainerLogs,
  containerAction,
  type Container,
  type ContainerLog,
} from "@/lib/api";
import { TopBar, RefreshButton } from "@/components/TopBar";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";


interface LogModalProps {
  container: Container;
  onClose: () => void;
}

function LogModal({ container, onClose }: LogModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/proxy/containers/${container.id}/logs`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ContainerLog;
        setLogs(data.lines ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [container.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-100">
              Logs: {container.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading logs...
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {!loading && !error && logs.length === 0 && (
            <p className="text-sm text-zinc-500">No log output available</p>
          )}
          {logs.length > 0 && (
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
              {logs.join("\n")}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActionState {
  containerId: string;
  action: "start" | "stop" | "restart";
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [logsContainer, setLogsContainer] = useState<Container | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadContainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/guard/api/proxy/containers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Container[];
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContainers();
  }, [loadContainers]);

  async function handleAction(
    containerId: string,
    action: "start" | "stop" | "restart"
  ) {
    setActionState({ containerId, action });
    try {
      const res = await fetch(`/guard/api/proxy/containers/${containerId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionState(null);
    }
  }

  const isActing = (containerId: string) =>
    actionState?.containerId === containerId;

  async function handleDelete(containerId: string, containerName: string) {
    if (!confirm(`Delete container "${containerName}"? This cannot be undone.`)) return;
    setDeletingId(containerId);
    try {
      const res = await fetch(`/guard/api/proxy/containers/${containerId}?force=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <TopBar
        title="Containers"
        subtitle={`${containers.length} containers`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/containers/create"
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Container
            </Link>
            <RefreshButton onClick={() => void loadContainers()} loading={loading} />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                    <th className="px-5 py-3 text-left font-medium">Name</th>
                    <th className="px-5 py-3 text-left font-medium">Image</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">CPU</th>
                    <th className="px-5 py-3 text-right font-medium">Memory</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {containers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-zinc-500"
                      >
                        No containers found
                      </td>
                    </tr>
                  ) : (
                    containers.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-zinc-100">
                          {c.name}
                        </td>
                        <td className="px-5 py-3.5 text-zinc-400 font-mono text-xs">
                          {c.image}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right text-zinc-300">
                          {c.cpu_percent != null ? `${c.cpu_percent.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-zinc-300">
                          {c.memory_percent != null ? `${c.memory_percent.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setLogsContainer(c)}
                              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                              title="View logs"
                            >
                              <Terminal className="h-3.5 w-3.5" />
                            </button>
                            <Link
                              href={`/containers/${c.id}/edit`}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-md p-1.5 text-zinc-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                              title="Edit container"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                            {c.state?.toLowerCase() === "running" ? (
                              <>
                                <button
                                  onClick={() => void handleAction(c.id, "stop")}
                                  disabled={isActing(c.id)}
                                  className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                                  title="Stop"
                                >
                                  {isActing(c.id) &&
                                  actionState?.action === "stop" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Square className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    void handleAction(c.id, "restart")
                                  }
                                  disabled={isActing(c.id)}
                                  className="rounded-md p-1.5 text-zinc-400 hover:bg-yellow-500/20 hover:text-yellow-400 transition-colors disabled:opacity-50"
                                  title="Restart"
                                >
                                  {isActing(c.id) &&
                                  actionState?.action === "restart" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => void handleAction(c.id, "start")}
                                disabled={isActing(c.id)}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors disabled:opacity-50"
                                title="Start"
                              >
                                {isActing(c.id) &&
                                actionState?.action === "start" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => void handleDelete(c.id, c.name)}
                              disabled={isActing(c.id) || deletingId === c.id}
                              className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                              title="Delete container"
                            >
                              {deletingId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
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

      {logsContainer && (
        <LogModal
          container={logsContainer}
          onClose={() => setLogsContainer(null)}
        />
      )}
    </>
  );
}
