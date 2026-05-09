"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Email or password incorrect.");
      return;
    }

    const { role } = await res.json();

    if (next) {
      router.push(next);
    } else if (role === "installer") {
      router.push("/installer");
    } else {
      router.push("/jobs");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-2">
            Advanced Custom Cabinets
          </p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">
            Sign In
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
              Email or Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="you@advancedcabinets.net"
              className="w-full bg-white/5 border border-white/15 rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
            />
          </div>
          <div>
            <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-8 text-center text-white/20 text-xs font-condensed">
          Need access? Contact your ACC project manager.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111]" />}>
      <LoginForm />
    </Suspense>
  );
}
