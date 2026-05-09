"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { calculateTrim, TrimStyle, SpecLevel } from "@/lib/trim-calc";
import { calcDoorPrice } from "@/lib/door-calc";
import type { DoorItem } from "@/components/DoorSpecClient";
import type { CabinetFamily, DoorCatalog, DoorStyle } from "@/lib/catalogs";
import type { BuilderSession } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpressColor = { id: string; name: string; hex?: string | null };
type ExpressColorBook = { paint: ExpressColor[]; stain: ExpressColor[]; melamine: ExpressColor[] };

type ExpressFinishGroup = {
  id: string; label: string;
  finish_type: "paint" | "stain" | "melamine";
  color_id: string; color_name: string;
  door_style_id: string; box_material: "melamine" | "plywood";
};

type ExpressCabinet = {
  id: string; family_code: string;
  width_in: number | null; height_in: number | null; depth_in: number | null;
  qty: number; hinge_side: string; rollout_trays_qty: number;
  trash_kit: string; applied_panels: boolean; special_instructions: string;
  sort_order: number;
};

type ExpressRoom = { id: string; name: string; finish_group_id: string; cabinets: ExpressCabinet[] };

type TrimState = {
  door_height: string; trim_style: TrimStyle; spec_level: SpecLevel;
  drywall_int_jambs: boolean; full_drywall_wrap: boolean;
  base_lf: number; crown_lf: number; shoe_lf: number;
  chair_rail_lf: number; stair_nosing_lf: number; wainscoting_cap_lf: number;
  case_openings: number; window_openings: number;
  pocket_doors: number; barn_or_wrapped: number; sliders: number;
};

type WizardState = {
  client_name: string; site_address: string; city: string;
  delivery_date: string; project_notes: string;
  include_cabinets: boolean; include_trim: boolean; include_doors: boolean;
  finish_groups: ExpressFinishGroup[]; rooms: ExpressRoom[];
  trim: TrimState;
  door_items: DoorItem[];
};

type CatalogData = {
  expressColors: ExpressColorBook;
  doorStyles: DoorStyle[];
  cabinetFamilies: CabinetFamily[];
  doorCatalog: DoorCatalog;
};

type Step = "project" | "scope" | "cabinets" | "trim" | "doors" | "review";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }
function r(n: number) { return Math.round(n * 10) / 10; }

const DEFAULT_TRIM: TrimState = {
  door_height: "7/0", trim_style: "craftsman", spec_level: "standard",
  drywall_int_jambs: false, full_drywall_wrap: false,
  base_lf: 0, crown_lf: 0, shoe_lf: 0, chair_rail_lf: 0,
  stair_nosing_lf: 0, wainscoting_cap_lf: 0,
  case_openings: 0, window_openings: 0, pocket_doors: 0, barn_or_wrapped: 0, sliders: 0,
};

