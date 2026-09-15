"use client";

/**
 * Who gets each automated email — and, while testing, sending all of it to
 * yourself instead.
 *
 * The screen is deliberately blunt about two things. Every email the system
 * can send is listed, including the ones that are written but never fire, so
 * "does moving a date email anyone?" is answerable by looking. And a live test
 * mode is a loud state, not a checkbox someone forgets: the banner stays at
 * the top of the page for as long as it is on.
 */

import { useEffect, useState } from "react";
import {
  NOTIFICATION_ROLES,
  ROLE_LABEL,
  type NotificationRole,
  type NotificationEvent,
  type NotificationAudience,
} from "@/lib/notification-events";

type Route = {
  toRoles: NotificationRole[];
  toFixed: string[];
  ccRoles: NotificationRole[];
  ccFixed: string[];
  enabled: boolean;
};
type Row = { event: NotificationEvent; route: Route; overridden: boolean };
type TestMode = { active: boolean; addresses: Partial<Record<NotificationRole, string>>; fallback: string | null };

const INPUT =
  "w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]";
const LBL = "block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1";

const AUDIENCE_LABEL: Record<NotificationAudience, string> = {
  client: "Reaches the customer",
  builder: "Reaches the builder",
  internal: "Internal",
};

/** The stand-in inboxes for a test run. */
const KARL_TEST: Partial<Record<NotificationRole, string>> = {
  pm: "residential@advancedcabinets.net",
  residential: "residential@advancedcabinets.net",
  engineer: "karlv@advancedcabinets.net",
  karl: "karlv@advancedcabinets.net",
  sender: "karlv@advancedcabinets.net",
  shop: "karlv@advancedcabinets.net",
  client: "karlvaage94@gmail.com",
  builder: "karlvaage208@gmail.com",
};

