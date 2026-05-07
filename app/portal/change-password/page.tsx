"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setErr("New passwords don't match"); return; }
    if (next.length < 8)  { setErr("New password must be at least 8 characters"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/portal/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b.error ?? "Failed");
        return;
      }
      router.push("/portal/jobs");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#111] text-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-[#2d2d2d] rounded p-8 w-full max-w-sm space-y-5">
        <h1 className="text-white font-heading text-xl uppercase tracking-wide">Set a new password</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest">First-login required.</p>
        <Field label="Current password" value={current} onChange={setCurrent} type="password" autoComplete="current-password" />
        <Field label="New password"     value={next}    onChange={setNext}    type="password" autoComplete="new-password" />
        <Field label="Confirm new"      value={confirm} onChange={setConfirm} type="password" autoComplete="new-password" />
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <button type="submit" disabled={busy} className="w-full bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 rounded disabled:opacity-50">
          {busy ? "Saving..." : "Save"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <div>
      <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
        className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]" />
    </div>
  );
}
