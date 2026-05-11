"use client";

import { useEffect, useState } from "react";

type BuilderAccount = {
  id: string;
  username: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  active: number;
  created_at: string;
  role: "admin" | "user" | "engineer" | "pm" | "installer" | "partner";
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
      {children}
    </label>
  );
}
function TextIn({
  value, onChange, placeholder, type = "text",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
    />
  );
}

const EMPTY_FORM = { username: "", password: "", name: "", company: "", email: "", phone: "", role: "user" as "user" | "admin" | "engineer" | "pm" | "installer" | "partner" };
const ROLE_LABELS: Record<string, string> = {
  pm:        "PM (job assignment dropdown)",
  user:      "User (Express portal)",
  engineer:  "Engineer (spec edits)",
  admin:     "Admin (manage accounts)",
  installer: "Installer",
  partner:   "Partner / Builder",
};

export default function BuildersAdminPage() {
  const [accounts, setAccounts] = useState<BuilderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/builders");
    setAccounts(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const res = await fetch("/api/admin/builders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setSuccess(`Account created (role: ${form.role}).`);
      setForm(EMPTY_FORM);
      load();
    } else {
      const { error: msg } = await res.json();
      setError(msg ?? "Failed to create account.");
    }
    setSaving(false);
  }

  async function toggleActive(account: BuilderAccount) {
    await fetch("/api/admin/builders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, active: account.active === 1 ? 0 : 1 }),
    });
    load();
  }

  async function setRole(account: BuilderAccount, newRole: string) {
    if (account.role === "admin" && newRole !== "admin") {
      const adminCount = accounts.filter((a) => a.role === "admin" && a.active === 1).length;
      if (adminCount <= 1) {
        alert("Cannot change the last admin's role. Promote another user to admin first.");
        return;
      }
      if (!confirm(`Change ${account.name} from admin to ${newRole}? They will lose access to /admin/**.`)) return;
    }
    await fetch("/api/admin/builders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, role: newRole }),
    });
    setSuccess(`${account.name} → ${ROLE_LABELS[newRole] ?? newRole}`);
    load();
  }

  async function handleDelete(id: string, name: string, role: string) {
    if (role === "admin") {
      const adminCount = accounts.filter((a) => a.role === "admin" && a.active === 1).length;
      if (adminCount <= 1) {
        alert("Cannot delete the last admin.");
        return;
      }
    }
    if (!confirm(`Delete account for ${name}? This cannot be undone.`)) return;
    await fetch(`/api/admin/builders?id=${id}`, { method: "DELETE" });
    load();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || !resetPw) return;
    setResetSaving(true);
    await fetch("/api/admin/builders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: resetId, password: resetPw }),
    });
    setResetId(null);
    setResetPw("");
    setResetSaving(false);
    setSuccess("Password updated.");
  }

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
            Advanced Custom Cabinets
          </p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            User Accounts
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/admin/libraries" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Libraries
          </a>
          <a href="/admin/portal-accounts" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Portal Accounts
          </a>
          <a href="/jobs" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Jobs
          </a>
        </nav>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
          >
            Sign Out
          </button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* New User account form */}
        <section>
          <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-6 pb-1 border-b border-white/10">
            New User Account
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <Label>Username *</Label>
              <TextIn value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="e.g. jsmith or jsmith@advancedcabinets.net" />
            </div>
            <div>
              <Label>Password *</Label>
              <TextIn value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" placeholder="Temporary password" />
            </div>
            <div>
              <Label>Full Name *</Label>
              <TextIn value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="John Smith" />
            </div>
            <div>
              <Label>Role *</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "user" | "admin" })}
                className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
              >
                  <option value="pm">PM (job assignment dropdown)</option>
                <option value="user">User (Express portal)</option>
                <option value="engineer">Engineer (spec edits)</option>
                <option value="admin">Admin (manage accounts)</option>
                <option value="installer">Installer</option>
                <option value="partner">Partner / Builder</option>
              </select>
            </div>
            <div>
              <Label>Company</Label>
              <TextIn value={form.company} onChange={(v) => setForm({ ...form, company: v })} placeholder="ACC, Smith Builders LLC..." />
            </div>
            <div>
              <Label>Email</Label>
              <TextIn value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" placeholder="john@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <TextIn value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="(208) 555-0100" />
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <button
                type="submit"
                disabled={saving || !form.username || !form.password || !form.name}
                className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors disabled:opacity-40"
              >
                {saving ? "Creating..." : "Create Account"}
              </button>
              {error   && <span className="text-red-400 text-xs">{error}</span>}
              {success && <span className="text-green-400 text-xs">{success}</span>}
            </div>
          </form>
        </section>

        {/* Account list */}
        <section>
          <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-6 pb-1 border-b border-white/10">
            All Accounts ({accounts.length})
          </h2>

          {loading ? (
            <p className="text-white/30 text-sm">Loading...</p>
          ) : accounts.length === 0 ? (
            <p className="text-white/30 text-sm">No accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-4 px-4 py-3 rounded border ${
                    a.active === 1 ? "border-white/10 bg-white/3" : "border-white/5 bg-white/1 opacity-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-condensed uppercase tracking-widest text-sm text-white">
                        {a.name}
                      </span>
                      <span className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded ${
                        a.role === "admin"
                          ? "text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/30"
                          : a.role === "pm"
                          ? "text-blue-300 bg-blue-900/30 border border-blue-400/30"
                          : a.role === "engineer"
                          ? "text-purple-300 bg-purple-900/30 border border-purple-400/30"
                          : "text-white/40 bg-white/5 border border-white/10"
                      }`}>
                        {a.role}
                      </span>
                      <span className="text-white/30 text-xs font-mono">{a.username}</span>
                      {a.active !== 1 && (
                        <span className="text-white/30 font-condensed uppercase text-xs">Inactive</span>
                      )}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5 space-x-3">
                      {a.company && <span>{a.company}</span>}
                      {a.email   && <span>{a.email}</span>}
                      {a.phone   && <span>{a.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <select
                      value={a.role}
                      onChange={(e) => setRole(a, e.target.value)}
                      className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs font-condensed focus:outline-none focus:border-[#f08122]/60"
                    >
                      <option value="pm">PM</option>
                      <option value="user">User</option>
                      <option value="engineer">Engineer</option>
                      <option value="admin">Admin</option>
                      <option value="installer">Installer</option>
                      <option value="partner">Partner</option>
                    </select>
                    <button
                      onClick={() => { setResetId(a.id); setResetPw(""); setSuccess(""); }}
                      className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-3 py-1.5 border border-white/10 rounded transition-colors"
                    >
                      Reset PW
                    </button>
                    <button
                      onClick={() => toggleActive(a)}
                      className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-3 py-1.5 border border-white/10 rounded transition-colors"
                    >
                      {a.active === 1 ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDelete(a.id, a.name, a.role)}
                      className="text-red-400/50 hover:text-red-400 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 border border-red-400/10 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reset password modal */}
        {resetId && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <form
              onSubmit={handleResetPassword}
              className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-sm space-y-4"
            >
              <p className="font-condensed uppercase tracking-widest text-xs text-[#f08122]">
                Reset Password
              </p>
              <p className="text-white/50 text-xs">
                {accounts.find((a) => a.id === resetId)?.name}{" "}-{" "}
                {accounts.find((a) => a.id === resetId)?.username}
              </p>
              <div>
                <Label>New Password</Label>
                <TextIn value={resetPw} onChange={setResetPw} type="password" placeholder="New password" />
              </div>
              <div className="flex gap