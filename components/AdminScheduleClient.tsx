"use client";

import { useState } from "react";
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
  crews: Crew[];
  pto: PtoRow[];
  changeRequests: ChangeRequest[];
  onDeckJobs: OnDeckJob[];
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

export function AdminScheduleClient({ crews, pto: initialPto, changeRequests: initialCR, onDeckJobs }: Props) {
  const [tab, setTab] = useState<"queue" | "pto" | "requests">("queue");

  const [pto, setPto]                           = useState<PtoRow[]>(initialPto);
  const [changeRequests, setChangeRequests]     = useState<ChangeRequest[]>(initialCR);

  // ── PTO form ──────────────────────────────────────────────────────────────
  const [crewId,    setCrewId]    = useState("");
  const [ptoStart,  setPtoStart]  = useState("");
  const [ptoEnd,    setPtoEnd]    = useState("");
  const [ptoNote,   setPtoNote]   = useState("");
  const [ptoState,  setPtoState]  = useState<"idle"|"submitting"|"error">("idle");
  const [ptoError,  setPtoError]  = useState("");

  async function addPto() {
    setPtoError(""); setPtoState("submitting");
    const res = await fetch("/api/schedule/pto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crew_id: crewId, date_start: ptoStart, date_end: ptoEnd, note: ptoNote || undefined }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) { setPtoError(body.error ?? "Failed"); setPtoState("error"); return; }
    // Refetch
    const fresh = await fetch("/api/schedule/pto").then((r) => r.json());
    setPto(fresh.pto ?? []);
    setPtoState("idle");
    setCrewId(""); setPtoStart(""); setPtoEnd(""); setPtoNote("");
  }

  async function removePto(id: string) {
    await fetch("/api/schedule/pto", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPto((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Change requests ───────────────────────────────────────────────────────
  async function reviewRequest(id: string, action: "approve" | "deny") {
    const res = await fetch("/api/schedule/change-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const body = await res.json();
    if (body.ok) setChangeRequests((prev) => prev.filter((r) => r.id !== id));
  }

  const pendingCount = changeRequests.length + onDeckJobs.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="font-heading text-2xl uppercase tracking-wide text-white mb-1">Schedule Admin</h1>
      <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-8">
        On-deck queue · PTO · removal requests
      </p>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        {(["queue", "pto", "requests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-condensed uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[#f08122] text-[#f08122]"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {t === "queue" ? `On Deck Queue (${onDeckJobs.length})` :
             t === "pto"   ? `Crew PTO (${pto.length})` :
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
                <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
                  {j.event_types} · {j.event_count} event{j.event_count !== 1 ? "s" : ""} on deck
                </p>
                {j.note && <p className="text-white/50 text-xs mt-1 italic">{j.note}</p>}
              </div>
              <Link
                href="/schedule"
                className="text-xs font-condensed uppercase tracking-widest text-[#f08122] border border-[#f08122]/30 px-3 py-1.5 rounded hover:bg-[#f08122]/10 transition-colors whitespace-nowrap"
              >
                → Schedule
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── PTO ────────────────────────────────────────────────────────────── */}
      {tab === "pto" && (
        <div className="space-y-6">
          {/* Add form */}
          <div className="bg-[#1a1a1a] border border-white/10 rounded p-5">
            <p className="text-white/50 text-xs font-condensed uppercase tracking-widest mb-4">Add Unavailability</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={LABEL}>Crew *</label>
                <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={SELECT}>
                  <option value="">— Select —</option>
                  {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Start *</label>
                <input type="date" value={ptoStart} onChange={(e) => setPtoStart(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>End *</label>
                <input type="date" value={ptoEnd} onChange={(e) => setPtoEnd(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Note</label>
                <input value={ptoNote} onChange={(e) => setPtoNote(e.target.value)} placeholder="Optional" className={INPUT} />
              </div>
            </div>
            {ptoError && <p className="text-red-400 text-xs mt-2">{ptoError}</p>}
            <button
              onClick={addPto}
              disabled={!crewId || !ptoStart || !ptoEnd || ptoState === "submitting"}
              className="mt-3 bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-40 text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded"
            >
              {ptoState === "submitting" ? "Saving…" : "Add"}
            </button>
          </div>

          {/* Existing PTO */}
          {pto.length === 0 ? (
            <p className="text-white/30 text-sm italic">No upcoming crew unavailability.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/30 text-[10px] font-condensed uppercase tracking-widest border-b border-white/10">
                  <th className="text-left pb-2">Crew</th>
                  <th className="text-left pb-2">Start</th>
                  <th className="text-left pb-2">End</th>
                  <th className="text-left pb-2">Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pto.map((p) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 text-white">{p.crew_name}</td>
                    <td className="py-2 text-white/70">{p.date_start}</td>
                    <td className="py-2 text-white/70">{p.date_end}</td>
                    <td className="py-2 text-white/40 text-xs">{p.note ?? "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => removePto(p.id)}
                        className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Removal Requests ────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-3">
          {changeRequests.length === 0 ? (
            <p className="text-white/30 text-sm italic">No pending removal requests.</p>
          ) : changeRequests.map((r) => (
            <div key={r.id} className="bg-[#1a1a1a] border border-yellow-900/30 rounded p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-yellow-300/80 text-xs font-condensed uppercase tracking-widest mb-1">
                    Removal Request — {r.event_type}
                  </p>
                  <p className="text-white text-sm font-medium">{r.job_client_name}</p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
