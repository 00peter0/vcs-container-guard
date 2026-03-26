"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { type Image as DockerImage } from "@/lib/api";
import { TopBar, RefreshButton } from "@/components/TopBar";
import { formatBytes, formatRelativeTime } from "@/lib/utils";

interface PullModalProps {
  onClose: () => void;
  onPull: (imageName: string) => Promise<void>;
}

function PullModal({ onClose, onPull }: PullModalProps) {
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onPull(imageName.trim());
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Pull Image</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Image name (e.g. nginx:latest)
            </label>
            <input
              type="text"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              placeholder="nginx:latest"
              autoFocus
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-400">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Image pulled successfully
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !imageName.trim()}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Pull
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ImagesPage() {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [showPull, setShowPull] = useState(false);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/guard/api/proxy/images");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DockerImage[];
      setImages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function handleDelete(imageId: string) {
    if (!confirm("Delete this image?")) return;
    setDeletingId(imageId);
    try {
      const res = await fetch(`/guard/api/proxy/images/${imageId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCheckUpdates() {
    setCheckingUpdates(true);
    try {
      const res = await fetch("/guard/api/proxy/images/check-updates", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check updates failed");
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function handlePull(imageName: string) {
    const res = await fetch("/guard/api/proxy/images/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageName }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadImages();
  }

  return (
    <>
      <TopBar
        title="Images"
        subtitle={`${images.length} images`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleCheckUpdates()}
              disabled={checkingUpdates}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${checkingUpdates ? "animate-spin" : ""}`}
              />
              Check Updates
            </button>
            <button
              onClick={() => setShowPull(true)}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Pull Image
            </button>
            <RefreshButton onClick={() => void loadImages()} loading={loading} />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && images.length === 0 ? (
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
                    <th className="px-5 py-3 text-left font-medium">Tag</th>
                    <th className="px-5 py-3 text-right font-medium">Size</th>
                    <th className="px-5 py-3 text-left font-medium">Created</th>
                    <th className="px-5 py-3 text-center font-medium">Update</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {images.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-zinc-500"
                      >
                        No images found
                      </td>
                    </tr>
                  ) : (
                    images.map((img) => {
                      const fullTag = img.repoTags?.[0] ?? "<none>:<none>";
                      const [imageName, imageTag] = fullTag.includes(":")
                        ? [fullTag.split(":").slice(0, -1).join(":"), fullTag.split(":").pop() ?? "latest"]
                        : [fullTag, "latest"];

                      return (
                        <tr
                          key={img.id}
                          className="hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="px-5 py-3.5 font-medium text-zinc-100">
                            {imageName}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-zinc-400">
                            {imageTag}
                          </td>
                          <td className="px-5 py-3.5 text-right text-zinc-300">
                            {formatBytes(img.size)}
                          </td>
                          <td className="px-5 py-3.5 text-zinc-400">
                            {formatRelativeTime(img.created)}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {img.update_available ? (
                              <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400 border border-yellow-500/30">
                                Available
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-500">Up to date</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => void handleDelete(img.id)}
                                disabled={deletingId === img.id}
                                className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                                title="Delete image"
                              >
                                {deletingId === img.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showPull && (
        <PullModal onClose={() => setShowPull(false)} onPull={handlePull} />
      )}
    </>
  );
}
