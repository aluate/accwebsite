"use client";

import { useEffect, useState } from "react";

type Role = "karl" | "admin" | "pm" | "engineer" | "shop" | "installer";

type BuilderAccount = {
  id: string;
  username: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  active: number;
  created_at: string;
  role: Role;
};

const ROLES: Role[] = ["karl", "admin", "pm", "engineer", "shop", "installer"];

const ROLE_LABELS: Record<Role, string> = {
  admin:     "Admin",
  pm:        "PM",
  engineer:  "Engineer",
  shop:      "Shop",
  installer: "Installer",
};

// What each role can access — shown in the role description
const ROLE_DESC: Record<Role, string> = {
  admin:     "Full access: jobs, schedule, admin panel",
  pm:        "Jobs, schedule, spec editing",
  engineer:  "Engineering queue + job detail",
  shop:      "Jobs + schedule (read-only)",
  installer: "Mobile install calendar",
};

const ROLE_BADGE: Record<Role, string> = {
  admin:     "text-[#f08122] bg-[#f08122]/15 border-[#f08122]/30",
  pm:        "text-blue-300 bg-blue-900/30 border-blue-400/30",
  engineer:  "text-purple-300 bg-purple-900/30 border-purple-400/30",
  shop:      "text-green-300 bg-green-900/30 border-green-400/30",
  installer: "text-yellow-300 bg-yellow-900/30 border-yellow-400/30",
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

const EMPTY_FORM = {
  username: "", password: "", name: "", company: "",
  email: "", phone: "", role: "pm" as Role,
};

export default function BuildersAdminPage() {
  const [accounts, setAccounts] = useState<BuilderAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  // Reset password modal
  const [resetId, setResetId]     = useState<string | null>(null);
  const [resetPw, setResetPw]     = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // Edit account modal
  const [editAccount, setEditAccount] = useState<BuilderAccount | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", username: "" });
  const [editSaving, setEditSaving] = useState(false);

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
      setSuccess(`Account created — ${form.name} (${ROLE_LABELS[form.role]}). They'll be prompted to change their password on first login.`);
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
    if ((account.role === "admin" || account.role === "karl") && newRole !== "admin" && newRole !== "karl") {
      const adminCount = accounts.filter((a) => (a.role === "admin" || a.role === "karl") && a.active === 1).length;
      if (adminCount <= 1) {
        alert("Cannot change the last admin's role. Promote another user to admin first.");
        return;
      }
      if (!confirm(`Change ${account.name} from Admin to ${ROLE_LABELS[newRole as Role] ?? newRole}? They will lose admin panel access.`)) return;
    }
    await fetch("/api/admin/builders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, role: newRole }),
    });
    setSuccess(`${account.name} → ${ROLE_LABELS[newRole as Role] ?? newRole}`);
    load();
  }

  async function handleDelete(id: string, name: string, role: string) {
    if (role === "admin" || role === "karl") {
      const adminCount = accounts.filter((a) => (a.role === "admin" || a.role === "karl") && a.active === 1).length;
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
    setSuccess("Password updated. They'll be prompted to change it on next login.");
  }

  function openEdit(a: BuilderAccount) {
    setEditAccount(a);
    setEditForm({ name: a.name, email: a.email ?? "", phone: a.phone ?? "", username: a.username });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editAccount) return;
    setEditSaving(true);
    const res = await fetch("/api/admin/builders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editAccount.id,
        name:     editForm.name     || undefined,
        email:    editForm.email    || null,
        phone:    editForm.phone    || null,
        username: editForm.username || undefined,
      }),
    });
    if (res.ok) {
      setSuccess(`${editForm.name} updated.`);
      setEditAccount(null);
      load();
    } else {
      const { error: msg } = await res.json();
      alert(msg ?? "Failed to update account.");
    }
    setEditSaving(false);
  }

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-6">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
            Advanced Custom Cabinets
          </p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            User Accounts
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/admin/estimating" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Estimating
          </a>
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

        {/* Role legend */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {ROLES.map((r) => (
            <div key={r} className={`rounded border px-3 py-2 ${ROLE_BADGE[r]}`}>
              <p className="font-condensed uppercase tracking-widest text-[10px]">{ROLE_LABELS[r]}</p>
              <p className="text-[10px] mt-0.5 opacity-70">{ROLE_DESC[r]}</p>
            </div>
          ))}
        </section>

        {/* New account form */}
        <section>
          <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-6 pb-1 border-b border-white/10">
            New Account
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <Label>Username *</Label>
              <TextIn value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="e.g. jsmith" />
            </div>
            <div>
              <Label>Temporary Password *</Label>
              <TextIn value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" placeholder="They'll change it on first login" />
            </div>
            <div>
              <Label>Full Name *</Label>
              <TextIn value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="John Smith" />
            </div>
            <div>
              <Label>Role *</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESC[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Email</Label>
              <TextIn value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" placeholder="john@advancedcabinets.net" />
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
                      <span className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border ${ROLE_BADGE[a.role] ?? "text-white/40 bg-white/5 border-white/10"}`}>
                        {ROLE_LABELS[a.role] ?? a.role}
                      </span>
                      <span className="text-white/30 text-xs font-mono">{a.username}</span>
                      {a.active !== 1 && (
                        <span className="text-white/30 font-condensed uppercase text-xs">Inactive</span>
                      )}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5 space-x-3">
                      {a.email && <span>{a.email}</span>}
                      {a.phone && <span>{a.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <select
                      value={a.role}
                      onChange={(e) => setRole(a, e.target.value)}
                      className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs font-condensed focus:outline-none focus:border-[#f08122]/60"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => openEdit(a)}
                      className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-3 py-1.5 border border-white/10 rounded transition-colors"
                    >
                      Edit
                    </button>
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

        {/* Edit account modal */}
        {editAccount && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <form
              onSubmit={handleEdit}
              className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-sm space-y-4"
            >
              <p className="font-condensed uppercase tracking-widest text-xs text-[#f08122]">
                Edit Account
              </p>
              <div>
                <Label>Full Name</Label>
                <TextIn value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} placeholder="Full name" />
              </div>
              <div>
                <Label>Username</Label>
                <TextIn value={editForm.username} onChange={(v) => setEditForm({ ...editForm, username: v })} placeholder="Username" />
              </div>
              <div>
                <Label>Email</Label>
                <TextIn value={editForm.email} onChange={(v) => setEditForm({ ...editForm, email: v })} type="email" placeholder="email@advancedcabinets.net" />
              </div>
              <div>
                <Label>Phone</Label>
                <TextIn value={editForm.phone} onChange={(v) => setEditForm({ ...editForm, phone: v })} placeholder="555-123-4567" />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-sm px-5 py-2 rounded transition-colors"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditAccount(null)}
                  className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-sm px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

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
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={resetSaving}
                  className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-sm px-5 py-2 rounded transition-colors"
                >
                  {resetSaving ? "Saving…" : "Reset Password"}
                </button>
                <button
                  type="button"
                  onClick={() => { setResetId(null); setResetPw(""); }}
                  className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-sm px-4 py-2 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
