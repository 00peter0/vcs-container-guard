"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Shield, AlertTriangle, Wrench, Clock, Box, Network, Globe, Lock } from "lucide-react";
import { type Issue } from "@/lib/api";
import { getRuleDescription } from "@/lib/rule-descriptions";
import { SeverityBadge } from "./SeverityBadge";
import { StatusBadge } from "./StatusBadge";
import { formatRelativeTime } from "@/lib/utils";

interface PortInfo {
  hostIp: string;
  hostPort: string;
  containerPort: string;
  protocol: string;
}

interface ContainerDetail {
  id: string;
  name: string;
  ports: PortInfo[];
  ipAddress?: string | null;
  networks?: Array<{ name: string; ipAddress: string | null; gateway: string | null }>;
}

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
}

export function IssueDetailModal({ issue, onClose }: IssueDetailModalProps) {
  const rule = getRuleDescription(issue.rule_id);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [networks, setNetworks] = useState<Array<{ name: string; ipAddress: string | null }>>([]);

  useEffect(() => {
    if (!issue.docker_id) return;
    fetch(`/guard/api/proxy/containers/${issue.docker_id}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: ContainerDetail | null) => {
        if (data?.ports) setPorts(data.ports);
        if (data?.networks) setNetworks(data.networks);
      })
      .catch(() => {});
  }, [issue.docker_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <SeverityBadge severity={issue.severity} />
            <h2 className="text-lg font-semibold text-zinc-100">{rule.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Affected resource */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4 space-y-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Affected Resource</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">Container</p>
                  <p className="text-sm font-medium text-zinc-100">{issue.container_name ?? "Unknown"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Image</p>
                <p className="text-sm font-mono text-zinc-300">{issue.image ?? "Unknown"}</p>
              </div>
              {issue.docker_id && (
                <div>
                  <p className="text-xs text-zinc-500">Docker ID</p>
                  <p className="text-sm font-mono text-zinc-300">{issue.docker_id.slice(0, 12)}</p>
                </div>
              )}
              {networks.filter(n => n.ipAddress).map((net, i) => (
                <div key={i}>
                  <p className="text-xs text-zinc-500">{net.name} IP</p>
                  <p className="text-sm font-mono text-zinc-300">{net.ipAddress}</p>
                </div>
              ))}
            </div>

            {/* Port bindings */}
            {ports.length > 0 && (
              <div className="pt-2 border-t border-zinc-700 space-y-2">
                <p className="text-xs font-medium text-zinc-500">Network Ports</p>
                <div className="space-y-1.5">
                  {ports.map((p, i) => {
                    const isExternal = p.hostIp === "0.0.0.0" || p.hostIp === "::";
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {isExternal ? (
                          <Globe className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                        )}
                        <span className="font-mono text-zinc-300">
                          {p.hostIp}:{p.hostPort}
                        </span>
                        <span className="text-zinc-600">→</span>
                        <span className="font-mono text-zinc-400">
                          {p.containerPort}/{p.protocol}
                        </span>
                        {isExternal && (
                          <span className="text-xs text-red-400 font-medium">EXTERNAL</span>
                        )}
                        {!isExternal && (
                          <span className="text-xs text-cyan-400 font-medium">LOCAL</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ports.length === 0 && !issue.host_port && (
              <div className="pt-2 border-t border-zinc-700">
                <p className="text-xs text-zinc-500">No port bindings</p>
              </div>
            )}
          </div>

          {/* Status & timing */}
          <div className="flex flex-wrap gap-3 items-center">
            <StatusBadge status={issue.status} />
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="h-3.5 w-3.5" />
              First seen {formatRelativeTime(issue.first_seen_at)}
            </div>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-400">
              Last seen {formatRelativeTime(issue.last_seen_at)}
            </span>
          </div>

          {/* Backend message */}
          {issue.message && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <p className="text-sm text-yellow-200">{issue.message}</p>
            </div>
          )}

          {/* What is this */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Shield className="h-4 w-4 text-blue-400" />
              What is this?
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{rule.description}</p>
          </div>

          {/* Risk */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              What's the risk?
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{rule.risk}</p>
          </div>

          {/* How to fix */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Wrench className="h-4 w-4 text-cyan-400" />
              How to fix it
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{rule.fix}</p>
          </div>

          {/* Scanner suggestion */}
          {issue.suggestion && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Scanner Suggestion</p>
              <p className="text-sm text-zinc-400">{issue.suggestion}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-4 flex gap-3">
          {(issue.rule_id === "exposed-port" || issue.rule_id === "privileged-container" || issue.rule_id === "running-as-root") && issue.docker_id && (
            <Link
              href={`/containers/${issue.docker_id}/edit`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
            >
              <Wrench className="h-4 w-4" />
              {issue.rule_id === "exposed-port" && "Fix: Change to Local Port"}
              {issue.rule_id === "privileged-container" && "Fix: Disable Privileged Mode"}
              {issue.rule_id === "running-as-root" && "Fix: Set Non-Root User"}
            </Link>
          )}
          <button
            onClick={onClose}
            className={`rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors ${
              (issue.rule_id === "exposed-port" || issue.rule_id === "privileged-container" || issue.rule_id === "running-as-root") && issue.docker_id ? "" : "w-full"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
