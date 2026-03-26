"use client";

import { useState, useEffect } from "react";
import { Folder, ChevronRight, HardDrive, ArrowUp, X, Check, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface FileItem {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number | null;
}

interface BrowseResult {
  current_path: string;
  parent_path: string | null;
  items: FileItem[];
  disk: {
    total: number;
    used: number;
    available: number;
    use_percent: string;
  };
}

interface DirectoryPickerProps {
  value: string;
  onChange: (path: string) => void;
  label?: string;
  placeholder?: string;
}

function DirectoryPickerModal({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function browse(path: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/guard/api/proxy/filesystem/browse?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to browse" }));
        throw new Error((err as { error: string }).error);
      }
      const result = (await res.json()) as BrowseResult;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void browse(initialPath || "/root");
  }, [initialPath]);

  const directories = data?.items.filter((i) => i.type === "directory") ?? [];
  const breadcrumbs = data?.current_path.split("/").filter(Boolean) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Select Directory</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="border-b border-zinc-800 px-5 py-2.5 flex items-center gap-1 text-xs overflow-x-auto">
          <button
            onClick={() => void browse("/")}
            className="text-zinc-400 hover:text-zinc-100 transition-colors flex-shrink-0"
          >
            /
          </button>
          {breadcrumbs.map((crumb, i) => {
            const path = "/" + breadcrumbs.slice(0, i + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="h-3 w-3 text-zinc-600" />
                <button
                  onClick={() => void browse(path)}
                  className={`transition-colors ${
                    i === breadcrumbs.length - 1
                      ? "text-zinc-100 font-medium"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {crumb}
                </button>
              </span>
            );
          })}
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}

          {error && (
            <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Go up */}
              {data?.parent_path && (
                <button
                  onClick={() => void browse(data.parent_path!)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                >
                  <ArrowUp className="h-4 w-4" />
                  <span>..</span>
                </button>
              )}

              {directories.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No subdirectories
                </div>
              )}

              {directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => void browse(dir.path)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{dir.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer — disk info + select button */}
        <div className="border-t border-zinc-800 px-5 py-3 space-y-3">
          {data?.disk && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <HardDrive className="h-3.5 w-3.5" />
              <span>
                {formatBytes(data.disk.available)} free of {formatBytes(data.disk.total)} ({data.disk.use_percent} used)
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-mono text-zinc-300 truncate">
              {data?.current_path ?? "..."}
            </div>
            <button
              onClick={() => {
                if (data) {
                  onSelect(data.current_path);
                  onClose();
                }
              }}
              disabled={!data}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DirectoryPicker({ value, onChange, label, placeholder }: DirectoryPickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <div className="space-y-1.5">
        {label && (
          <label className="text-xs font-medium text-zinc-400">{label}</label>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? "/path/to/directory"}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono"
          />
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
          >
            <Folder className="h-3.5 w-3.5" />
            Browse
          </button>
        </div>
      </div>

      {showPicker && (
        <DirectoryPickerModal
          initialPath={value || "/root"}
          onSelect={onChange}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
