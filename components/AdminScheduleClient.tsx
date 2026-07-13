"use client";

import { useState, useEffect } from "react";
import type { Crew, CrewPto } from "@/lib/schedule-types";
import Link from "next/link";

type ChangeRequest = {
  id: string;
  job_event_id: string;
  reason: string;
  event_type: string;
  date_start: string | null;
  date_end:   string | null;
  job_client_name: string;
  job_id: string;
  requester_name: string;
  created_at: string;
};

type OnDeckJob = {
  job_id: string;
  client_name: string;
  site_address: string;
  event_count: number;
  event_types: string;
  note: string | null;
  latest_at: string;
};

type PtoRow = CrewPto & { crew_name: string };

type Props = {
  crews?: Crew[];
  pto?: PtoRow[];
  changeRequests?: ChangeRequest[];
  onDeckJobs?: OnDeckJob[];
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

export function AdminScheduleClient({ crews: initialCrews, pto: initialPto, changeRequests: initialCR, onDeckJobs: initialOnDeck }: Props = {}) {
  const [loading, setLoading] = useState(!initialCrews);
  const [tab, setTab] = useState<"queue" | "pto" | "crews" | "requests">("queue");

  const [crews, setCrews]                       = useState<Crew[]>(initialCrews ?? []);
  const [pto, setPto]                           = useState<PtoRow[]>(initialPto ?? []);
  const [changeRequests, setChangeRequests]     = useState<ChangeRequest[]>(initialCR ?? []);
  const [onDeckJobs, setOnDeckJobs]             = useState<OnDeckJob[]>(initialOnDeck ?? []);

  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (initialCrews) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    fetch("/api/admin/schedule/data", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        setCrews(d.crews ?? []);
        setPto(d.pto ?? []);
        setChangeRequests(d.changeRequests ?? []);
        setOnDeckJobs(d.onDeckJobs ?? []);
      })
      .catch(() => setFetchError(true))
      .finally(() => { clearTimeout(timer); setLoading(false); });
    return () => { ctrl.abort(); clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PTO form ──────────────────────────────────────────────────────────────
  const [crewId,    setCrewId]    = useState("");
  const [ptoStart,  setPtoStart]  = useState("");
  const [ptoEnd,    setPtoEnd]    = useState("");
  const [ptoNote,   setPtoNote]   = useState("");
  const [ptoState,  setPtoState]  = useState<"idle"|"submitting"|"ok"|"error">("idle");

  async function addPto() {
    if (!crewId || !ptoStart || !ptoEnd) return;
    setPtoState("submitting");
    const res = await fetch("/api/schedule/pto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crew_id: crewId, date_start: ptoStart, date_end: ptoEnd, note: ptoNote || undefined }),
    });
    if (res.ok) {
      const fresh = await fetch("/api/schedule/pto");
      if (fresh.ok) setPto(await fresh.json());
      setPtoState("ok");
      setCrewId(""); setPtoStart(""); setPtoEnd(""); setPtoNote("");
      setTimeout(() => setPtoState("idle"), 2000);
    } else {
      setPtoState("error");
    }
  }

  async function deletePto(id: string) {
    await fetch(`/api/schedule/pto?id=${id}`, { method: "DELETE" });
    setPto((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Change request review ─────────────────────────────────────────────────
  async function reviewRequest(id: string, action: "approve" | "deny") {
    await fetch(`/api/schedule/change-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setChangeRequests((prev) => prev.filter((r) => r.id !== id));
  }

  // ── Crews form ────────────────────────────────────────────────────────────
  const [crewName,    setCrewName]    = useState("");
  const [crewKind,    setCrewKind]    = useState<"inhouse"|"sub">("inhouse");
  const [crewPhone,   setCrewPhone]   = useState("");
  const [crewEmail,   setCrewEmail]   = useState("");
  const [crewNotes,   setCrewNotes]   = useState("");
  const [crewState,   setCrewState]   = useState<"idle"|"submitting"|"ok"|"error">("idle");
  const [crewErr,     setCrewErr]     = useState("");

  async function addCrew() {
    if (!crewName.trim()) { setCrewErr("Name is required."); return; }
    setCrewErr("");
    setCrewState("submitting");
    const res = await fetch("/api/schedule/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: crewName.trim(),
        kind: crewKind,
        contact_phone: crewPhone.trim() || null,
        contact_email: crewEmail.trim() || null,
        notes: crewNotes.trim() || null,
      }),
    });
    if (res.ok) {
      const newCrew = await res.json();
      setCrews((prev) => [...prev, newCrew]);
      setCrewState("ok");
      setCrewName(""); setCrewKind("inhouse"); setCrewPhone(""); setCrewEmail(""); setCrewNotes("");
      setTimeout(() => setCrewState("idle"), 2000);
    } else {
      const body = await res.json().catch(() => ({}));
      setCrewErr(body.error ?? "Save failed.");
      setCrewState("error");
    }
  }

  async function toggleCrewActive(crew: Crew) {
    const res = await fetch("/api/schedule/crews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crew.id, active: !crew.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCrews((prev) => prev.map((c) => c.id === crew.id ? updated : c));
    }
  }


  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-8 text-white/40 text-sm font-condensed uppercase tracking-widest">
        Could not load schedule data — try refreshing.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Schedule Admin</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
          Manage crews, PTO, and the install queue.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6 flex-wrap">
        {(["queue", "crews", "pto", "requests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-condensed uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[#f08122] text-[#f08122]"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {t === "queue"    ? `On Deck Queue (${onDeckJobs.length})` :
             t === "crews"    ? `Crews (${crews.filter(c => c.active).length})` :
             t === "pto"      ? `Crew PTO (${pto.length})` :
                                `Removal Requests (${changeRequests.length})`}
          </button>
        ))}
      </div>

      {/* ── On Deck Queue ──────────────────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="space-y-2">
          {onDeckJobs.length === 0 ? (
            <p className="text-white/30 text-sm italic">No jobs waiting to be scheduled.</p>
          ) : onDeckJobs.map((j) => (
            <div key={j.job_id} className="bg-[#1a1a1a] border border-white/10 rounded p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[#f08122] text-xs font-condensed uppercase tracking-widest">{j.job_id}</p>
                <p className="text-white text-sm font-medium">{j.client_name}</p>
                <p className="text-white/40 text-xs">{j.site_address}</p>
                <p className="text-white/50 text-xs mt-1">
                  {j.event_count} event{j.event_count !== 1 ? "s" : ""} · {j.event_types}
                </p>
                {j.note && <p className="text-white/40 text-xs italic mt-1">"{j.note}"</p>}
              </div>
              <Link
                href={`/jobs/${j.job_id}/schedule`}
                className="shrink-0 text-xs font-condensed uppercase tracking-widest text-[#f08122] hover:text-white transition-colors"
              >
                View →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Crews ──────────────────────────────────────────────────────────── */}
      {tab === "crews" && (
        <div className="space-y-6">
          {/* Add crew form */}
          <div className="bg-[#1a1a1a] border border-white/10 rounded p-5">
            <h3 className="font-condensed uppercase tracking-widest text-sm text-white mb-4">Add Crew</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Crew Name *</label>
                <input
                  value={crewName}
                  onChange={(e) => setCrewName(e.target.value)}
                  placeholder='e.g. "Team A", "Martinez Crew"'
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Type</label>
                <select value={crewKind} onChange={(e) => setCrewKind(e.target.value as "inhouse"|"sub")} className={SELECT}>
                  <option value="inhouse">In-House</option>
                  <option value="sub">Subcontractor</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <input value={crewPhone} onChange={(e) => setCrewPhone(e.target.value)} placeholder="Optional" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input value={crewEmail} onChange={(e) => setCrewEmail(e.target.value)} placeholder="Optional" className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Notes</label>
                <input value={crewNotes} onChange={(e) => setCrewNotes(e.target.value)} placeholder="Optional" className={INPUT} />
              </div>
            </div>
            {crewErr && <p className="text-red-400 text-xs font-condensed mt-3">{crewErr}</p>}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={addCrew}
                disabled={crewState === "submitting"}
                className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                {crewState === "submitting" ? "Saving…" : "Add Crew"}
              </button>
              {crewState === "ok" && <span className="text-green-400 text-xs font-condensed uppercase tracking-widest">Saved ✓</span>}
            </div>
          </div>

          {/* Crew list */}
          <div className="space-y-2">
            {crews.length === 0 ? (
              <p className="text-white/30 text-sm italic">No crews yet — add one above.</p>
            ) : (
              <>
                {/* Active */}
                {crews.filter(c => c.active).map((c) => (
                  <div key={c.id} className="bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{c.name}</p>
                        <span className="text-[10px] font-condensed uppercase tracking-wider text-white/40 bg-white/10 rounded px-1.5 py-0.5">
                          {c.kind === "inhouse" ? "In-House" : "Sub"}
                        </span>
                      </div>
                      {(c.contact_phone || c.contact_email) && (
                        <p className="text-white/40 text-xs mt-0.5">
                          {[c.contact_phone, c.contact_email].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {c.notes && <p className="text-white/30 text-xs italic mt-0.5">{c.notes}</p>}
                    </div>
                    <button
                      onClick={() => toggleCrewActive(c)}
                      className="shrink-0 text-xs font-condensed uppercase tracking-widest text-white/30 hover:text-red-400 transition-colors"
                    >
                      Deactivate
                    </button>
                  </div>
                ))}
                {/* Inactive */}
                {crews.filter(c => !c.active).length > 0 && (
                  <>
                    <p className="text-white/20 text-xs font-condensed uppercase tracking-widest pt-2 pb-1">Inactive</p>
                    {crews.filter(c => !c.active).map((c) => (
                      <div key={c.id} className="bg-[#1a1a1a] border border-white/5 rounded px-4 py-3 flex items-center justify-between gap-4 opacity-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white/50 text-sm">{c.name}</p>
                            <span className="text-[10px] font-condensed uppercase tracking-wider text-white/30 bg-white/5 rounded px-1.5 py-0.5">
                              {c.kind === "inhouse" ? "In-House" : "Sub"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleCrewActive(c)}
                          className="shrink-0 text-xs font-condensed uppercase tracking-widest text-white/30 hover:text-green-400 transition-colors"
                        >
                          Reactivate
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Crew PTO ───────────────────────────────────────────────────────── */}
      {tab === "pto" && (
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] border border-white/10 rounded p-5">
            <h3 className="font-condensed uppercase tracking-widest text-sm text-white mb-4">Add Unavailability</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Crew *</label>
                <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={SELECT}>
                  <option value="">— Select Crew —</option>
                  {crews.filter(c => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div />
              <div>
                <label className={LABEL}>Start Date *</label>
                <input type="date" value={ptoStart} onChange={(e) => setPtoStart(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>End Date *</label>
                <input type="date" value={ptoEnd} onChange={(e) => setPtoEnd(e.target.value)} className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Note</label>
                <input value={ptoNote} onChange={(e) => setPtoNote(e.target.value)} placeholder="Optional — vacation, training, etc." className={INPUT} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={addPto}
                disabled={!crewId || !ptoStart || !ptoEnd || ptoState === "submitting"}
                className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                {ptoState === "submitting" ? "Saving…" : "Add Unavailability"}
              </button>
              {ptoState === "ok" && <span className="text-green-400 text-xs font-condensed uppercase tracking-widest">Saved ✓</span>}
              {ptoState === "error" && <span className="text-red-400 text-xs font-condensed uppercase tracking-widest">Error — try again</span>}
            </div>
          </div>

          {pto.length === 0 ? (
            <p className="text-white/30 text-sm italic">No upcoming crew unavailability.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/30 text-xs font-condensed uppercase tracking-widest border-b border-white/10">
                  <th className="text-left pb-2">Crew</th>
                  <th className="text-left pb-2">Dates</th>
                  <th className="text-left pb-2">Note</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {pto.map((p) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 text-white">{p.crew_name}</td>
                    <td className="py-2 text-white/60">{p.date_start} – {p.date_end}</td>
                    <td className="py-2 text-white/40 italic">{p.note || "—"}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => deletePto(p.id)} className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Removal Requests ───────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-3">
          {changeRequests.length === 0 ? (
            <p className="text-white/30 text-sm italic">No pending removal requests.</p>
          ) : changeRequests.map((r) => (
            <div key={r.id} className="bg-[#1a1a1a] border border-white/10 rounded p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[#f08122] text-xs font-condensed uppercase tracking-widest">{r.job_id} — {r.job_client_name}</p>
                <p className="text-white text-sm font-medium capitalize">{r.event_type}</p>
                <p className="text-white/40 text-xs">
                  Scheduled: {r.date_start}{r.date_end ? `–${r.date_end}` : ""}
                </p>
                <p className="text-white/60 text-xs mt-2 italic">"{r.reason}"</p>
                <p className="text-white/25 text-[10px] font-condensed mt-1">
                  Requested by {r.requester_name}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => reviewRequest(r.id, "approve")}
                  className="bg-green-700/30 hover:bg-green-700/50 text-green-300 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => reviewRequest(r.id, "deny")}
                  className="bg-white/5 hover:bg-white/10 text-white/50 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
