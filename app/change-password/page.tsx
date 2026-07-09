"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setLoading(false);

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Something went wrong.");
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/jobs"), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-2">
            Advanced Custom Cabinets
          </p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">
            Change Password
          </h1>
          <p className="text-white/40 text-xs font-condensed mt-2">
            Choose a new password for your account.
          </p>
        </div>

        {success ? (
          <div className="text-center py-8">
            <p className="text-green-400 font-condensed uppercase tracking-widest text-sm">
              Password updated — redirecting…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
                Current Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
              />
            </div>
            <div>
              <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
                New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
              />
            </div>
            <div>
              <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
              />
            </div>

            {error && <p className="text-red-400 text-xs font-condensed">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-3 rounded transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? "Saving…" : "Update Password"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/jobs")}
              className="w-full text-white/30 hover:text-white/60 font-condensed uppercase tracking-widest text-xs py-2 transition-colors"
            >
              Skip for now
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
