"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHECKLIST_SECTIONS,
  allKeys,
} from "@/lib/engineering-release-checklist";

interface DrawingFile {
  id: string;
  filename: string;
  size: number;
  uploaded_at: string;
  uploaded_by: string | null;
  url: string;
}

interface ReleaseRecord {
  id: string;
  released_at: string;
  released_by: string;
  notes: string | null;
  drawing_file_ids: string[];
  email_to: string;
  email_cc: string | null;
}

export function EngineeringReleasePanel({ jobId }: { jobId: string }) {
  const [checklist, setChecklist]       = useState<Record<string, boolean>>({});
  const [autoChecked, setAutoChecked]   = useState<Record<string, boolean>>({});
  const [drawings, setDrawings]         = useState<DrawingFile[]>([]);
  const [lastRelease, setLastRelease]   = useState<ReleaseRecord | null>(null);
  const [notes, setNotes]               = useState("");
  const [uploading, setUploading]       = useState(false);
  const [sending, setSending]           = useState(false);
  const [sendError, setSendError]       = useState<string | null>(null);
  const [sendSuccess, setSendSuccess]   = useState(false);
  const [open, setOpen]                 = useState(false);
  const [saving, setSaving]             = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef   = useRef<HTMLInputElement | null>(null);

  // ── Effective check: auto OR manual ─────────────────────────────────────
  function isEffectivelyChecked(key: string): boolean {
    return !!(autoChecked[key] || checklist[key]);
  }
  function isAuto(key: string): boolean {
    return !!autoChecked[key];
  }

  // ── Load state on mount ─────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [clRes, filesRes, relRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/engineering-checklist`),
        fetch(`/api/jobs/${jobId}/files`),
        fetch(`/api/jobs/${jobId}/engineering-release`),
      ]);

      if (clRes.ok) {
        const d = await clRes.json() as {
          checklist: Record<string, boolean>;
          autoChecked: Record<string, boolean>;
        };
        setChecklist(d.checklist ?? {});
        setAutoChecked(d.autoChecked ?? {});
      }

      let loadedDrawings: DrawingFile[] = [];
      if (filesRes.ok) {
        const d = await filesRes.json() as { files: Record<string, DrawingFile[]> };
        loadedDrawings = d.files?.["16_eng_drawings"] ?? [];
        setDrawings(loadedDrawings);
        // Auto-check drawings_attached if drawings already exist
        if (loadedDrawings.length > 0) {
          setAutoChecked((prev) => ({ ...prev, drawings_attached: true }));
        }
      }

      if (relRes.ok) {
        const d = await relRes.json() as { release: ReleaseRecord | null };
        setLastRelease(d.release ?? null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Auto-save checklist (debounced) ─────────────────────────────────────
  const persistChecklist = useCallback((state: Record<string, boolean>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/jobs/${jobId}/engineering-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: state }),
      });
      setSaving(false);
    }, 600);
  }, [jobId]);

  const flushSave = useCallback(async (state: Record<string, boolean>) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaving(true);
    await fetch(`/api/jobs/${jobId}/engineering-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: state }),
    });
    setSaving(false);
  }, [jobId]);

  function toggle(key: string) {
    // Don't allow un-checking an auto-checked item manually
    if (autoChecked[key]) return;
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    persistChecklist(next);
  }

  function checkAllInSection(sectionId: string) {
    const section = CHECKLIST_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const next = { ...checklist };
    for (const item of section.items) {
      if (!autoChecked[item.key]) {
        next[item.key] = true;
      }
    }
    setChecklist(next);
    persistChecklist(next);
  }

  function uncheckAllInSection(sectionId: string) {
    const section = CHECKLIST_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const next = { ...checklist };
    for (const item of section.items) {
      if (!autoChecked[item.key]) {
        next[item.key] = false;
      }
    }
    setChecklist(next);
    persistChecklist(next);
  }

  // ── File upload ─────────────────────────────────────────────────────────
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "16_eng_drawings");
      await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: form });
    }
    const res = await fetch(`/api/jobs/${jobId}/files`);
    if (res.ok) {
      const d = await res.json() as { files: Record<string, DrawingFile[]> };
      const updated = d.files?.["16_eng_drawings"] ?? [];
      setDrawings(updated);
      if (updated.length > 0) {
        setAutoChecked((prev) => ({ ...prev, drawings_attached: true }));
      }
    }
    setUploading(false);
  }

  // ── Send release ────────────────────────────────────────────────────────
  async function sendRelease() {
    setSendError(null);
    setSending(true);
    await flushSave(checklist);
    const res = await fetch(`/api/jobs/${jobId}/engineering-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json() as {
      ok?: boolean; error?: string; releasedAt?: string; released_by?: string;
      previewMode?: boolean; drawingsSent?: number;
    };
    setSending(false);
    if (!res.ok || !data.ok) {
      setSendError(data.error ?? "Unknown error");
      return;
    }
    setSendSuccess(true);
    const relRes = await fetch(`/api/jobs/${jobId}/engineering-release`);
    if (relRes.ok) {
      const d = await relRes.json() as { release: ReleaseRecord | null };
      setLastRelease(d.release ?? null);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const keys = allKeys();
  const checkedCount = keys.filter((k) => isEffectivelyChecked(k)).length;
  const total        = keys.length;
  const allDone      = checkedCount === total;
  const hasDrawings  = drawings.length > 0;
  const canSend      = allDone && hasDrawings && !sending;
  const pct          = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  const autoCount    = keys.filter((k) => isAuto(k)).length;

  const seen = new Set<string>();
  const canonDrawings = drawings.filter((d) => {
    const base = d.filename.replace(/^\d+-/, "");
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });

  function fmtSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      {/* Section header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between group mb-0"
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-condensed uppercase tracking-widest text-white/30 group-hover:text-white/50 transition-colors">
            Release to Engineering
          </span>
          {lastRelease && (
            <span className="text-[10px] font-condensed uppercase tracking-widest text-green-400/80 bg-green-900/20 border border-green-700/30 px-2 py-0.5 rounded">
              ✓ Released {fmtDate(lastRelease.released_at)}
            </span>
          )}
          {!lastRelease && (
            <span className={
              "text-[10px] font-condensed uppercase tracking-widest px-2 py-0.5 rounded " +
              (allDone && hasDrawings
                ? "text-[#f08122] bg-[#f08122]/10 border border-[#f08122]/30"
                : "text-white/20 bg-white/5 border border-white/10")
            }>
              {checkedCount}/{total}
            </span>
          )}
        </div>
        <span className="text-white/20 group-hover:text-white/40 transition-colors text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {!open && (
        <div className="mt-2">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: allDone ? "#4ade80" : "#f08122",
              }}
            />
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-6">

          {/* Already released banner */}
          {lastRelease && (
            <div className="bg-green-900/15 border border-green-700/30 rounded-lg p-4">
              <p className="text-green-400 text-xs font-condensed uppercase tracking-widest mb-1">
                Released to Engineering
              </p>
              <p className="text-white/60 text-sm">
                {fmtDate(lastRelease.released_at)} · by {lastRelease.released_by}
              </p>
              {lastRelease.notes && (
                <p className="text-white/40 text-xs mt-2 whitespace-pre-wrap">{lastRelease.notes}</p>
              )}
              <p className="text-white/30 text-xs mt-2">
                To: {lastRelease.email_to}
                {lastRelease.email_cc ? ` · CC: ${lastRelease.email_cc}` : ""}
              </p>
              <p className="text-yellow-400/60 text-xs mt-3 font-condensed uppercase tracking-wider">
                Re-releasing will send another email. Only do this if drawings were revised.
              </p>
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-condensed uppercase tracking-widest text-white/30">
                Checklist — {checkedCount} / {total} complete
                {autoCount > 0 && (
                  <span className="ml-2 text-sky-400/60">· {autoCount} auto from spec</span>
                )}
                {saving && <span className="ml-2 text-white/20">saving…</span>}
              </span>
              {allDone && (
                <span className="text-[10px] font-condensed uppercase tracking-widest text-green-400/80">All clear ✓</span>
              )}
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: allDone ? "#4ade80" : "#f08122" }}
              />
            </div>
          </div>

          {/* Checklist sections */}
          <div className="space-y-5">
            {CHECKLIST_SECTIONS.map((section) => {
              const sectionKeys = section.items.map((i) => i.key);
              const sectionChecked = sectionKeys.filter((k) => isEffectivelyChecked(k)).length;
              const sectionTotal   = sectionKeys.length;
              const sectionAllDone = sectionChecked === sectionTotal;
              const hasManual = section.items.some((i) => !autoChecked[i.key]);

              return (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-condensed uppercase tracking-widest text-white/20">
                      {section.label}
                      <span className="ml-2 text-white/15">
                        {sectionChecked}/{sectionTotal}
                      </span>
                    </p>
                    {hasManual && !sectionAllDone && (
                      <button
                        onClick={() => checkAllInSection(section.id)}
                        className="text-[10px] font-condensed uppercase tracking-widest text-white/20 hover:text-[#f08122] transition-colors px-2 py-0.5 rounded border border-white/10 hover:border-[#f08122]/30"
                      >
                        Check All
                      </button>
                    )}
                    {hasManual && sectionAllDone && (
                      <button
                        onClick={() => uncheckAllInSection(section.id)}
                        className="text-[10px] font-condensed uppercase tracking-widest text-white/15 hover:text-white/40 transition-colors px-2 py-0.5 rounded border border-white/5 hover:border-white/20"
                      >
                        Uncheck
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const effective = isEffectivelyChecked(item.key);
                      const auto      = isAuto(item.key);
                      return (
                        <label
                          key={item.key}
                          className={
                            "flex items-start gap-3 py-1 px-2 rounded transition-colors " +
                            (auto ? "cursor-default" : "cursor-pointer group hover:bg-white/5")
                          }
                        >
                          <div className="mt-0.5 shrink-0">
                            <div
                              className={
                                "w-4 h-4 rounded border flex items-center justify-center transition-colors " +
                                (effective && auto
                                  ? "bg-sky-500/70 border-sky-500/70"
                                  : effective
                                  ? "bg-[#f08122] border-[#f08122]"
                                  : "border-white/20 group-hover:border-white/40")
                              }
                              onClick={() => !auto && toggle(item.key)}
                            >
                              {effective && auto && (
                                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 12" fill="currentColor">
                                  <path d="M6 1L1 7h4l-1 4 5-6H5l1-4z" />
                                </svg>
                              )}
                              {effective && !auto && (
                                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  "text-sm leading-snug " +
                                  (effective && !auto ? "text-white/40 line-through" : effective && auto ? "text-white/50" : "text-white/80")
                                }
                                onClick={() => !auto && toggle(item.key)}
                              >
                                {item.label}
                              </span>
                              {auto && (
                                <span className="text-[9px] font-condensed uppercase tracking-widest text-sky-400/60 bg-sky-900/20 border border-sky-700/20 px-1.5 py-0.5 rounded shrink-0">
                                  auto
                                </span>
                              )}
                            </div>
                            {item.note && (
                              <p className="text-[11px] text-white/25 mt-0.5 italic">{item.note}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Drawings upload */}
          <div>
            <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-3">
              Approved Drawings — <span className="text-white/20 normal-case not-italic font-normal tracking-normal text-[11px]">newest version of each file is what gets sent</span>
            </p>

            {canonDrawings.length > 0 && (
              <div className="space-y-1 mb-3">
                {canonDrawings.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-xs">
                    <span className="text-white/60 truncate">{f.filename.replace(/^\d+-/, "")}</span>
                    <span className="text-white/25 ml-4 shrink-0">{fmtSize(f.size)} · {new Date(f.uploaded_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.dwg,.dxf,.png,.jpg"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-[11px] font-condensed uppercase tracking-widest text-white/40 hover:text-[#f08122] border border-white/15 hover:border-[#f08122]/40 px-4 py-2 rounded transition-colors disabled:opacity-40"
            >
              {uploading ? "Uploading…" : canonDrawings.length > 0 ? "+ Add / Replace Drawings" : "Upload Approved Drawings"}
            </button>
            {!hasDrawings && (
              <p className="text-[11px] text-red-400/60 mt-2">At least one drawing is required before releasing.</p>
            )}
          </div>

          {/* Notes / release message */}
          <div>
            <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-2">
              Release Message
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"Who is installing? Delivery date? Special materials or flags?\ne.g. WE ARE INSTALLING THIS. DELIVERY SET FOR APRIL 13TH."}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30 resize-none"
            />
          </div>

          {/* Send button */}
          <div>
            {sendError && (
              <div className="mb-3 bg-red-900/20 border border-red-700/30 rounded px-4 py-3 text-sm text-red-300">
                {sendError}
              </div>
            )}
            {sendSuccess && (
              <div className="mb-3 bg-green-900/20 border border-green-700/30 rounded px-4 py-3 text-sm text-green-300">
                ✓ Released — email sent to Engineering &amp; Residential.
              </div>
            )}

            <div className="flex items-center gap-4">
              <button
                onClick={sendRelease}
                disabled={!canSend}
                className={
                  "px-5 py-2.5 rounded font-condensed uppercase tracking-widest text-xs transition-all " +
                  (canSend
                    ? "bg-[#f08122] text-white hover:bg-[#d97010] cursor-pointer"
                    : "bg-white/5 text-white/20 cursor-not-allowed border border-white/10")
                }
              >
                {sending ? "Sending…" : "Release to Engineering"}
              </button>

              {!canSend && (
                <p className="text-[11px] text-white/25">
                  {!allDone && !hasDrawings
                    ? `Complete all ${total - checkedCount} remaining items and upload drawings`
                    : !allDone
                    ? `${total - checkedCount} checklist item${total - checkedCount !== 1 ? "s" : ""} remaining`
                    : "Upload approved drawings to release"}
                </p>
              )}
            </div>

            <p className="text-[10px] text-white/20 mt-3">
              Sends to: joshl@advancedcabinets.net · CC: residential@advancedcabinets.net
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
