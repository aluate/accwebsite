"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
type FinishGroup = {
  id: string;
  label: string | null;
  finish_type: string | null;
  box_count: number | null;
  wo_count: number | null;       // manual WO override
  fg_complexity: number | null;  // per-FG override; null = inherit from job
};

type ConstraintJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  city: string | null;
  pm: string | null;
  status: string;
  delivery_date: string | null;
  estimated_value: number | null;
  pm_complexity: number | null;
  job_box_count: number | null;
  job_wo_count: number | null;
  install_start_date: string | null;
  install_duration_days: number | null;
  finish_groups: FinishGroup[];
};

type Pm = { id: string; name: string };

// ─── ENG Hours formula ────────────────────────────────────────────────────────
export type EngConfig = {
  break1: number;      // 1st value-tier break ($)
  break2: number;      // 2nd value-tier break ($)
  rate1: number;       // hrs/$ for tier 1  (e.g. 0.001 = 1 hr / $1000)
  rate2: number;       // hrs/$ for tier 2  (e.g. 0.00025)
  rate3: number;       // hrs/$ for tier 3  (e.g. 0.0001)
  mult0: number;       // complexity-0 value multiplier
  mult1: number;       // complexity-1 multiplier (anchor = 1.0)
  mult2: number;       // complexity-2 multiplier
  fixedFloor: number;  // fixed hrs per WO (output-to-floor overhead)
};

const DEFAULT_ENG_CONFIG: EngConfig = {
  break1: 25000, break2: 45000,
  rate1: 0.001, rate2: 0.00025, rate3: 0.0001,
  mult0: 0.5, mult1: 1.0, mult2: 1.75,
  fixedFloor: 2,
};

