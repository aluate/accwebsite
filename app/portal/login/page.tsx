"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Login failed");
        return;
      }
      router.push(body.redirect ?? "/portal/jobs");
    } catch {
      setErr("Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-[#2d2d2d] rounded p-8 w-full max-w-sm space-y-5">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Advanced Custom Cabinets</p>
          <h1 className="text-white font-heading text-2xl uppercase tracking-wide mt-1">Builder Portal</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">Sign in to view your jobs</p>
        </div>
        <div>
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Username</label>
          <input
            value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none"
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]"
            required
          />
        </div>
        <div>
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]"
            required
          />
        </div>
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 rounded disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest text-center">
          Forgot your password? Email <span className="text-white/60">residential@advancedcabinets.net</span>
        </p>
      </form>
    </main>
  );
}