export default function NotificationSettingsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [test, setTest] = useState<TestMode>({ active: false, addresses: {}, fallback: null });
  const [loading, setLoading] = useState(true);
  /*
    TEST_EMAIL_OVERRIDE, an env var that redirects every message to one address.
    `set` means it exists; `inForce` means it is currently winning, which it
    only does while test mode is off. Without this, the screen described a
    routing table that production was quietly ignoring.
  */
  const [override, setOverride] = useState<{ set: boolean; inForce: boolean }>({ set: false, inForce: false });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/notifications");
    if (res.ok) {
      const d = await res.json();
      setRows(d.routes ?? []);
      setTest(d.testMode ?? { active: false, addresses: {}, fallback: null });
      setOverride({ set: !!d.overrideSet, inForce: !!d.overrideInForce });
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function saveTest(next: TestMode) {
    setTest(next);
    const res = await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testMode: next }),
    });
    if (res.ok) setMsg({ kind: "ok", text: next.active ? "Test mode ON — nothing is reaching a real recipient." : "Test mode off. Email is going to the real recipients again." });
    else setMsg({ kind: "err", text: (await res.json()).error ?? "Could not save" });
  }

  async function saveRoute(key: string, route: Route) {
    const res = await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: {
          event_key: key,
          to_roles: route.toRoles, to_fixed: route.toFixed,
          cc_roles: route.ccRoles, cc_fixed: route.ccFixed,
          enabled: route.enabled,
        },
      }),
    });
    if (res.ok) { setMsg({ kind: "ok", text: "Saved." }); void load(); }
    else setMsg({ kind: "err", text: (await res.json()).error ?? "Could not save" });
  }

  if (loading) return <p className="text-white/40 text-sm">Loading…</p>;

  const groups: NotificationAudience[] = ["client", "builder", "internal"];

  return (
    <div className="space-y-8">
      {override.inForce && (
        <div className="border border-red-500 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="font-condensed uppercase tracking-widest text-red-400 text-sm">
            An environment variable is overriding this screen
          </p>
          <p className="text-white/70 text-xs mt-1">
            <code className="text-white/90">TEST_EMAIL_OVERRIDE</code> is set on the server, and with
            test mode off it sends every automated email to that one address — whatever the routes
            below say. Turn test mode on to use the per-role addresses instead, or remove the variable
            in the hosting settings and redeploy.
          </p>
        </div>
      )}

      {override.set && !override.inForce && (
        <div className="border border-white/15 bg-white/[0.03] rounded-lg px-4 py-3">
          <p className="text-white/50 text-xs">
            <code className="text-white/70">TEST_EMAIL_OVERRIDE</code> is set on the server but is not
            being used: test mode is on, so the per-role addresses below are what happens. If test mode
            is switched off, that variable takes over and everything goes to one address.
          </p>
        </div>
      )}

      {test.active && (
        <div className="border border-[#f08122] bg-[#f08122]/10 rounded-lg px-4 py-3">
          <p className="font-condensed uppercase tracking-widest text-[#f08122] text-sm">Test mode is on</p>
          <p className="text-white/70 text-xs mt-1">
            Every automated email is being redirected to the addresses below. No client, builder or
            supplier is receiving anything, and each message says who it would really have gone to.
          </p>
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {/* ── test mode ───────────────────────────────────────────────── */}
      <section className="bg-[#232425] border border-white/10 rounded-lg p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-condensed uppercase tracking-widest text-white text-sm">Test mode</h2>
            <p className="text-white/40 text-xs mt-1 max-w-2xl">
              Send every automated email to yourself instead of the real recipients, split by role so a
              walk through a whole job lands in four inboxes you can tell apart.
            </p>
          </div>
          <button
            onClick={() => void saveTest({ ...test, active: !test.active })}
            className={`shrink-0 text-xs font-condensed uppercase tracking-widest rounded px-4 py-2 transition-colors ${
              test.active
                ? "bg-[#f08122] text-white hover:bg-[#d9711e]"
                : "border border-white/20 text-white/60 hover:text-white hover:border-white/40"
            }`}
          >
            {test.active ? "Turn off" : "Turn on"}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["client", "builder", "pm", "engineer"] as NotificationRole[]).map((role) => (
            <div key={role}>
              <label className={LBL}>{ROLE_LABEL[role]}</label>
              <input
                className={INPUT}
                placeholder="nobody@example.com"
                value={test.addresses[role] ?? ""}
                onChange={(e) => setTest({ ...test, addresses: { ...test.addresses, [role]: e.target.value } })}
              />
            </div>
          ))}
          {(["shop", "residential", "karl", "sender"] as NotificationRole[]).map((role) => (
            <div key={role}>
              <label className={LBL}>{ROLE_LABEL[role]}</label>
              <input
                className={INPUT}
                placeholder="nobody@example.com"
                value={test.addresses[role] ?? ""}
                onChange={(e) => setTest({ ...test, addresses: { ...test.addresses, [role]: e.target.value } })}
              />
            </div>
          ))}
          <div>
            <label className={LBL}>Fallback — anything unmapped</label>
            <input
              className={INPUT}
              placeholder="karlv@advancedcabinets.net"
              value={test.fallback ?? ""}
              onChange={(e) => setTest({ ...test, fallback: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={() => setTest({ ...test, addresses: { ...KARL_TEST }, fallback: "karlv@advancedcabinets.net" })}
            className="text-xs font-condensed uppercase tracking-widest border border-white/15 text-white/50 hover:text-white rounded px-3 py-1.5 transition-colors"
          >
            Fill in Karl&apos;s test inboxes
          </button>
          <button
            onClick={() => void saveTest(test)}
            className="text-xs font-condensed uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded px-4 py-1.5 transition-colors"
          >
            Save addresses
          </button>
        </div>
      </section>

      {/* ── the events ──────────────────────────────────────────────── */}
      {groups.map((audience) => {
        const list = rows.filter((r) => r.event.audience === audience);
        if (!list.length) return null;
        return (
          <section key={audience}>
            <h2 className="font-condensed uppercase tracking-widest text-sm mb-1"
                style={{ color: audience === "client" ? "#f87171" : audience === "builder" ? "#fbbf24" : "#9ca3af" }}>
              {AUDIENCE_LABEL[audience]}
            </h2>
            <p className="text-white/30 text-xs mb-3">
              {audience === "client"
                ? "These land in a customer's inbox. Check them twice before turning test mode off."
                : audience === "builder"
                  ? "These go to the builder's contact for the job."
                  : "These stay inside ACC."}
            </p>
            <div className="space-y-3">
              {list.map((row) => (
                <EventRow key={row.event.key} row={row} onSave={(r) => void saveRoute(row.event.key, r)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EventRow({ row, onSave }: { row: Row; onSave: (r: Route) => void }) {
  const [route, setRoute] = useState<Route>(row.route);
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(route) !== JSON.stringify(row.route);

  const toggleRole = (field: "toRoles" | "ccRoles", role: NotificationRole) =>
    setRoute({
      ...route,
      [field]: route[field].includes(role) ? route[field].filter((r) => r !== role) : [...route[field], role],
    });

  const summary = [
    ...route.toRoles.map((r) => ROLE_LABEL[r].replace(/ \(.*\)$/, "")),
    ...route.toFixed,
  ].join(", ") || "nobody";

  return (
    <div className={`bg-[#232425] border rounded-lg ${route.enabled ? "border-white/10" : "border-white/5 opacity-60"}`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm">{row.event.label}</span>
            {!row.event.implemented && (
              <span className="text-[9px] font-condensed uppercase tracking-widest border border-yellow-500/50 text-yellow-500/90 rounded px-1.5 py-0.5">
                not sending yet
              </span>
            )}
            {row.overridden && (
              <span className="text-[9px] font-condensed uppercase tracking-widest border border-[#f08122]/50 text-[#f08122] rounded px-1.5 py-0.5">
                customised
              </span>
            )}
            {!route.enabled && (
              <span className="text-[9px] font-condensed uppercase tracking-widest border border-white/20 text-white/40 rounded px-1.5 py-0.5">
                off
              </span>
            )}
          </div>
          <p className="text-white/40 text-xs mt-0.5">{row.event.trigger}</p>
          <p className="text-white/60 text-xs mt-1">→ {summary}</p>
          {row.event.note && <p className="text-yellow-500/60 text-[11px] mt-1">{row.event.note}</p>}
        </div>
        <span className="text-white/30 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 py-4 space-y-4">
          {(["to", "cc"] as const).map((which) => {
            const rolesField = which === "to" ? "toRoles" : "ccRoles";
            const fixedField = which === "to" ? "toFixed" : "ccFixed";
            return (
              <div key={which}>
                <label className={LBL}>{which === "to" ? "To" : "Cc"} — people on the job</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {NOTIFICATION_ROLES.map((role) => {
                    const on = route[rolesField].includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(rolesField, role)}
                        className={`text-[11px] font-condensed uppercase tracking-widest rounded px-2 py-1 border transition-colors ${
                          on ? "bg-[#f08122]/20 border-[#f08122]/60 text-[#f08122]" : "border-white/10 text-white/40 hover:text-white/70"
                        }`}
                      >
                        {ROLE_LABEL[role].replace(/ \(.*\)$/, "")}
                      </button>
                    );
                  })}
                </div>
                <label className={LBL}>{which === "to" ? "To" : "Cc"} — fixed addresses</label>
                <input
                  className={INPUT}
                  placeholder="someone@advancedcabinets.net, someone-else@…"
                  value={route[fixedField].join(", ")}
                  onChange={(e) => setRoute({ ...route, [fixedField]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setRoute({ ...route, enabled: !route.enabled })}
              className="text-xs font-condensed uppercase tracking-widest border border-white/15 text-white/50 hover:text-white rounded px-3 py-1.5 transition-colors"
            >
              {route.enabled ? "Turn this email off" : "Turn this email on"}
            </button>
            <button
              onClick={() => onSave(route)}
              disabled={!dirty}
              className="text-xs font-condensed uppercase tracking-widest bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-30 text-white rounded px-4 py-1.5 transition-colors"
            >
              Save
            </button>
            {dirty && <span className="text-white/30 text-[11px]">unsaved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