function loadEngConfig(): EngConfig {
  try {
    const s = localStorage.getItem("acc_eng_config");
    if (s) return { ...DEFAULT_ENG_CONFIG, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_ENG_CONFIG };
}
function saveEngConfig(cfg: EngConfig) {
  try { localStorage.setItem("acc_eng_config", JSON.stringify(cfg)); } catch {}
}

/** Hours for ONE WO given its adjusted base value (runs through the bracket table) */
function calcWOEngHours(baseValue: number, complexity: number | null, cfg: EngConfig): number {
  const c = complexity ?? 1;
  const mult = c === 0 ? cfg.mult0 : c === 2 ? cfg.mult2 : cfg.mult1;
  const adj = baseValue * mult;
  let h = 0;
  if (adj <= cfg.break1) {
    h = adj * cfg.rate1;
  } else if (adj <= cfg.break2) {
    h = cfg.break1 * cfg.rate1 + (adj - cfg.break1) * cfg.rate2;
  } else {
    h = cfg.break1 * cfg.rate1 + (cfg.break2 - cfg.break1) * cfg.rate2 + (adj - cfg.break2) * cfg.rate3;
  }
  return h + cfg.fixedFloor;
}

/** Effective WO count for a finish group (manual override > derived) */
function fgWOs(fg: FinishGroup): number {
  if (fg.wo_count != null && fg.wo_count > 0) return fg.wo_count;
  if (!fg.box_count || fg.box_count <= 0) return 1;
  return Math.max(1, Math.ceil(fg.box_count / 65));
}

/** Total ENG hours for a job. Returns null if est_value is missing. */
function calcJobEngHours(job: ConstraintJob, cfg: EngConfig): number | null {
  if (!job.estimated_value) return null;
  const hasFgs = job.finish_groups.length > 0;
  if (hasFgs) {
    const totalWOs = job.finish_groups.reduce((s, fg) => s + fgWOs(fg), 0);
    if (totalWOs === 0) return null;
    const base = job.estimated_value / totalWOs;
    const total = job.finish_groups.reduce((sum, fg) => {
      const wos = fgWOs(fg);
      const hpw = calcWOEngHours(base, fg.fg_complexity ?? job.pm_complexity, cfg);
      return sum + hpw * wos;
    }, 0);
    return Math.round(total * 10) / 10;
  } else {
    const totalWOs = job.job_box_count ? Math.ceil(job.job_box_count / 65) : 1;
    const base = job.estimated_value / totalWOs;
    const hrs = calcWOEngHours(base, job.pm_complexity, cfg) * totalWOs;
    return Math.round(hrs * 10) / 10;
  }
}

// ─── Status config ────────────────────────────────────────────────────────────
const ALL_STATUSES = [
  "intake","bid","design","field_dims","engineering","procurement",
  "production","delivery","install","punch","on_hold","complete","cancelled",
];
const STATUS_LABEL: Record<string,string> = {
  intake:"Intake", bid:"Bid", design:"Design", field_dims:"Field Dims",
  engineering:"Engineering", procurement:"Procurement", production:"Production",
  delivery:"Delivery", install:"Install", punch:"Punch",
  on_hold:"On Hold", complete:"Complete", cancelled:"Cancelled",
};
const STATUS_COLOR: Record<string,string> = {
  intake:"bg-white/10 text-white/50", bid:"bg-cyan-500/20 text-cyan-300",
  design:"bg-blue-500/20 text-blue-300", field_dims:"bg-sky-500/20 text-sky-300",
  engineering:"bg-violet-500/20 text-violet-300", procurement:"bg-indigo-500/20 text-indigo-300",
  production:"bg-amber-500/20 text-amber-300", delivery:"bg-orange-500/20 text-orange-300",
  install:"bg-orange-600/20 text-orange-400", punch:"bg-rose-500/20 text-rose-300",
  on_hold:"bg-white/5 text-white/30", complete:"bg-green-500/20 text-green-300",
  cancelled:"bg-red-500/20 text-red-300",
};
const ACTIVE_STATUSES = [
  "intake","bid","design","field_dims","engineering","procurement",
  "production","delivery","install","punch",
];
const COMPLEXITY_LABEL: Record<number,string> = { 0:"0 Std", 1:"1 Mod", 2:"2 Cmplx" };

function calcFgWO(boxes: number | null): number {
  if (!boxes || boxes <= 0) return 1;
  return Math.max(1, Math.ceil(boxes / 65));
}

// ─── Formula config panel ─────────────────────────────────────────────────────
function FormulaConfigPanel({ cfg, onChange }: { cfg: EngConfig; onChange: (c: EngConfig) => void }) {
  const [open, setOpen] = useState(false);

  function set(key: keyof EngConfig, raw: string) {
    const n = parseFloat(raw);
    if (isNaN(n)) return;
    const next = { ...cfg, [key]: n };
    onChange(next);
    saveEngConfig(next);
  }

  const Knob = ({ k, label, step = 0.0001 }: { k: keyof EngConfig; label: string; step?: number }) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[8px] text-white/30 uppercase tracking-widest font-condensed">{label}</span>
      <input type="number" step={step} value={cfg[k]}
        onChange={e => set(k, e.target.value)}
        className="w-20 bg-[#1a1a1a] border border-white/15 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-[#f08122]/60 tabular-nums" />
    </label>
  );

  return (
    <div className="mb-4 bg-[#111213] border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-condensed uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors">
        <span>⚙ ENG Hours Formula — levers</span>
        <span className="text-[8px]">{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-white/5 space-y-4 pt-3">
          <p className="text-white/25 text-[10px] font-condensed leading-relaxed">
            <span className="text-white/50">Formula per WO:</span> base = est_value ÷ total_WOs → × complexity_mult → bracket table (hrs/$) → + fixed floor = eng hrs
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[9px] text-[#f08122] uppercase tracking-widest font-condensed mb-1.5">Value Breaks <span className="text-white/20 normal-case">(uncertain)</span></p>
              <div className="flex gap-3">
                <Knob k="break1" label="Break 1 ($)" step={1000} />
                <Knob k="break2" label="Break 2 ($)" step={1000} />
              </div>
            </div>
            <div>
              <p className="text-[9px] text-[#f08122] uppercase tracking-widest font-condensed mb-1.5">Rates <span className="text-white/40 normal-case">(confident)</span></p>
              <div className="flex gap-3">
                <Knob k="rate1" label="Tier 1 (1/1000)" />
                <Knob k="rate2" label="Tier 2 (1/4000)" />
                <Knob k="rate3" label="Tier 3 (1/10000)" />
              </div>
            </div>
            <div>
              <p className="text-[9px] text-[#f08122] uppercase tracking-widest font-condensed mb-1.5">Complexity Multipliers <span className="text-white/20 normal-case">(uncertain)</span></p>
              <div className="flex gap-3">
                <Knob k="mult0" label="0 – Std" />
                <Knob k="mult1" label="1 – Mod (anchor)" />
                <Knob k="mult2" label="2 – Complex" />
              </div>
            </div>
            <div>
              <p className="text-[9px] text-[#f08122] uppercase tracking-widest font-condensed mb-1.5">Fixed Floor <span className="text-white/40 normal-case">(confident)</span></p>
              <Knob k="fixedFloor" label="hrs/WO" step={0.5} />
            </div>
          </div>
          <button onClick={() => { onChange({ ...DEFAULT_ENG_CONFIG }); saveEngConfig(DEFAULT_ENG_CONFIG); }}
            className="text-[9px] text-white/20 hover:text-white/50 font-condensed uppercase tracking-widest transition-colors">
            ↺ Reset all to defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Inline edit primitives ───────────────────────────────────────────────────
function EditableStatus({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <select value={value}
      onChange={async e => { setSaving(true); await onSave(e.target.value); setSaving(false); }}
      disabled={saving}
      className={`text-[10px] font-condensed uppercase tracking-widest rounded-full px-2 py-0.5 border-0 focus:outline-none cursor-pointer ${STATUS_COLOR[value] ?? "bg-white/10 text-white/40"} ${saving ? "opacity-50" : ""}`}
      style={{ background: "transparent" }}>
      {ALL_STATUSES.map(s => (
        <option key={s} value={s} className="bg-[#2d2d2d] text-white normal-case">{STATUS_LABEL[s] ?? s}</option>
      ))}
    </select>
  );
}

function EditableComplexity({ value, inherited, onSave }: {
  value: number | null; inherited: number | null;
  onSave: (v: number | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const isInherited = value === null || value === undefined;
  return (
    <select
      value={value === null || value === undefined ? "" : String(value)}
      onChange={async e => {
        setSaving(true);
        const v = e.target.value === "" ? null : Number(e.target.value);
        await onSave(v);
        setSaving(false);
      }}
      disabled={saving}
      className={`text-xs rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer transition-colors bg-transparent ${isInherited ? "text-white/30 hover:text-white/60" : "text-white hover:bg-white/5"} ${saving ? "opacity-50" : ""}`}>
      <option value="" className="bg-[#2d2d2d] text-white/40">↑ {COMPLEXITY_LABEL[inherited ?? 1] ?? "inherit"}</option>
      <option value="0" className="bg-[#2d2d2d] text-white">0 — Std</option>
      <option value="1" className="bg-[#2d2d2d] text-white">1 — Mod</option>
      <option value="2" className="bg-[#2d2d2d] text-white">2 — Complex</option>
    </select>
  );
}

function EditableSelect({ value, options, placeholder, onSave }: {
  value: string | null; options: Pm[]; placeholder?: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <select value={value ?? ""}
      onChange={async e => { setSaving(true); await onSave(e.target.value || null); setSaving(false); }}
      disabled={saving}
      className={`text-xs text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer w-full transition-colors ${saving ? "opacity-50" : ""}`}>
      <option value="" className="bg-[#2d2d2d] text-white/40">{placeholder ?? "—"}</option>
      {options.map(o => <option key={o.id} value={o.name} className="bg-[#2d2d2d] text-white">{o.name}</option>)}
    </select>
  );
}

function EditableDate({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit(v: string) {
    setSaving(true); await onSave(v || null); setSaving(false); setEditing(false);
  }
  if (editing) {
    return <input autoFocus type="date" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={e => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setEditing(false); }}
      disabled={saving}
      className="bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none" />;
  }
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="text-left text-xs text-white/60 hover:text-[#f08122] group whitespace-nowrap flex items-center gap-1">
      <span>{value ?? <span className="text-white/25">Set date</span>}</span>
      <span className="text-white/20 group-hover:text-[#f08122] text-[10px]">&#9999;</span>
    </button>
  );
}

function EditableDollar({ value, onSave }: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const raw = draft.replace(/[$,\s]/g, "");
    const n = raw === "" ? null : parseFloat(raw);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false); setEditing(false);
  }
  if (editing) {
    return <input autoFocus type="number" step="1000" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      disabled={saving} placeholder="e.g. 85000"
      className="w-24 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none" />;
  }
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className="text-xs text-right text-white/60 hover:text-[#f08122] group tabular-nums flex items-center justify-end gap-1 w-full">
      <span>{value != null ? "$" + Math.round(value).toLocaleString() : <span className="text-white/25">Add $</span>}</span>
      <span className="text-white/20 group-hover:text-[#f08122] text-[10px]">&#9999;</span>
    </button>
  );
}

function EditableNumber({ value, unit, min, onSave }: {
  value: number | null; unit: string; min?: number;
  onSave: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseInt(draft, 10);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false); setEditing(false);
  }
  if (editing) {
    return <input autoFocus type="number" min={min ?? 0} step="1" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      disabled={saving}
      className="w-16 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-center focus:outline-none" />;
  }
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className="text-xs text-white/60 hover:text-[#f08122] group tabular-nums flex items-center gap-0.5">
      <span>{value != null ? `${value} ${unit}` : <span className="text-white/25">—</span>}</span>
      <span className="text-white/20 group-hover:text-[#f08122] text-[10px]">&#9999;</span>
    </button>
  );
}

