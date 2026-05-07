"use client";

import { useState, useMemo, useRef } from "react";
import {
  calculateTrim,
  TrimStyle,
  SpecLevel,
  TrimRow,
} from "@/lib/trim-calc";

// ─── Types ────────────────────────────────────────────────────────────────────

type TrimState = {
  notes: string;
  // Style
  door_height: string;
  trim_style: TrimStyle;
  spec_level: SpecLevel;
  // Flags
  drywall_int_jambs: boolean;
  full_drywall_wrap: boolean;
  // Running trim LF
  base_lf: number;
  crown_lf: number;
  shoe_lf: number;
  chair_rail_lf: number;
  stair_nosing_lf: number;
  wainscoting_cap_lf: number;
  // Opening counts
  case_openings: number;
  window_openings: number;
  pocket_doors: number;
  barn_or_wrapped: number;
  sliders: number;
  // Species (null = inherit default_species)
  default_species: string;
  base_species: string | null;
  shoe_species: string | null;
  crown_species: string | null;
  casing_species: string | null;
  headers_species: string | null;
  sill_species: string | null;
  apron_species: string | null;
  int_jamb_species: string | null;
  ext_jamb_species: string | null;
  chair_rail_species: string | null;
  stair_nosing_species: string | null;
  wainscoting_cap_species: string | null;
};

