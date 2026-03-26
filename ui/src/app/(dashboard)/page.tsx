"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Container,
  Disc3,
  ShieldAlert,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { TopBar } from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime, formatBytes } from "@/lib/utils";
import type { DashboardStats, Issue } from "@/lib/api";

type ContainerItem = { id: string; name: string; image: string; state: string; status: string };
type ImageItem = { id: string; repoTags: string[]; size: number; created: string };

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/guard/api/proxy/stats").then((r) => r.json()),
      fetch("/guard/api/proxy/issues?limit=10").then((r) => r.json()),
      fetch("/guard/api/proxy/containers").then((r) => r.json()),
      fetch("/guard/api/proxy/images").then((r) => r.json()),
    ])
      .then(([statsData, issuesData, containersData, imagesData]) => {
        setStats(statsData);
        setIssues(Array.isArray(issuesData) ? issuesData : (issuesData.issues ?? []));
        setContainers(Array.isArray(containersData) ? containersData : (containersData.containers ?? []));
        setImages(Array.isArray(imagesData) ? imagesData : (imagesData.images ?? []));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Container security overview"
      />

      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-zinc-400">Loading dashboard...</div>
        </div>
      )}

      {error && (
        <div className="m-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load dashboard data: {error}
        </div>
      )}

      {!loading && !error && stats && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Running Containers"
              value={containers.filter(c => c.state === "running").length}
              icon={Activity}
              iconClassName="bg-cyan-500/10 text-cyan-400"
            />
            <StatCard
              title="Stopped Containers"
              value={containers.filter(c => c.state !== "running").length}
              icon={Container}
              iconClassName="bg-zinc-700 text-zinc-400"
            />
            <StatCard
              title="Total Images"
              value={images.length}
              icon={Disc3}
              iconClassName="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              title="Open Issues"
              value={stats.open_issues}
              icon={ShieldAlert}
              iconClassName={
                stats.open_issues > 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-zinc-700 text-zinc-400"
              }
            />
          </div>

          {/* Two column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" style={{minHeight: 'calc(100vh - 240px)'}}>
            {/* Left — Recent Issues */}
            <div className="lg:col-span-3 rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col max-h-[calc(100vh-220px)]">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 flex-shrink-0">
                <h2 className="text-sm font-semibold text-zinc-100">Recent Issues</h2>
                <Link href="/issues" className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                  View all
                </Link>
              </div>
              <div className="overflow-y-auto flex-1">
                {issues.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-zinc-500">No issues found</div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {issues.map((issue) => (
                      <Link href="/issues" key={issue.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors">
                        <SeverityBadge severity={issue.severity} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">{issue.rule_id}</p>
                          <p className="text-xs text-zinc-400">{issue.container_name}</p>
                        </div>
                        <StatusBadge status={issue.status} />
                        <span className="flex-shrink-0 text-xs text-zinc-500">{formatRelativeTime(issue.last_seen_at)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right — Containers + Images */}
            <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-220px)] overflow-y-auto">
              {/* Containers panel */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-100">Containers</h2>
                  <span className="text-xs text-zinc-500">{containers.length} total</span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {containers.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${c.state === "running" ? "bg-cyan-400" : "bg-zinc-600"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">{c.name}</p>
                        <p className="truncate text-xs text-zinc-500">{c.image}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{c.status}</span>
                    </div>
                  ))}
                  {containers.length === 0 && (
                    <div className="px-5 py-4 text-center text-sm text-zinc-500">No containers</div>
                  )}
                </div>
              </div>

              {/* Images panel */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-100">Images</h2>
                  <span className="text-xs text-zinc-500">{images.length} total</span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {images.map((img) => {
                    const tag = img.repoTags?.[0] ?? "<none>";
                    return (
                      <div key={img.id} className="flex items-center justify-between px-5 py-3">
                        <p className="truncate text-sm text-zinc-100">{tag}</p>
                        <span className="text-xs text-zinc-500 flex-shrink-0 ml-3">{formatBytes(img.size)}</span>
                      </div>
                    );
                  })}
                  {images.length === 0 && (
                    <div className="px-5 py-4 text-center text-sm text-zinc-500">No images</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