function EditableBoxes({ boxes, onSaveBoxes }: {
  boxes: number | null;
  onSaveBoxes: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(boxes != null ? String(boxes) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseInt(draft, 10);
    await onSaveBoxes(isNaN(n as number) ? null : n);
    setSaving(false); setEditing(false);
  }
  const wos = boxes && boxes > 0 ? Math.ceil(boxes / 65) : null;

  return (
    <div className="flex items-center gap-2 justify-end">
      {editing ? (
        <input autoFocus type="number" min="0" step="1" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          disabled={saving}
          className="w-14 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-center focus:outline-none" />
      ) : (
        <button onClick={() => { setDraft(boxes != null ? String(boxes) : ""); setEditing(true); }}
          className="text-xs text-white/60 hover:text-[#f08122] tabular-nums flex items-center gap-0.5">
          <span>{boxes ?? <span className="text-white/25">boxes</span>}</span>
          <span className="text-white/20 group-hover:text-[#f08122] text-[10px]">&#9999;</span>
        </button>
      )}
      <span className="text-[10px] text-white/20">→</span>
      <span className={`text-xs tabular-nums ${wos ? "text-white/60" : "text-white/20"}`}>
        {wos ?? "—"} WO
      </span>
    </div>
  );
}

// ─── FG row ───────────────────────────────────────────────────────────────────
function FgRow({ fg, jobComplexity, baseValue, engConfig, onSaveFg }: {
  fg: FinishGroup;
  jobComplexity: number | null;
  baseValue: number | null;
  engConfig: EngConfig;
  onSaveFg: (fgId: string, updates: Partial<FinishGroup & { pm_complexity: number | null }>) => Promise<void>;
}) {
  const woCount = fgWOs(fg);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fg.box_count != null ? String(fg.box_count) : "");
  const [saving, setSaving] = useState(false);

  async function commitBoxes() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseInt(draft, 10);
    await onSaveFg(fg.id, { box_count: isNaN(n as number) ? null : n });
    setSaving(false); setEditing(false);
  }

  const complexity = fg.fg_complexity ?? jobComplexity;
  const fgEngHrs = baseValue != null
    ? Math.round(calcWOEngHours(baseValue, complexity, engConfig) * woCount * 10) / 10
    : null;

  const finishTag = fg.finish_type?.toUpperCase() ?? "FG";
  const displayLabel = fg.label ?? finishTag;

  return (
    <tr className="border-b border-white/[0.03] bg-[#111213]/60">
      <td className="pl-12 pr-2 py-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
          <span className="text-[11px] text-white/50">{displayLabel}</span>
          <span className="text-[9px] text-white/20 uppercase">{finishTag}</span>
        </span>
      </td>
      <td className="px-2 py-2" />
      <td className="px-2 py-2" />
      <td className="px-2 py-2">
        <EditableComplexity
          value={fg.fg_complexity}
          inherited={jobComplexity}
          onSave={v => onSaveFg(fg.id, { pm_complexity: v })}
        />
      </td>
      <td className="px-2 py-2" />
      <td className="px-2 py-2" />
      <td className="px-2 py-2" />
      <td className="px-2 py-2" />
      {/* Boxes → WO */}
      <td className="px-2 py-2 text-right">
        <div className="flex items-center gap-2 justify-end">
          {editing ? (
            <input autoFocus type="number" min="0" step="1" value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitBoxes}
              onKeyDown={e => { if (e.key === "Enter") commitBoxes(); if (e.key === "Escape") setEditing(false); }}
              disabled={saving}
              className="w-14 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-center focus:outline-none" />
          ) : (
            <button onClick={() => { setDraft(fg.box_count != null ? String(fg.box_count) : ""); setEditing(true); }}
              className="text-xs text-white/50 hover:text-[#f08122] tabular-nums flex items-center gap-0.5">
              <span>{fg.box_count ?? <span className="text-white/25">boxes</span>}</span>
              <span className="text-white/20 text-[10px]">&#9999;</span>
            </button>
          )}
          <span className="text-[10px] text-white/20">→</span>
          <span className="text-xs tabular-nums text-white/60 font-medium">{woCount} WO</span>
        </div>
      </td>
      {/* ENG Hrs — per FG contribution */}
      <td className="px-2 py-2 text-right">
        {fgEngHrs != null ? (
          <span className="text-xs tabular-nums text-violet-300/70">{fgEngHrs} hr</span>
        ) : (
          <span className="text-white/15 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Job row ──────────────────────────────────────────────────────────────────
function JobRow({ job, pms, engConfig, onSaveJob, onSaveFg }: {
  job: ConstraintJob; pms: Pm[]; engConfig: EngConfig;
  onSaveJob: (id: string, updates: Partial<ConstraintJob>) => Promise<void>;
  onSaveFg: (fgId: string, updates: Partial<FinishGroup & { pm_complexity: number | null }>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFgs = job.finish_groups.length > 0;

  const totalWOs = hasFgs
    ? job.finish_groups.reduce((s, fg) => s + fgWOs(fg), 0)
    : null;
  const totalBoxes = hasFgs
    ? job.finish_groups.reduce((s, fg) => s + (fg.box_count ?? 0), 0)
    : null;

  // Base value per WO (for passing to FgRow)
  const baseValue = (job.estimated_value && totalWOs)
    ? job.estimated_value / totalWOs
    : null;

  const engHrs = calcJobEngHours(job, engConfig);

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.025] transition-colors">
        {/* Job name */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {hasFgs ? (
              <button onClick={() => setExpanded(e => !e)}
                className="text-white/20 hover:text-white/60 transition-colors text-[10px] w-4 flex-shrink-0">
                {expanded ? "▾" : "▸"}
              </button>
            ) : <span className="w-4 flex-shrink-0" />}
            <div>
              <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-white hover:text-[#f08122] transition-colors">
                {job.client_name}
              </Link>
              <div className="text-[10px] text-white/30">{job.job_number}{job.city ? ` · ${job.city}` : ""}</div>
            </div>
          </div>
        </td>
        <td className="px-2 py-2.5">
          <EditableStatus value={job.status} onSave={v => onSaveJob(job.id, { status: v })} />
        </td>
        <td className="px-2 py-2.5">
          <EditableDollar value={job.estimated_value} onSave={v => onSaveJob(job.id, { estimated_value: v })} />
        </td>
        <td className="px-2 py-2.5">
          <div className="flex flex-col gap-0.5">
            <EditableComplexity
              value={job.pm_complexity}
              inherited={null}
              onSave={v => onSaveJob(job.id, { pm_complexity: v ?? 1 })}
            />
            {hasFgs && <span className="text-[9px] text-white/20 pl-1">default for FGs</span>}
          </div>
        </td>
        <td className="px-2 py-2.5 min-w-[110px]">
          <EditableSelect value={job.pm} options={pms} placeholder="Assign PM"
            onSave={v => onSaveJob(job.id, { pm: v ?? null })} />
        </td>
        <td className="px-2 py-2.5">
          <EditableDate value={job.delivery_date} onSave={v => onSaveJob(job.id, { delivery_date: v })} />
        </td>
        <td className="px-2 py-2.5">
          <EditableDate value={job.install_start_date} onSave={v => onSaveJob(job.id, { install_start_date: v })} />
        </td>
        <td className="px-2 py-2.5">
          <EditableNumber value={job.install_duration_days} unit="days" min={1}
            onSave={v => onSaveJob(job.id, { install_duration_days: v })} />
        </td>
        {/* Boxes → WO */}
        <td className="px-2 py-2.5 text-right">
          {hasFgs ? (
            <button onClick={() => setExpanded(e => !e)}
              className="text-xs text-white/50 hover:text-white transition-colors tabular-nums flex items-center gap-2 ml-auto">
              <span className="text-white/30">{job.finish_groups.length} FG{job.finish_groups.length !== 1 ? "s" : ""}</span>
              <span className="text-white/20">·</span>
              <span>{totalBoxes ? `${totalBoxes} boxes` : <span className="text-white/20">no boxes</span>}</span>
              <span className="text-white/20">→</span>
              <span className="font-medium text-white/70">{totalWOs} WO{totalWOs !== 1 ? "s" : ""}</span>
            </button>
          ) : (
            <EditableBoxes
              boxes={job.job_box_count}
              onSaveBoxes={v => onSaveJob(job.id, { job_box_count: v } as Partial<ConstraintJob>)}
            />
          )}
        </td>
        {/* ENG Hrs */}
        <td className="px-3 py-2.5 text-right">
          {engHrs != null ? (
            <span className="text-sm tabular-nums font-medium text-violet-300">{engHrs} hr</span>
          ) : (
            <span className="text-white/15 text-xs">no value</span>
          )}
        </td>
      </tr>

      {expanded && job.finish_groups.map(fg => (
        <FgRow
          key={fg.id}
          fg={fg}
          jobComplexity={job.pm_complexity}
          baseValue={baseValue}
          engConfig={engConfig}
          onSaveFg={onSaveFg}
        />
      ))}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ConstraintsClient() {
  const [jobs, setJobs]   = useState<ConstraintJob[]>([]);
  const [pms, setPms]     = useState<Pm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [engConfig, setEngConfig] = useState<EngConfig>(DEFAULT_ENG_CONFIG);

  // Load EngConfig from localStorage on mount (client only)
  useEffect(() => { setEngConfig(loadEngConfig()); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/constraints"),
        fetch("/api/admin/pipeline"),
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      setJobs(cData.jobs ?? []);
      setPms(pData.pms ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onSaveJob(jobId: string, updates: Partial<ConstraintJob>) {
    const payload: Record<string, unknown> = { ...updates, _actor: "admin", _actorRole: "admin" };
    if ("job_box_count" in payload) { payload.box_count = payload.job_box_count; delete payload.job_box_count; }
    if ("job_wo_count" in payload)  { payload.wo_count  = payload.job_wo_count;  delete payload.job_wo_count;  }
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }

  async function onSaveFg(fgId: string, updates: Partial<FinishGroup & { pm_complexity: number | null }>) {
    await fetch(`/api/finish-groups/${fgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const stateUpdate: Partial<FinishGroup> = { ...updates };
    if ("pm_complexity" in updates) {
      stateUpdate.fg_complexity = updates.pm_complexity ?? null;
      delete (stateUpdate as Record<string,unknown>).pm_complexity;
    }
    setJobs(prev => prev.map(j => ({
      ...j,
      finish_groups: j.finish_groups.map(fg => fg.id === fgId ? { ...fg, ...stateUpdate } : fg),
    })));
  }

  const visible = jobs.filter(j => {
    if (filterStatus === "active" && !ACTIVE_STATUSES.includes(j.status)) return false;
    if (filterStatus !== "active" && filterStatus !== "all" && j.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        j.client_name.toLowerCase().includes(q) ||
        (j.job_number ?? "").toLowerCase().includes(q) ||
        (j.pm ?? "").toLowerCase().includes(q) ||
        (j.city ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const total = visible.length;
  const hasValue    = visible.filter(j => j.estimated_value != null).length;
  const hasPm       = visible.filter(j => j.pm).length;
  const hasDelivery = visible.filter(j => j.delivery_date).length;
  const hasBoxes    = visible.filter(j => {
    if (j.finish_groups.length > 0) return j.finish_groups.some(fg => fg.box_count != null);
    return j.job_box_count != null;
  }).length;
  const hasEngHrs   = visible.filter(j => calcJobEngHours(j, engConfig) != null).length;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const statusCounts = ALL_STATUSES.reduce<Record<string,number>>((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-4 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Constraints Data</h1>
          <p className="text-white/30 text-xs mt-1">Per-FG box counts, WO calc, complexity → ENG hours estimate</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest transition-colors">
            &#8635; Refresh
          </button>
          <Link href="/admin" className="text-white/40 hover:text-white text-sm transition-colors">&#8592; Admin</Link>
        </div>
      </div>

      {/* Completeness bars */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Est. Value", n: hasValue },
          { label: "PM Assigned", n: hasPm },
          { label: "Delivery Date", n: hasDelivery },
          { label: "Box Counts", n: hasBoxes },
          { label: "ENG Hrs Ready", n: hasEngHrs },
        ].map(({ label, n }) => (
          <div key={label} className="bg-[#1a1b1c] border border-white/10 rounded-xl p-3">
            <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{n}<span className="text-white/30 text-sm">/{total}</span></div>
            <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct(n) === 100 ? "bg-green-400" : pct(n) > 60 ? "bg-[#f08122]" : "bg-red-400"}`}
                style={{ width: `${pct(n)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Formula config panel */}
      <FormulaConfigPanel cfg={engConfig} onChange={setEngConfig} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/60 w-48" />
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Active", key: "active", count: jobs.filter(j => ACTIVE_STATUSES.includes(j.status)).length },
            { label: "All", key: "all", count: jobs.length },
            ...ALL_STATUSES.filter(s => (statusCounts[s] ?? 0) > 0 && !["complete","cancelled"].includes(s)).map(s => ({
              label: STATUS_LABEL[s], key: s, count: statusCounts[s],
            })),
          ].map(({ label, key, count }) => (
            <button key={key} onClick={() => setFilterStatus(key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-condensed uppercase tracking-widest transition-colors ${filterStatus === key ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-white/30 py-20 text-sm">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[10px] font-condensed uppercase tracking-widest bg-[#111213]">
                <th className="text-left px-4 py-3">Job / Finish Group</th>
                <th className="text-left px-2 py-3">Status</th>
                <th className="text-right px-2 py-3" title="PM's estimated project value — see Pipeline for quoted price">Est. Value &#9999;</th>
                <th className="text-left px-2 py-3">Complexity &#9999;</th>
                <th className="text-left px-2 py-3">PM</th>
                <th className="text-left px-2 py-3">Delivery &#9999;</th>
                <th className="text-left px-2 py-3">Install Start &#9999;</th>
                <th className="text-left px-2 py-3">Duration &#9999;</th>
                <th className="text-right px-2 py-3">Boxes &#9999; → WO</th>
                <th className="text-right px-3 py-3 text-violet-300/70">ENG Hrs</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(job => (
                <JobRow key={job.id} job={job} pms={pms} engConfig={engConfig} onSaveJob={onSaveJob} onSaveFg={onSaveFg} />
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={10} className="text-center text-white/20 py-12 text-sm">
                  {search ? "No jobs match" : "No active jobs"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-white/20 text-[10px] font-condensed mt-4">
        Each FG = minimum 1 WO; +1 per 65 boxes. Complexity on FG row inherits job default (shown as ↑). ENG Hrs = value-per-WO through bracket table × complexity mult + {engConfig.fixedFloor} hr floor.
      </p>
    </div>
  );
}