// ─── Small shared UI ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-1">{children}</label>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-4 mt-8 first:mt-0 border-b border-white/10 pb-1">{children}</h3>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}
function TextIn({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60" />;
}
function NumIn({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" min={0} value={value || ""} placeholder="0" onChange={e => onChange(parseFloat(e.target.value) || 0)} className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60" />;
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

// ─── Step: Project ────────────────────────────────────────────────────────────

function StepProject({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-0">
      <SectionTitle>Project Details</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Client Name *"><TextIn value={state.client_name} onChange={v => update({ client_name: v })} placeholder="Smith Residence" required /></Field>
        <Field label="Delivery Date"><input type="date" value={state.delivery_date} onChange={e => update({ delivery_date: e.target.value })} className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60" /></Field>
        <Field label="Site Address *"><TextIn value={state.site_address} onChange={v => update({ site_address: v })} placeholder="1234 Main St" required /></Field>
        <Field label="City"><TextIn value={state.city} onChange={v => update({ city: v })} placeholder="Coeur d'Alene" /></Field>
      </div>
      <div className="mt-4">
        <Label>Notes</Label>
        <textarea value={state.project_notes} onChange={e => update({ project_notes: e.target.value })} rows={3} placeholder="Any details that help us prepare your order…" className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60 resize-none" />
      </div>
    </div>
  );
}

// ─── Step: Scope ──────────────────────────────────────────────────────────────

function StepScope({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  function toggle(key: keyof WizardState) {
    update({ [key]: !state[key as keyof WizardState] } as Partial<WizardState>);
  }
  const opts = [
    { key: "include_cabinets", label: "Cabinets", desc: "Kitchen, baths, closets — full cabinet order" },
    { key: "include_trim",     label: "Trim",     desc: "Base, crown, casing, jambs — millwork supply" },
    { key: "include_doors",    label: "Doors",    desc: "Interior & exterior doors, bifolds, bypasses" },
  ] as const;
  return (
    <div>
      <SectionTitle>What does this order include?</SectionTitle>
      <p className="text-white/30 text-sm mb-6">Select everything that applies. We'll only show you the relevant sections.</p>
      <div className="space-y-3">
        {opts.map(o => {
          const checked = state[o.key] as boolean;
          return (
            <button key={o.key} type="button" onClick={() => toggle(o.key)}
              className={`w-full flex items-center gap-4 border rounded p-4 transition-colors text-left ${checked ? "border-[#f08122]/60 bg-[#f08122]/5" : "border-white/10 bg-white/3 hover:border-white/25"}`}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? "border-[#f08122] bg-[#f08122]" : "border-white/30"}`}>
                {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <div>
                <p className="text-white font-condensed uppercase tracking-widest text-sm">{o.label}</p>
                <p className="text-white/40 text-xs mt-0.5">{o.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
      {!state.include_cabinets && !state.include_trim && !state.include_doors && (
        <p className="text-yellow-400/60 text-xs font-condensed mt-4">Select at least one to continue.</p>
      )}
    </div>
  );
}

// ─── Step: Cabinets ───────────────────────────────────────────────────────────

function StepCabinets({ state, update, catalogs }: { state: WizardState; update: (p: Partial<WizardState>) => void; catalogs: CatalogData }) {
  const { expressColors, doorStyles, cabinetFamilies } = catalogs;
  const familyMap = Object.fromEntries(cabinetFamilies.map(f => [f.family_code, f]));

  // ── Finish groups ──
  function addFG() {
    const colors = expressColors.paint;
    update({ finish_groups: [...state.finish_groups, {
      id: uid(), label: `Finish ${state.finish_groups.length + 1}`,
      finish_type: "paint", color_id: colors[0].id, color_name: colors[0].name,
      door_style_id: doorStyles[0]?.id ?? "", box_material: "melamine",
    }] });
  }
  function updateFG(id: string, patch: Partial<ExpressFinishGroup>) {
    update({ finish_groups: state.finish_groups.map(fg => fg.id === id ? { ...fg, ...patch } : fg) });
  }
  function removeFG(id: string) {
    update({ finish_groups: state.finish_groups.filter(fg => fg.id !== id) });
  }

  // ── Rooms ──
  function addRoom() {
    const fg = state.finish_groups[0];
    update({ rooms: [...state.rooms, { id: uid(), name: "", finish_group_id: fg?.id ?? "", cabinets: [] }] });
  }
  function updateRoom(id: string, patch: Partial<ExpressRoom>) {
    update({ rooms: state.rooms.map(r => r.id === id ? { ...r, ...patch } : r) });
  }
  function removeRoom(id: string) {
    update({ rooms: state.rooms.filter(r => r.id !== id) });
  }

  // ── Cabinets ──
  function addCabinet(roomId: string) {
    const fam = cabinetFamilies[0];
    const cab: ExpressCabinet = {
      id: uid(), family_code: fam.family_code,
      width_in: fam.allowed_widths_in?.[0] ?? null,
      height_in: fam.default_height_in ?? null,
      depth_in: fam.default_depth_in ?? null,
      qty: 1, hinge_side: "", rollout_trays_qty: 0,
      trash_kit: "None", applied_panels: false, special_instructions: "",
      sort_order: 0,
    };
    updateRoom(roomId, { cabinets: [...(state.rooms.find(r => r.id === roomId)?.cabinets ?? []), cab] });
  }
  function updateCabinet(roomId: string, cabId: string, patch: Partial<ExpressCabinet>) {
    updateRoom(roomId, {
      cabinets: state.rooms.find(r => r.id === roomId)!.cabinets.map(c => c.id === cabId ? { ...c, ...patch } : c),
    });
  }
  function removeCabinet(roomId: string, cabId: string) {
    updateRoom(roomId, { cabinets: state.rooms.find(r => r.id === roomId)!.cabinets.filter(c => c.id !== cabId) });
  }

  const colorListFor = (ft: string) =>
    ft === "stain" ? expressColors.stain : ft === "melamine" ? expressColors.melamine : expressColors.paint;

  return (
    <div>
      {/* Finish Groups */}
      <SectionTitle>Finish Groups</SectionTitle>
      <p className="text-white/30 text-xs mb-4 -mt-2">Most jobs use one finish. Add more only if rooms differ (e.g. kitchen vs. laundry).</p>
      {state.finish_groups.map(fg => {
        const colors = colorListFor(fg.finish_type);
        return (
          <div key={fg.id} className="bg-white/5 border border-white/10 rounded p-4 mb-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Label"><TextIn value={fg.label} onChange={v => updateFG(fg.id, { label: v })} /></Field>
              <Field label="Finish Type">
                <Sel value={fg.finish_type} onChange={v => {
                  const cols = colorListFor(v);
                  updateFG(fg.id, { finish_type: v as ExpressFinishGroup["finish_type"], color_id: cols[0].id, color_name: cols[0].name });
                }} options={[{ value: "paint", label: "Paint" }, { value: "stain", label: "Stain" }, { value: "melamine", label: "Melamine" }]} />
              </Field>
              <Field label="Color">
                <Sel value={fg.color_id} onChange={v => {
                  const col = colors.find(c => c.id === v);
                  updateFG(fg.id, { color_id: v, color_name: col?.name ?? v });
                }} options={colors.map(c => ({ value: c.id, label: c.name }))} />
              </Field>
              <Field label="Door Style">
                <Sel value={fg.door_style_id} onChange={v => updateFG(fg.id, { door_style_id: v })}
                  options={doorStyles.map(d => ({ value: d.id, label: d.name }))} />
              </Field>
              <Field label="Box Material">
                <Sel value={fg.box_material} onChange={v => updateFG(fg.id, { box_material: v as "melamine" | "plywood" })}
                  options={[{ value: "melamine", label: "Melamine" }, { value: "plywood", label: "Plywood" }]} />
              </Field>
              <div className="flex items-end">
                {state.finish_groups.length > 1 && (
                  <button onClick={() => removeFG(fg.id)} className="text-red-400/60 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <button onClick={addFG} className="text-[#f08122] hover:text-[#f08122]/70 font-condensed uppercase tracking-widest text-xs transition-colors">+ Add Finish Group</button>

      {/* Rooms */}
      <SectionTitle>Rooms &amp; Cabinets</SectionTitle>
      {state.rooms.length === 0 && (
        <p className="text-white/30 text-sm mb-4">No rooms yet.</p>
      )}
      {state.rooms.map(room => (
        <div key={room.id} className="mb-6 border border-white/10 rounded">
          {/* Room header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border-b border-white/10 rounded-t">
            <input value={room.name} onChange={e => updateRoom(room.id, { name: e.target.value })} placeholder="Room name (e.g. Kitchen)"
              className="flex-1 bg-transparent text-white font-condensed uppercase tracking-widest text-sm focus:outline-none placeholder:text-white/20" />
            {state.finish_groups.length > 1 && (
              <select value={room.finish_group_id} onChange={e => updateRoom(room.id, { finish_group_id: e.target.value })}
                className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1 text-white text-xs focus:outline-none">
                {state.finish_groups.map(fg => <option key={fg.id} value={fg.id}>{fg.label}</option>)}
              </select>
            )}
            <button onClick={() => removeRoom(room.id)} className="text-white/20 hover:text-red-400 transition-colors text-lg leading-none">×</button>
          </div>

          {/* Cabinet rows */}
          <div className="p-3 space-y-2">
            {room.cabinets.map(cab => {
              const fam = familyMap[cab.family_code];
              const categories: CabinetFamily["category"][] = ["Base", "Wall", "Tall", "Vanity", "Accessory"];
              return (
                <div key={cab.id} className="grid gap-2 items-end" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
                  {/* Family picker */}
                  <select value={cab.family_code} onChange={e => {
                    const nf = familyMap[e.target.value];
                    updateCabinet(room.id, cab.id, {
                      family_code: e.target.value,
                      width_in: nf?.allowed_widths_in?.[0] ?? null,
                      height_in: nf?.default_height_in ?? null,
                      depth_in: nf?.default_depth_in ?? null,
                      hinge_side: nf?.requires_hinge_side ? "left" : "",
                      rollout_trays_qty: 0, trash_kit: "None", applied_panels: false,
                    });
                  }} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                    {categories.map(cat => {
                      const fams = cabinetFamilies.filter(f => f.category === cat);
                      if (!fams.length) return null;
                      return <optgroup key={cat} label={cat}>{fams.map(f => <option key={f.family_code} value={f.family_code}>{f.display_name}</option>)}</optgroup>;
                    })}
                  </select>
                  {/* W */}
                  {fam?.allowed_widths_in?.length ? (
                    <select value={cab.width_in ?? ""} onChange={e => updateCabinet(room.id, cab.id, { width_in: parseFloat(e.target.value) })}
                      className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                      {fam.allowed_widths_in.map(w => <option key={w} value={w}>{w}" W</option>)}
                    </select>
                  ) : (
                    <input type="number" value={cab.width_in ?? ""} placeholder='W"' onChange={e => updateCabinet(room.id, cab.id, { width_in: parseFloat(e.target.value) || null })}
                      className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none" />
                  )}
                  {/* H */}
                  {fam?.allowed_heights_in?.length ? (
                    <select value={cab.height_in ?? ""} onChange={e => updateCabinet(room.id, cab.id, { height_in: parseFloat(e.target.value) })}
                      className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                      {fam.allowed_heights_in.map(h => <option key={h} value={h}>{h}" H</option>)}
                    </select>
                  ) : (
                    <input type="number" value={cab.height_in ?? ""} placeholder='H"' onChange={e => updateCabinet(room.id, cab.id, { height_in: parseFloat(e.target.value) || null })}
                      className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none" />
                  )}
                  {/* Qty */}
                  <input type="number" min={1} value={cab.qty} onChange={e => updateCabinet(room.id, cab.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs text-center focus:outline-none" />
                  {/* Hinge */}
                  {fam?.requires_hinge_side ? (
                    <select value={cab.hinge_side} onChange={e => updateCabinet(room.id, cab.id, { hinge_side: e.target.value })}
                      className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                      <option value="left">LH</option><option value="right">RH</option>
                    </select>
                  ) : <div />}
                  <button onClick={() => removeCabinet(room.id, cab.id)} className="text-white/20 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                </div>
              );
            })}
            <button onClick={() => addCabinet(room.id)} className="text-[#f08122] hover:text-[#f08122]/70 font-condensed uppercase tracking-widest text-xs transition-colors mt-1">+ Add Cabinet</button>
          </div>
        </div>
      ))}
      <button onClick={addRoom} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors">+ Add Room</button>
    </div>
  );
}

// ─── Step: Trim ───────────────────────────────────────────────────────────────

function StepTrim({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const trim = state.trim;
  function t<K extends keyof TrimState>(key: K, val: TrimState[K]) {
    update({ trim: { ...trim, [key]: val } });
  }
  const result = calculateTrim(trim);
  return (
    <div>
      <SectionTitle>Style &amp; Specification</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Trim Style"><Sel value={trim.trim_style} onChange={v => t("trim_style", v as TrimStyle)} options={[{ value: "craftsman", label: "Craftsman" }, { value: "craftsman_plus", label: "Craftsman Plus" }, { value: "mitered", label: "Mitered" }]} /></Field>
        <Field label="Spec Level"><Sel value={trim.spec_level} onChange={v => t("spec_level", v as SpecLevel)} options={[{ value: "economy", label: "Economy" }, { value: "standard", label: "Standard" }, { value: "premium", label: "Premium" }]} /></Field>
        <Field label="Door Height"><Sel value={trim.door_height} onChange={v => t("door_height", v)} options={["6/8", "7/0", "8/0"].map(h => ({ value: h, label: h }))} /></Field>
      </div>

      <SectionTitle>Options</SectionTitle>
      <div className="flex gap-8">
        {[["drywall_int_jambs", "Drywall interior jambs"], ["full_drywall_wrap", "Full drywall wrap"]] .map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={trim[key as keyof TrimState] as boolean} onChange={e => t(key as keyof TrimState, e.target.checked as never)} className="accent-[#f08122] w-4 h-4" />
            <span className="text-white/70 font-condensed uppercase tracking-widest text-xs">{label}</span>
          </label>
        ))}
      </div>

      <SectionTitle>Running Trim — Linear Feet</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        {(["base_lf", "shoe_lf", "crown_lf", "chair_rail_lf", "stair_nosing_lf", "wainscoting_cap_lf"] as (keyof TrimState)[]).map(key => (
          <Field key={key} label={key.replace("_lf", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " LF"}>
            <NumIn value={trim[key] as number} onChange={v => t(key, v as never)} />
          </Field>
        ))}
      </div>

      <SectionTitle>Opening Counts</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        {([["case_openings", "Cased Openings"], ["window_openings", "Windows"], ["pocket_doors", "Pocket Doors"], ["barn_or_wrapped", "Barn / Wrapped"], ["sliders", "Sliders"]] as [keyof TrimState, string][]).map(([key, label]) => (
          <Field key={key} label={label}><NumIn value={trim[key] as number} onChange={v => t(key, v as never)} /></Field>
        ))}
      </div>

      {result.rows.length > 0 && (
        <div className="mt-6 bg-white/3 border border-white/10 rounded p-4">
          <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-3">Preview</p>
          <div className="space-y-1">
            {result.rows.map(row => (
              <div key={row.key} className="flex justify-between text-sm">
                <span className="text-white/60">{row.label}</span>
                <span className="text-white tabular-nums">{row.lf.toFixed(1)} lf → <span className="text-[#f08122]">{row.bf_ordered.toFixed(1)} bf</span></span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex justify-between font-condensed uppercase tracking-widest text-xs">
            <span className="text-white/40">Total</span>
            <span className="text-white">{result.total_lf.toFixed(1)} lf / <span className="text-[#f08122] font-bold">{result.total_bf.toFixed(1)} bf</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Doors ──────────────────────────────────────────────────────────────

function StepDoors({ state, update, catalog }: { state: WizardState; update: (p: Partial<WizardState>) => void; catalog: DoorCatalog }) {
  function addItem() {
    const type = catalog.door_types[1];
    const size = catalog.sizes[type.id]?.[2]?.nom ?? "";
    const price = calcDoorPrice(catalog, type.id, size, "hollow", "paint_grade", "none");
    const item: DoorItem = { id: uid(), door_type: type.id, size_nom: size, core: "hollow", species: "paint_grade", swing: "none", hardware: "none", bore: true, hinge_prep: true, qty: 1, unit_price: price, price_override: false, notes: "", sort_order: state.door_items.length };
    update({ door_items: [...state.door_items, item] });
  }
  function updateItem(id: string, patch: Partial<DoorItem>) {
    const next = state.door_items.map(it => {
      if (it.id !== id) return it;
      const merged = { ...it, ...patch };
      if (!merged.price_override) {
        merged.unit_price = calcDoorPrice(catalog, merged.door_type, merged.size_nom, merged.core, merged.species, merged.hardware);
      }
      return merged;
    });
    update({ door_items: next });
  }
  function removeItem(id: string) { update({ door_items: state.door_items.filter(it => it.id !== id) }); }

  const total = state.door_items.reduce((s, it) => s + it.qty * it.unit_price, 0);

  return (
    <div>
      <SectionTitle>Door List</SectionTitle>
      <button onClick={addItem} className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors mb-4">+ Add Door</button>
      {state.door_items.length === 0 ? (
        <p className="text-white/30 text-sm">No doors yet.</p>
      ) : (
        <div className="space-y-2">
          {state.door_items.map(item => {
            const typeInfo = catalog.door_types.find(t => t.id === item.door_type);
            const sizes = catalog.sizes[item.door_type] ?? [];
            return (
              <div key={item.id} className="grid gap-2 items-center bg-white/3 border border-white/8 rounded px-3 py-2" style={{ gridTemplateColumns: "1.5fr 1fr 0.7fr 1fr 0.5fr 0.6fr 0.4fr 0.7fr auto" }}>
                <select value={item.door_type} onChange={e => {
                  const nt = catalog.door_types.find(t => t.id === e.target.value)!;
                  const ns = catalog.sizes[nt.id]?.[0]?.nom ?? "";
                  updateItem(item.id, { door_type: nt.id, size_nom: ns, swing: nt.has_swing ? item.swing : "none", hardware: nt.has_hardware ? item.hardware : "none" });
                }} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                  {catalog.door_types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <select value={item.size_nom} onChange={e => updateItem(item.id, { size_nom: e.target.value })} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                  {sizes.map(s => <option key={s.nom} value={s.nom}>{s.nom}</option>)}
                </select>
                <select value={item.core} onChange={e => updateItem(item.id, { core: e.target.value as DoorItem["core"] })} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                  <option value="hollow">Hollow</option><option value="solid">Solid</option>
                </select>
                <select value={item.species} onChange={e => updateItem(item.id, { species: e.target.value })} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                  {[["paint_grade","Paint Grade"],["knotty_alder","Knotty Alder"],["clear_alder","Clear Alder"],["knotty_pine","Knotty Pine"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {typeInfo?.has_swing ? (
                  <select value={item.swing} onChange={e => updateItem(item.id, { swing: e.target.value as DoorItem["swing"] })} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                    <option value="left">LH</option><option value="right">RH</option><option value="none">—</option>
                  </select>
                ) : <span className="text-white/20 text-xs text-center">—</span>}
                {typeInfo?.has_hardware ? (
                  <select value={item.hardware} onChange={e => updateItem(item.id, { hardware: e.target.value as DoorItem["hardware"] })} className="bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
                    <option value="none">None</option><option value="passage">Passage</option><option value="privacy">Privacy</option><option value="dummy">Dummy</option>
                  </select>
                ) : <span className="text-white/20 text-xs text-center">—</span>}
                <input type="number" min={1} value={item.qty} onChange={e => updateItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })} className="bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs text-center focus:outline-none" />
                <span className="text-white text-xs tabular-nums text-right">${(item.qty * item.unit_price).toFixed(2)}</span>
                <button onClick={() => removeItem(item.id)} className="text-white/20 hover:text-red-400 transition-colors text-lg leading-none">×</button>
              </div>
            );
          })}
          <div className="flex justify-end pt-2 border-t border-white/10">
            <span className="text-white/40 text-xs font-condensed mr-3">Estimate</span>
            <span className="text-[#f08122] font-bold tabular-nums">${total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Review ─────────────────────────────────────────────────────────────

function StepReview({ state, catalogs, submitting }: { state: WizardState; catalogs: CatalogData; submitting: boolean }) {
  const fgMap = Object.fromEntries(state.finish_groups.map(fg => [fg.id, fg]));
  const totalCabs = state.rooms.reduce((n, r) => n + r.cabinets.reduce((m, c) => m + c.qty, 0), 0);
  const trimResult = state.include_trim ? calculateTrim(state.trim) : null;
  const doorTotal = state.door_items.reduce((s, it) => s + it.qty * it.unit_price, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded p-5">
        <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-3">Project</p>
        <p className="text-white text-lg font-heading">{state.client_name || <span className="text-white/30">—</span>}</p>
        <p className="text-white/50 text-sm">{state.site_address}{state.city ? `, ${state.city}` : ""}</p>
        {state.delivery_date && <p className="text-white/40 text-sm mt-1">Delivery: {state.delivery_date}</p>}
        {state.project_notes && <p className="text-white/40 text-sm mt-1 italic">{state.project_notes}</p>}
      </div>

      {state.include_cabinets && (
        <div className="bg-white/5 border border-white/10 rounded p-5">
          <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-3">Cabinets</p>
          <p className="text-white">{state.rooms.length} room{state.rooms.length !== 1 ? "s" : ""} · {totalCabs} unit{totalCabs !== 1 ? "s" : ""}</p>
          {state.rooms.map(room => {
            const fg = fgMap[room.finish_group_id];
            return (
              <div key={room.id} className="mt-3 border-t border-white/5 pt-3">
                <p className="text-white/70 text-sm font-condensed">{room.name || "(unnamed)"}{fg ? <span className="text-white/30 ml-2">· {fg.finish_type} / {fg.color_name}</span> : ""}</p>
                <p className="text-white/30 text-xs">{room.cabinets.length} cabinet{room.cabinets.length !== 1 ? "s" : ""}</p>
              </div>
            );
          })}
        </div>
      )}

      {state.include_trim && trimResult && (
        <div className="bg-white/5 border border-white/10 rounded p-5">
          <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-3">Trim</p>
          <p className="text-white">{trimResult.total_lf.toFixed(1)} lf · <span className="text-[#f08122]">{trimResult.total_bf.toFixed(1)} bf to order</span></p>
          <p className="text-white/30 text-xs mt-1">{state.trim.trim_style.replace(/_/g," ")} / {state.trim.spec_level} / {state.trim.door_height} doors</p>
        </div>
      )}

      {state.include_doors && state.door_items.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded p-5">
          <p className="text-white/40 font-condensed uppercase tracking-widest text-xs mb-3">Doors</p>
          <p className="text-white">{state.door_items.reduce((n, it) => n + it.qty, 0)} door{state.door_items.reduce((n, it) => n + it.qty, 0) !== 1 ? "s" : ""} · <span className="text-[#f08122]">${doorTotal.toFixed(2)} estimate</span></p>
        </div>
      )}

      <div className="border border-yellow-400/20 bg-yellow-400/5 rounded p-4">
        <p className="text-yellow-400/80 font-condensed uppercase tracking-widest text-xs">Before You Submit</p>
        <p className="text-white/50 text-sm mt-1">Review your order above. After submitting, your ACC project manager will call to confirm and arrange payment. You cannot edit after submission.</p>
      </div>

      <button type="submit" disabled={submitting}
        className="w-full bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest py-4 rounded text-sm transition-colors disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit Order"}
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function ExpressWizard({ builder, catalogs }: { builder: BuilderSession; catalogs: CatalogData }) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => ({
    client_name: "", site_address: "", city: "", delivery_date: "", project_notes: "",
    include_cabinets: true, include_trim: false, include_doors: false,
    finish_groups: [{
      id: uid(), label: "All Rooms", finish_type: "paint",
      color_id: catalogs.expressColors.paint[0].id,
      color_name: catalogs.expressColors.paint[0].name,
      door_style_id: catalogs.doorStyles[0]?.id ?? "",
      box_material: "melamine",
    }],
    rooms: [],
    trim: DEFAULT_TRIM,
    door_items: [],
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const latestState = useRef(state);

  function update(patch: Partial<WizardState>) {
    const next = { ...latestState.current, ...patch };
    latestState.current = next;
    setState(next);
  }

  function getSteps(): Step[] {
    return [
      "project", "scope",
      ...(state.include_cabinets ? ["cabinets" as Step] : []),
      ...(state.include_trim     ? ["trim"     as Step] : []),
      ...(state.include_doors    ? ["doors"    as Step] : []),
      "review",
    ];
  }

  const steps = getSteps();
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  const STEP_LABELS: Record<Step, string> = {
    project: "Project", scope: "Scope", cabinets: "Cabinets",
    trim: "Trim", doors: "Doors", review: "Review",
  };

  function canAdvance(): boolean {
    if (currentStep === "project") return !!state.client_name.trim() && !!state.site_address.trim();
    if (currentStep === "scope") return state.include_cabinets || state.include_trim || state.include_doors;
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    const res = await fetch("/api/express/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latestState.current),
    });
    if (res.ok) {
      const { job_id } = await res.json();
      router.push(`/express/submitted?job=${job_id}`);
    } else {
      setSubmitError("Something went wrong. Please try again or call your ACC project manager.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-10 overflow-x-auto">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-condensed uppercase tracking-widest text-xs ${
              i === stepIndex ? "bg-[#f08122] text-white" :
              i < stepIndex  ? "text-white/40" : "text-white/20"
            }`}>
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </div>
            {i < steps.length - 1 && <span className="text-white/15 text-xs">›</span>}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-10">
        {currentStep === "project"  && <StepProject   state={state} update={update} />}
        {currentStep === "scope"    && <StepScope     state={state} update={update} />}
        {currentStep === "cabinets" && <StepCabinets  state={state} update={update} catalogs={catalogs} />}
        {currentStep === "trim"     && <StepTrim      state={state} update={update} />}
        {currentStep === "doors"    && <StepDoors     state={state} update={update} catalog={catalogs.doorCatalog} />}
        {currentStep === "review"   && <StepReview    state={state} catalogs={catalogs} submitting={submitting} />}
      </div>

      {submitError && <p className="text-red-400 text-sm mb-4">{submitError}</p>}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => setStepIndex(i => Math.max(0, i - 1))} disabled={stepIndex === 0}
          className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 border border-white/10 rounded transition-colors disabled:opacity-0">
          ← Back
        </button>
        {currentStep !== "review" ? (
          <button onClick={() => setStepIndex(i => Math.min(steps.length - 1, i + 1))} disabled={!canAdvance()}
            className="bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors disabled:opacity-40">
            Next →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-8 rounded transition-colors disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit Order"}
          </button>
        )}
      </div>
    </div>
  );
}
