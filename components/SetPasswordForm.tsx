"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function strength(pw: string) {
  const checks = [pw.length >= 8, /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  return checks.filter(Boolean).length; // 0..3
}

export default function SetPasswordForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const score = strength(password);
  const labels = ["Too weak", "Weak", "Okay", "Strong"];
  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-c9-green"];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not set password.");
        return;
      }
      router.push(data.redirect ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">
          Welcome, {displayName}.
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Please set your password to continue.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-c9-green focus:outline-none focus:ring-1 focus:ring-c9-green"
              required
            />
            {password.length > 0 && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200">
                  <div
                    className={`h-full ${colors[score - 1] ?? "bg-red-400"}`}
                    style={{ width: `${(score / 3) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {labels[score - 1] ?? labels[0]}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-c9-green focus:outline-none focus:ring-1 focus:ring-c9-green"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-c9-green py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
