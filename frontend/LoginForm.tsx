'use client';

import { useState } from 'react';

function ForgotKeyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Recover API Key</h3>
        <p className="text-xs text-gray-400 mb-2">If the key file still exists:</p>
        <code className="block bg-gray-800 text-green-400 text-xs rounded px-3 py-2 mb-4 select-all">
          cat /root/vcs-container-guard/.install-key.txt
        </code>
        <p className="text-xs text-gray-400 mb-2">If the file was deleted, reset the key:</p>
        <code className="block bg-gray-800 text-green-400 text-xs rounded px-3 py-2 mb-4 select-all">
          cd /root/vcs-container-guard && npm run reset-key
        </code>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

interface LoginFormProps {
  onLogin: (apiKey: string) => Promise<void>;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      await onLogin(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="api-key" className="text-sm font-medium text-gray-300">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Enter your API key"
          />
          <p className="text-xs text-gray-500 mt-0.5">
            Your API key was shown once during installation.
          </p>
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="self-start text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
          >
            Forgot key?
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 rounded-md bg-red-950/40 border border-red-900/50 px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !apiKey.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Authenticating…' : 'Sign in'}
        </button>
      </form>

      {showForgot && <ForgotKeyModal onClose={() => setShowForgot(false)} />}
    </>
  );
}