type Props = {
  specId: string;
  jobId: string;
  initial: TrimState;
  lastSaved: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SPECIES_OPTIONS = [
  "Paint Grade",
  "Alder",
  "Knotty Alder",
  "Poplar",
  "Hard Maple",
  "Cherry",
  "White Oak",
  "Red Oak",
  "Pine",
  "Knotty Pine",
  "MDF",
];

const DOOR_HEIGHTS = ["6/8", "7/0", "8/0"];
const TRIM_STYLES: { value: TrimStyle; label: string }[] = [
  { value: "craftsman",      label: "Craftsman" },
  { value: "craftsman_plus", label: "Craftsman Plus" },
  { value: "mitered",        label: "Mitered" },
];
const SPEC_LEVELS: { value: SpecLevel; label: string }[] = [
  { value: "economy",  label: "Economy" },
  { value: "standard", label: "Standard" },
  { value: "premium",  label: "Premium" },
];

// ─── Small shared UI primitives ───────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-4 mt-8 first:mt-0 border-b border-white/10 pb-1">
      {children}
    </h3>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value === 0 ? "" : value}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrimSpecClient({ specId, initial, lastSaved }: Props) {
  const [state, setState] = useState<TrimState>(initial);
  const [tab, setTab] = useState<"takeoff" | "materials">("takeoff");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    lastSaved ? "saved" : "unsaved",
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest state so setTimeout callbacks don't go stale
  const latestState = useRef<TrimState>(initial);

  const result = useMemo(
    () =>
      calculateTrim({
        door_height:        state.door_height,
        trim_style:         state.trim_style,
        spec_level:         state.spec_level,
        drywall_int_jambs:  state.drywall_int_jambs,
        full_drywall_wrap:  state.full_drywall_wrap,
        base_lf:            state.base_lf,
        crown_lf:           state.crown_lf,
        shoe_lf:            state.shoe_lf,
        chair_rail_lf:      state.chair_rail_lf,
        stair_nosing_lf:    state.stair_nosing_lf,
        wainscoting_cap_lf: state.wainscoting_cap_lf,
        case_openings:      state.case_openings,
        window_openings:    state.window_openings,
        pocket_doors:       state.pocket_doors,
        barn_or_wrapped:    state.barn_or_wrapped,
        sliders:            state.sliders,
      }),
    [state],
  );

  // ── State helpers ──────────────────────────────────────────────────────────

  function update<K extends keyof TrimState>(key: K, value: TrimState[K]) {
    const next = { ...latestState.current, [key]: value };
    latestState.current = next;
    setState(next);
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1500);
  }

  async function doSave() {
    setSaveStatus("saving");
    await fetch(`/api/trim-specs/${specId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latestState.current),
    });
    setSaveStatus("saved");
  }

  // Resolve per-row species (override ?? default)
  function rowSpecies(key: string): string {
    const override = state[`${key}_species` as keyof TrimState] as string | null;
    return override ?? state.default_species;
  }

  function setRowSpecies(key: string, val: string) {
    // If user selects the current default, clear the override
    const effective = val === state.default_species ? null : val;
    update(`${key}_species` as keyof TrimState, effective);
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const tabs = [
    { key: "takeoff",   label: "Takeoff" },
    { key: "materials", label: `Materials${result.rows.length > 0 ? ` (${result.rows.length})` : ""}` },
  ] as const;

  return (
    <div>
      {/* Save indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors ${
                tab === t.key
                  ? "bg-[#f08122] text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span
          className={`font-condensed uppercase tracking-widest text-xs ${
            saveStatus === "saved"
              ? "text-white/25"
              : saveStatus === "saving"
                ? "text-[#f08122]/60"
                : "text-yellow-400/70"
          }`}
        >
          {saveStatus === "saved"
            ? `Saved ${lastSaved ? new Date(lastSaved).toLocaleTimeString() : ""}`
            : saveStatus === "saving"
              ? "Saving…"
              : "Unsaved"}
        </span>
      </div>

      {/* ── Takeoff tab ──────────────────────────────────────────────────── */}
      {tab === "takeoff" && (
        <div className="space-y-0">
          {/* Style / Level / Door Height */}
          <SectionTitle>Style &amp; Specification</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Trim Style</Label>
              <SelectInput
                value={state.trim_style}
                onChange={(v) => update("trim_style", v as TrimStyle)}
                options={TRIM_STYLES}
              />
            </div>
            <div>
              <Label>Spec Level</Label>
              <SelectInput
                value={state.spec_level}
                onChange={(v) => update("spec_level", v as SpecLevel)}
                options={SPEC_LEVELS}
              />
            </div>
            <div>
              <Label>Door Height</Label>
              <SelectInput
                value={state.door_height}
                onChange={(v) => update("door_height", v)}
                options={DOOR_HEIGHTS.map((h) => ({ value: h, label: h }))}
              />
            </div>
          </div>

          {/* Flags */}
          <SectionTitle>Options</SectionTitle>
          <div className="flex gap-8">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={state.drywall_int_jambs}
                onChange={(e) => update("drywall_int_jambs", e.target.checked)}
                className="accent-[#f08122] w-4 h-4"
              />
              <span className="text-white/70 text-sm font-condensed uppercase tracking-widest text-xs">
                Drywall interior jambs
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={state.full_drywall_wrap}
                onChange={(e) => update("full_drywall_wrap", e.target.checked)}
                className="accent-[#f08122] w-4 h-4"
              />
              <span className="text-white/70 text-sm font-condensed uppercase tracking-widest text-xs">
                Full drywall wrap (no casing / ext jambs)
              </span>
            </label>
          </div>

          {/* Running trim LF */}
          <SectionTitle>Running Trim — Linear Feet</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["base_lf",            "Base LF"],
                ["shoe_lf",            "Shoe LF"],
                ["crown_lf",           "Crown LF"],
                ["chair_rail_lf",      "Chair Rail LF"],
                ["stair_nosing_lf",    "Stair Nosing LF"],
                ["wainscoting_cap_lf", "Wainscoting Cap LF"],
              ] as [keyof TrimState, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <NumInput
                  value={state[key] as number}
                  onChange={(v) => update(key, v)}
                />
              </div>
            ))}
          </div>

          {/* Opening counts */}
          <SectionTitle>Opening Counts</SectionTitle>
          <p className="text-white/30 text-xs font-condensed mb-4 -mt-2">
            Casing, headers, jambs, sill, and apron are all derived from these counts.
            Base automatically deducts 2 lf per opening.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["case_openings",   "Cased Openings"],
                ["window_openings", "Windows"],
                ["pocket_doors",    "Pocket Doors"],
                ["barn_or_wrapped", "Barn / Wrapped"],
                ["sliders",         "Sliders"],
              ] as [keyof TrimState, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <NumInput
                  value={state[key] as number}
                  onChange={(v) => update(key, v)}
                />
              </div>
            ))}
          </div>

          {/* Notes */}
          <SectionTitle>Notes</SectionTitle>
          <textarea
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            placeholder="Job-level notes…"
            className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60 resize-none"
          />
        </div>
      )}

      {/* ── Materials tab ────────────────────────────────────────────────── */}
      {tab === "materials" && (
        <div>
          {/* Default species */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-56">
              <Label>Default Species</Label>
              <SelectInput
                value={state.default_species}
                onChange={(v) => update("default_species", v)}
                options={SPECIES_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <p className="text-white/30 text-xs font-condensed mt-4">
              Applied to any category without an override below.
            </p>
          </div>

          {result.rows.length === 0 ? (
            <p className="text-white/30 font-condensed uppercase tracking-widest text-sm py-12 text-center">
              No trim calculated yet — enter LF and opening counts on the Takeoff tab.
            </p>
          ) : (
            <>
              {/* Materials table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/30 font-condensed uppercase tracking-widest text-xs border-b border-white/10">
                      <th className="text-left py-2 pr-4 w-40">Category</th>
                      <th className="text-right py-2 pr-4">LF</th>
                      <th className="text-right py-2 pr-4">Profile</th>
                      <th className="text-right py-2 pr-4">BF Raw</th>
                      <th className="text-right py-2 pr-4">Waste</th>
                      <th className="text-right py-2 pr-6">BF Order</th>
                      <th className="text-left py-2">Species</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {result.rows.map((row: TrimRow) => (
                      <tr key={row.key} className="group hover:bg-white/3">
                        <td className="py-3 pr-4 text-white/80 font-condensed">
                          {row.label}
                        </td>
                        <td className="py-3 pr-4 text-right text-white tabular-nums">
                          {row.lf.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/50 tabular-nums text-xs">
                          {row.width_in}&Prime; × {row.thickness_in}&Prime;
                        </td>
                        <td className="py-3 pr-4 text-right text-white/60 tabular-nums">
                          {row.bf_raw.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/40 tabular-nums text-xs">
                          +{row.waste_pct}%
                        </td>
                        <td className="py-3 pr-6 text-right text-white font-medium tabular-nums">
                          {row.bf_ordered.toFixed(1)}
                        </td>
                        <td className="py-3">
                          <select
                            value={rowSpecies(row.key)}
                            onChange={(e) => setRowSpecies(row.key, e.target.value)}
                            className="bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]/60 w-36"
                          >
                            {SPECIES_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                                {s === state.default_species ? " ✦" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-white/20 font-condensed uppercase tracking-widest text-xs">
                      <td className="pt-4 pb-2 text-white/50">Totals</td>
                      <td className="pt-4 pb-2 pr-4 text-right text-white tabular-nums">
                        {result.total_lf.toFixed(1)}
                      </td>
                      <td className="pt-4 pb-2 pr-4" />
                      <td className="pt-4 pb-2 pr-4" />
                      <td className="pt-4 pb-2 pr-4" />
                      <td className="pt-4 pb-2 pr-6 text-right text-[#f08122] tabular-nums font-bold">
                        {result.total_bf.toFixed(1)} BF
                      </td>
                      <td className="pt-4 pb-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary strip */}
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded px-5 py-4">
                  <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-1">
                    Total Linear Feet
                  </p>
                  <p className="text-white text-2xl font-heading">
                    {result.total_lf.toFixed(1)} <span className="text-white/40 text-base">lf</span>
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded px-5 py-4">
                  <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-1">
                    Total Board Feet to Order
                  </p>
                  <p className="text-[#f08122] text-2xl font-heading">
                    {result.total_bf.toFixed(1)} <span className="text-white/40 text-base">bf</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual save button */}
      <div className="mt-10 flex justify-end">
        <button
          onClick={() => doSave()}
          disabled={saveStatus === "saving"}
          className="bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs py-2.5 px-6 rounded transition-colors disabled:opacity-40"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
