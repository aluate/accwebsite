"use client";
/**
 * Spec form expansion v2 (2026-05-06): per-finish-group schedules editor.
 * One panel per finish group, rendering all 8 schedule sub-sections from the
 * RESIDENTIAL COVER SHEET layout.
 *
 * Wired into ResidentialSpecClient.tsx as a new "Schedules" tab. Saves via
 * POST /api/specs/[id]/schedules (separate from the legacy save endpoint to
 * keep the two persistence paths cleanly separated).
 *
 * Per DAC findings:
 *   - NO UNIQUE on door_fronts / drawers / hardware role enums (#1).
 *     UI lets user add additional rows for any role.
 *   - Edgeband codes pre-seeded D/E/I/V/U/B/C/X but uncapped (#5).
 *   - Mandatory hardware roles (hinges, drawer_slides, door_pulls, drawer_pulls)
 *     are highlighted; others are muted-by-default (collapsed-style cue).
 *   - Where-used REQUIRED on Cab Ext 2 / Int 2 (#11) — surfaced as a yellow
 *     warning row. Save still succeeds; API also re-checks.
 *   - Soft-warn on finish_type combo violations (#10) handled server-side;
 *     warnings returned in POST response and shown via a banner.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
// onRegisterSave is wired through SchedulesTabLoader from ResidentialSpecClient
// so the page-level "Save All" button can fire this panel's save in one click.
import type {
  CarcassMaterial, DrawerBox, Edgeband,
  Sheen, DrawerSlide, Glaze, Topcoat, DoorMaterial, MoldingMaterial,
  HardwareRow, CountertopStyle, CountertopEdge, CountertopMaterial,
  DoorStyle,
  CabDoorEdgeDetail, CabDoorInsideProfile, CabDoorPanel,
  PaintColor, StainColor,
} from "@/lib/catalogs";

// ── Canonical role lists (display order) ────────────────────────────────────
const MATERIAL_ROLES = [
  { role: "cab_ext",  label: "Cabinet Exterior",  required: true  },
  { role: "cab_int",  label: "Cabinet Interior",  required: true  },
  { role: "cab_ext2", label: "Cab Exterior 2",    required: false },
  { role: "cab_int2", label: "Cab Interior 2",    required: false },
] as const;

const DOOR_FRONT_ROLES = [
  { role: "base",         label: "Base Doors"    },
  { role: "upper",        label: "Upper Doors"   },
  { role: "applied_ends", label: "Applied Ends"  },
  { role: "slab_df",      label: "Slab DF"       },
  { role: "5pc_df",       label: "5 PC DF"       },
] as const;

const DRAWER_ROLES = [
  { role: "drawer_box", label: "Drawer Box" },
  { role: "rollout",    label: "Rollout"    },
] as const;

const EDGEBAND_CODES_DEFAULT = ["D", "E", "I", "V", "U", "B", "C", "X"] as const;
const CODE_TO_WHERE_USED: Record<string, string> = {
  D: "applied_ends_doors_dwr_fronts",
  E: "cabinet_body_parts",
  I: "adjustable_shelves",
  V: "bottom_upper_fe",
  U: "bottom_upper_unfe",
  B: "drawer_box_sides",
  C: "drawer_box_front_back",
  X: "misc",
};
const EDGEBAND_WHERE_USED_OPTIONS = [
  { value: "applied_ends_doors_dwr_fronts", label: "Applied Ends / Doors & Drawer Fronts" },
  { value: "cabinet_body_parts",            label: "Cabinet Body Parts" },
  { value: "adjustable_shelves",            label: "Adjustable Shelves" },
  { value: "bottom_upper_fe",               label: "Bottom of Upper F.E." },
  { value: "bottom_upper_unfe",             label: "Bottom of Upper Un-F.E." },
  { value: "drawer_box_sides",              label: "Drawer Box Sides" },
  { value: "drawer_box_front_back",         label: "Drawer Box Front/Back" },
  { value: "misc",                          label: "Misc — see notes" },
];

const HARDWARE_ROLES = [
  { role: "hinges",         label: "Hinges",         required: true  },
  { role: "drawer_slides",  label: "Drawer Slides",  required: true  },
  { role: "door_pulls",     label: "Door Pulls",     required: true  },
  { role: "drawer_pulls",   label: "Drawer Pulls",   required: true  },
  { role: "rollout_slides", label: "Rollout Slides", required: false },
  { role: "closet_rod",     label: "Closet Rod",     required: false },
  { role: "trash_pullout",  label: "Trash Pullout",  required: false },
  { role: "base_pullout",   label: "Base Pullout",   required: false },
  { role: "blind_corner",   label: "Blind Corner",   required: false },
  { role: "shelf_clips",    label: "Shelf Clips",    required: false },
  { role: "misc",           label: "Misc.",          required: false },
] as const;

const GRAIN_OPTIONS = [
  { value: "",           label: "—" },
  { value: "vertical",   label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "na",         label: "N/A" },
];

// ── Row types (mirror DB shape but client-side) ─────────────────────────────
type MaterialRow   = { finish_group_id: string; role: string; material_id: string | null; where_used: string | null; notes: string | null };
type DoorFrontRow  = { finish_group_id: string; role: string; slot_label: string | null; style_id: string | null; material_id: string | null; oe_id: string | null; ie_id: string | null; panel_id: string | null; grain: string | null; vendor: string | null; notes: string | null; sort_order: number };
type DrawerRow     = { finish_group_id: string; role: string; slot_label: string | null; drawer_box_id: string | null; slides_id: string | null; notes: string | null; sort_order: number };
type EdgebandRow   = { finish_group_id: string; code: string; edgeband_id: string | null; where_used: string | null; notes: string | null; sort_order: number };
type HardwareRowS  = { finish_group_id: string; role: string; slot_label: string | null; hardware_id: string | null; qty: number | null; location: string | null; vendor: string | null; notes: string | null; sort_order: number };
type CountertopRow = { finish_group_id: string; location: string | null; style_id: string | null; edge_id: string | null; splash_style: string | null; splash_edge_id: string | null; material_id: string | null; buildup_in: number | null; core_substrate: string | null; brackets: string | null; notes: string | null; sort_order: number };

type FinishUpdateRow = {
  finish_group_id: string; finish_type: string; label: string;
  stain_id: string | null; paint_id: string | null; glaze_id: string | null;
  topcoat_id: string | null; sheen_id: string | null; notes: string | null;
};

export type ScheduleCatalogs = {
  // Existing catalogs (already loaded by parent)
  carcassMaterials:  CarcassMaterial[];
  drawerBoxes:       DrawerBox[];
  edgebands:         Edgeband[];
  doorStyles:        DoorStyle[];
  cabDoorEdgeDetails:    CabDoorEdgeDetail[];
  cabDoorInsideProfiles: CabDoorInsideProfile[];
  cabDoorPanels:         CabDoorPanel[];
  paintColors:       PaintColor[];
  stainColors:       StainColor[];
  // New v2 catalogs
  sheens:            Sheen[];
  drawerSlides:      DrawerSlide[];
  glazes:            Glaze[];
  topcoats:          Topcoat[];
  doorMaterials:     DoorMaterial[];
  moldingMaterials:  MoldingMaterial[];
  countertopStyles:    CountertopStyle[];
  countertopEdges:     CountertopEdge[];
  countertopMaterials: CountertopMaterial[];
  // Hardware: 11 catalogs by role
  hardwareByRole:    Record<string, HardwareRow[]>;
};

type Props = {
  specId: string;
  finishGroups: { id: string; label: string; finish_type: string; notes: string | null;
                  stain_id: string | null; paint_id: string | null; glaze_id: string | null;
                  topcoat_id: string | null; sheen_id: string | null }[];
  initial: {
    materials: MaterialRow[];
    door_fronts: DoorFrontRow[];
    drawers: DrawerRow[];
    edgebands: EdgebandRow[];
    hardware: HardwareRowS[];
    countertops: CountertopRow[];
  };
  catalogs: ScheduleCatalogs;
  /**
   * Wires this panel's save() into the page-level "Save All" button on
   * ResidentialSpecClient. Called once on mount; invoking the registered fn
   * triggers the same POST /api/specs/[id]/schedules as the in-tab Save button.
   * Optional — the in-tab button still works if this isn't passed.
   */
  onRegisterSave?: (fn: () => Promise<void>) => void;
};

// ── Style tokens (match the existing form) ──────────────────────────────────
const LABEL  = "block text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-1";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;
const CARD   = "bg-[#0e0e0e] border border-white/10 rounded p-3 mb-3";
const SECTION_HDR = "text-[11px] font-bold uppercase tracking-widest text-[#f08122] mb-2 pb-1 border-b border-white/10";

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

// Pre-seed missing canonical rows so the editor always shows the full set.
function ensureRoles<T extends { role?: string; code?: string }>(
  rows: T[],
  canonical: readonly { role?: string; code?: string }[],
  fgId: string,
  build: (key: string) => T,
  keyField: "role" | "code" = "role",
): T[] {
  const have = new Set(rows.map((r) => r[keyField] as string));
  const seeded: T[] = [...rows];
  for (const c of canonical) {
    const k = (c as { role?: string; code?: string })[keyField] as string;
    if (!have.has(k)) seeded.push({ ...build(k), [keyField]: k } as T);
  }
  // Sort by canonical order, then any ad-hoc rows after
  const order = canonical.map((c) => (c as Record<string, unknown>)[keyField] as string);
  seeded.sort((a, b) => {
    const ai = order.indexOf((a[keyField] as string));
    const bi = order.indexOf((b[keyField] as string));
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  // Ensure finish_group_id is always set
  return seeded.map((s) => ({ ...s, finish_group_id: fgId }));
}

// Catalog dropdown helper
function CatalogSelect({
  value, onChange, options, placeholder,
  required, disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      className={SELECT}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      required={required}
      disabled={disabled}
    >
      <option value="">{placeholder ?? "— select —"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function SpecSchedulesPanel({ specId, finishGroups, initial, catalogs, onRegisterSave }: Props) {
  const [activeFgId, setActiveFgId] = useState<string>(finishGroups[0]?.id ?? "");
  const fg = finishGroups.find((g) => g.id === activeFgId) ?? finishGroups[0];

  // Per-finish-group state: pre-seed canonical rows where missing.
  const [materials,   setMaterials]   = useState<MaterialRow[]>(initial.materials);
  const [doorFronts,  setDoorFronts]  = useState<DoorFrontRow[]>(initial.door_fronts);
  const [drawers,     setDrawers]     = useState<DrawerRow[]>(initial.drawers);
  const [edgebands,   setEdgebands]   = useState<EdgebandRow[]>(initial.edgebands);
  const [hardware,    setHardware]    = useState<HardwareRowS[]>(initial.hardware);
  const [countertops, setCountertops] = useState<CountertopRow[]>(initial.countertops);
  const [finishUpdates, setFinishUpdates] = useState<FinishUpdateRow[]>(
    finishGroups.map((g) => ({
      finish_group_id: g.id, finish_type: g.finish_type, label: g.label,
      stain_id: g.stain_id, paint_id: g.paint_id, glaze_id: g.glaze_id,
      topcoat_id: g.topcoat_id, sheen_id: g.sheen_id, notes: g.notes,
    }))
  );

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);

  // Pre-seeded views for the active finish group.
  const fgMaterials  = useMemo(() =>
    ensureRoles(materials.filter((m) => m.finish_group_id === activeFgId), MATERIAL_ROLES, activeFgId,
      (k) => ({ finish_group_id: activeFgId, role: k, material_id: null, where_used: null, notes: null })),
    [materials, activeFgId]);

  const fgDoorFronts = useMemo(() =>
    ensureRoles(doorFronts.filter((d) => d.finish_group_id === activeFgId), DOOR_FRONT_ROLES, activeFgId,
      (k) => ({ finish_group_id: activeFgId, role: k, slot_label: null, style_id: null, material_id: null,
                oe_id: null, ie_id: null, panel_id: null, grain: null, vendor: null, notes: null, sort_order: 0 })),
    [doorFronts, activeFgId]);

  const fgDrawers = useMemo(() =>
    ensureRoles(drawers.filter((d) => d.finish_group_id === activeFgId), DRAWER_ROLES, activeFgId,
      (k) => ({ finish_group_id: activeFgId, role: k, slot_label: null, drawer_box_id: null, slides_id: null, notes: null, sort_order: 0 })),
    [drawers, activeFgId]);

  const fgEdgebands = useMemo(() =>
    ensureRoles(
      edgebands.filter((e) => e.finish_group_id === activeFgId),
      EDGEBAND_CODES_DEFAULT.map((c) => ({ code: c })),
      activeFgId,
      (k) => ({ finish_group_id: activeFgId, code: k, edgeband_id: null, where_used: CODE_TO_WHERE_USED[k] ?? null, notes: null, sort_order: 0 }),
      "code",
    ),
    [edgebands, activeFgId]);

  const fgHardware = useMemo(() =>
    ensureRoles(hardware.filter((h) => h.finish_group_id === activeFgId), HARDWARE_ROLES, activeFgId,
      (k) => ({ finish_group_id: activeFgId, role: k, slot_label: null, hardware_id: null, qty: null,
                location: null, vendor: null, notes: null, sort_order: 0 })),
    [hardware, activeFgId]);

  const fgCountertops = useMemo(() =>
    countertops.filter((c) => c.finish_group_id === activeFgId),
    [countertops, activeFgId]);

  const fgFinishUpdate = finishUpdates.find((u) => u.finish_group_id === activeFgId);

  // Reducer-style updaters
  function updateMaterial(role: string, patch: Partial<MaterialRow>) {
    setMaterials((all) => {
      const others = all.filter((m) => !(m.finish_group_id === activeFgId && m.role === role));
      const cur = all.find((m) => m.finish_group_id === activeFgId && m.role === role)
        ?? { finish_group_id: activeFgId, role, material_id: null, where_used: null, notes: null };
      return [...others, { ...cur, ...patch }];
    });
  }
  function updateDoorFront(idx: number, patch: Partial<DoorFrontRow>) {
    setDoorFronts((all) => {
      const fgRows = fgDoorFronts;
      const target = fgRows[idx];
      if (!target) return all;
      const others = all.filter((d) => d.finish_group_id !== activeFgId);
      const updated = fgRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return [...others, ...updated];
    });
  }
  function updateDrawer(idx: number, patch: Partial<DrawerRow>) {
    setDrawers((all) => {
      const fgRows = fgDrawers;
      const target = fgRows[idx];
      if (!target) return all;
      const others = all.filter((d) => d.finish_group_id !== activeFgId);
      const updated = fgRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return [...others, ...updated];
    });
  }
  function updateEdgeband(idx: number, patch: Partial<EdgebandRow>) {
    setEdgebands((all) => {
      const fgRows = fgEdgebands;
      const target = fgRows[idx];
      if (!target) return all;
      const others = all.filter((e) => e.finish_group_id !== activeFgId);
      const updated = fgRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return [...others, ...updated];
    });
  }
  function addEdgebandCode(code: string) {
    setEdgebands((all) => [...all, { finish_group_id: activeFgId, code, edgeband_id: null, where_used: CODE_TO_WHERE_USED[code] ?? null, notes: null, sort_order: 100 }]);
  }
  function updateHardware(idx: number, patch: Partial<HardwareRowS>) {
    setHardware((all) => {
      const fgRows = fgHardware;
      const target = fgRows[idx];
      if (!target) return all;
      const others = all.filter((h) => h.finish_group_id !== activeFgId);
      const updated = fgRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return [...others, ...updated];
    });
  }
  function addCountertop() {
    setCountertops((all) => [...all, {
      finish_group_id: activeFgId, location: null, style_id: null, edge_id: null,
      splash_style: null, splash_edge_id: null, material_id: null,
      buildup_in: null, core_substrate: null, brackets: null, notes: null,
      sort_order: fgCountertops.length,
    }]);
  }
  function updateCountertop(idx: number, patch: Partial<CountertopRow>) {
    setCountertops((all) => {
      const fgRows = fgCountertops;
      const target = fgRows[idx];
      if (!target) return all;
      const others = all.filter((c) => c.finish_group_id !== activeFgId);
      const updated = fgRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return [...others, ...updated];
    });
  }
  function removeCountertop(idx: number) {
    setCountertops((all) => {
      const fgRows = fgCountertops;
      const others = all.filter((c) => c.finish_group_id !== activeFgId);
      return [...others, ...fgRows.filter((_, i) => i !== idx)];
    });
  }
  function updateFinish(patch: Partial<FinishUpdateRow>) {
    setFinishUpdates((all) => all.map((u) => u.finish_group_id === activeFgId ? { ...u, ...patch } : u));
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaveState("saving");
    setWarnings([]);
    try {
      const res = await fetch(`/api/specs/${specId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finish_updates: finishUpdates.map((u) => ({
            finish_group_id: u.finish_group_id,
            stain_id: u.stain_id, paint_id: u.paint_id, glaze_id: u.glaze_id,
            topcoat_id: u.topcoat_id, sheen_id: u.sheen_id, notes: u.notes,
          })),
          materials, door_fronts: doorFronts, drawers, edgebands, hardware, countertops,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveState("error");
        setWarnings([body.error ?? "Save failed"]);
        return;
      }
      setSaveState("saved");
      setWarnings(body.warnings ?? []);
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setWarnings([(e as Error).message]);
    }
  }, [specId, finishUpdates, materials, doorFronts, drawers, edgebands, hardware, countertops]);

  // 2026-05-06 — register save with parent so the page-level "Save All" button
  // in ResidentialSpecClient can fire this panel's save without the user
  // remembering to press the in-tab Save button. See SchedulesTabLoader props.
  useEffect(() => {
    onRegisterSave?.(save);
  }, [save, onRegisterSave]);

  if (!fg || !fgFinishUpdate) {
    return (
      <div className="text-white/60 text-sm p-4">
        No finish groups defined. Add one on the Finishes tab first, then return here to fill the schedules.
      </div>
    );
  }

  // Build catalog options for dropdowns
  const carcassOpts   = catalogs.carcassMaterials.map((c) => ({ id: c.id, name: c.name }));
  const drawerBoxOpts = catalogs.drawerBoxes.map((d) => ({ id: d.id, name: d.name }));
  const edgebandOpts  = catalogs.edgebands.map((e) => ({ id: e.id, name: e.product_name }));
  const doorStyleOpts = catalogs.doorStyles.map((d) => ({ id: d.id, name: d.name }));
  const doorMatOpts   = catalogs.doorMaterials.map((m) => ({ id: m.id, name: m.name }));
  const cbEdgeOpts    = catalogs.cabDoorEdgeDetails.map((e) => ({ id: e.id, name: e.name }));
  const cbInsideOpts  = catalogs.cabDoorInsideProfiles.map((i) => ({ id: i.id, name: i.id }));
  const cbPanelOpts   = catalogs.cabDoorPanels.map((p) => ({ id: p.id, name: p.id }));
  const drawerSlideOpts = catalogs.drawerSlides.map((s) => ({ id: s.id, name: s.name }));
  const sheenOpts     = catalogs.sheens.map((s) => ({ id: s.id, name: s.name }));
  const paintOpts     = catalogs.paintColors.map((p) => ({ id: p.id, name: p.name }));
  const stainOpts     = catalogs.stainColors.map((s) => ({ id: s.id, name: s.name }));
  const glazeOpts     = catalogs.glazes.map((g) => ({ id: g.id, name: g.name }));
  const topcoatOpts   = catalogs.topcoats.map((t) => ({ id: t.id, name: t.name }));
  const ctopStyleOpts = catalogs.countertopStyles.map((s) => ({ id: s.id, name: s.name }));
  const ctopEdgeOpts  = catalogs.countertopEdges.map((e) => ({ id: e.id, name: e.name }));
  const ctopMatOpts   = catalogs.countertopMaterials.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-4">
      {/* Finish-group switcher */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {finishGroups.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveFgId(g.id)}
            className={`px-3 py-1.5 text-xs rounded transition ${
              g.id === activeFgId
                ? "bg-[#f08122] text-black font-semibold"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between bg-[#0a0a0a] border border-white/10 rounded p-2">
        <div className="text-xs text-white/60">
          Editing schedules for: <span className="text-[#f08122] font-semibold">{fg.label}</span>
          {" · "}<span className="text-white/40">{fg.finish_type}</span>
        </div>
        <div className="flex items-center gap-3">
          {warnings.length > 0 && (
            <div className="text-[11px] text-yellow-400">⚠ {warnings.length} warning(s) — see below</div>
          )}
          {saveState === "saved" && <div className="text-[11px] text-green-400">✓ saved</div>}
          {saveState === "error" && <div className="text-[11px] text-red-400">✗ error</div>}
          <button onClick={save} disabled={saveState === "saving"}
            className="px-3 py-1.5 text-xs rounded bg-[#f08122] text-black font-semibold hover:bg-[#d96f12] disabled:opacity-50">
            {saveState === "saving" ? "Saving…" : "Save Schedules"}
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded p-2 text-[11px] text-yellow-300">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Materials */}
      <div className={CARD}>
        <div className={SECTION_HDR}>Material Schedule</div>
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest text-white/40 mb-1.5 px-1">
          <div className="col-span-2">Slot</div>
          <div className="col-span-4">Material</div>
          <div className="col-span-3">Where Used</div>
          <div className="col-span-3">Notes</div>
        </div>
        {fgMaterials.map((m) => {
          const rolemeta = MATERIAL_ROLES.find((r) => r.role === m.role);
          const ext2warn = (m.role === "cab_ext2" || m.role === "cab_int2") && m.material_id && !m.where_used;
          return (
            <div key={m.role} className={`grid grid-cols-12 gap-2 items-center mb-1.5 px-1 py-1 rounded ${ext2warn ? "bg-yellow-900/20" : ""}`}>
              <div className="col-span-2 text-xs text-white/80">
                {rolemeta?.label}{rolemeta?.required && <span className="text-[#f08122]"> *</span>}
              </div>
              <div className="col-span-4">
                <CatalogSelect value={m.material_id} onChange={(v) => updateMaterial(m.role, { material_id: v })}
                  options={carcassOpts} required={rolemeta?.required} />
              </div>
              <div className="col-span-3">
                <input className={INPUT} value={m.where_used ?? ""} onChange={(e) => updateMaterial(m.role, { where_used: e.target.value || null })}
                  placeholder={(m.role === "cab_ext2" || m.role === "cab_int2") ? "Required when filled (e.g. 'Island only')" : "—"} />
              </div>
              <div className="col-span-3">
                <input className={INPUT} value={m.notes ?? ""} onChange={(e) => updateMaterial(m.role, { notes: e.target.value || null })} placeholder="—" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Door Schedule */}
      <div className={CARD}>
        <div className={SECTION_HDR}>Door Schedule</div>
        <div className="grid grid-cols-14 gap-2 text-[10px] uppercase tracking-widest text-white/40 mb-1.5 px-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Style</div>
          <div className="col-span-2">Material</div>
          <div className="col-span-2">OE</div>
          <div className="col-span-1">IE</div>
          <div className="col-span-1">Panel</div>
          <div className="col-span-1">Grain</div>
          <div className="col-span-2">Vendor</div>
          <div className="col-span-1">Notes</div>
        </div>
        {fgDoorFronts.map((d, idx) => {
          const rolemeta = DOOR_FRONT_ROLES.find((r) => r.role === d.role);
          return (
            <div key={`${d.role}-${idx}`} className="grid gap-2 items-center mb-1.5 px-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
              <div className="col-span-2 text-xs text-white/80">{rolemeta?.label ?? d.role}</div>
              <div className="col-span-2"><CatalogSelect value={d.style_id} onChange={(v) => updateDoorFront(idx, { style_id: v })} options={doorStyleOpts} /></div>
              <div className="col-span-2"><CatalogSelect value={d.material_id} onChange={(v) => updateDoorFront(idx, { material_id: v })} options={doorMatOpts} /></div>
              <div className="col-span-2"><CatalogSelect value={d.oe_id} onChange={(v) => updateDoorFront(idx, { oe_id: v })} options={cbEdgeOpts} /></div>
              <div className="col-span-1"><CatalogSelect value={d.ie_id} onChange={(v) => updateDoorFront(idx, { ie_id: v })} options={cbInsideOpts} /></div>
              <div className="col-span-1"><CatalogSelect value={d.panel_id} onChange={(v) => updateDoorFront(idx, { panel_id: v })} options={cbPanelOpts} /></div>
              <div className="col-span-1">
                <select className={SELECT} value={d.grain ?? ""} onChange={(e) => updateDoorFront(idx, { grain: e.target.value || null })}>
                  {GRAIN_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div className="col-span-2"><input className={INPUT} value={d.vendor ?? ""} onChange={(e) => updateDoorFront(idx, { vendor: e.target.value || null })} placeholder="Cab Door" /></div>
              <div className="col-span-1"><input className={INPUT} value={d.notes ?? ""} onChange={(e) => updateDoorFront(idx, { notes: e.target.value || null })} placeholder="—" /></div>
            </div>
          );
        })}
      </div>

      {/* Drawer Schedule */}
      <div className={CARD}>
        <div className={SECTION_HDR}>Drawer Schedule</div>
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest text-white/40 mb-1.5 px-1">
          <div className="col-span-2">Role</div>
          <div className="col-span-4">Box / Style</div>
          <div className="col-span-3">Slides</div>
          <div className="col-span-3">Notes</div>
        </div>
        {fgDrawers.map((d, idx) => {
          const rolemeta = DRAWER_ROLES.find((r) => r.role === d.role);
          return (
            <div key={`${d.role}-${idx}`} className="grid grid-cols-12 gap-2 items-center mb-1.5 px-1">
              <div className="col-span-2 text-xs text-white/80">{rolemeta?.label}</div>
              <div className="col-span-4"><CatalogSelect value={d.drawer_box_id} onChange={(v) => updateDrawer(idx, { drawer_box_id: v })} options={drawerBoxOpts} /></div>
              <div className="col-span-3"><CatalogSelect value={d.slides_id} onChange={(v) => updateDrawer(idx, { slides_id: v })} options={drawerSlideOpts} /></div>
              <div className="col-span-3"><input className={INPUT} value={d.notes ?? ""} onChange={(e) => updateDrawer(idx, { notes: e.target.value || null })} placeholder="—" /></div>
            </div>
          );
        })}
      </div>

      {/* Edgeband Schedule */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#f08122]">Edgeband Schedule</div>
          <button onClick={() => {
            const next = prompt("New edgeband code (e.g. Y, Z, AA):");
            if (next && next.trim()) addEdgebandCode(next.trim().toUpperCase());
          }} className="text-[10px] text-white/60 hover:text-white">+ Add Code</button>
        </div>
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest text-white/40 mb-1.5 px-1">
          <div className="col-span-1">Code</div>
          <div className="col-span-4">Edgeband</div>
          <div className="col-span-4">Where Used</div>
          <div className="col-span-3">Notes</div>
        </div>
        {fgEdgebands.map((e, idx) => (
          <div key={`${e.code}-${idx}`} className="grid grid-cols-12 gap-2 items-center mb-1.5 px-1">
            <div className="col-span-1 text-xs font-bold text-[#f08122]">{e.code}</div>
            <div className="col-span-4"><CatalogSelect value={e.edgeband_id} onChange={(v) => updateEdgeband(idx, { edgeband_id: v })} options={edgebandOpts} /></div>
            <div className="col-span-4">
              <select className={SELECT} value={e.where_used ?? ""} onChange={(ev) => updateEdgeband(idx, { where_used: ev.target.value || null })}>
                <option value="">— select —</option>
                {EDGEBAND_WHERE_USED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-3"><input className={INPUT} value={e.notes ?? ""} onChange={(ev) => updateEdgeband(idx, { notes: ev.target.value || null })} placeholder="—" /></div>
          </div>
        ))}
      </div>

      {/* Hardware Schedule */}
      <div className={CARD}>
        <div className={SECTION_HDR}>Hardware Schedule</div>
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest text-white/40 mb-1.5 px-1">
          <div className="col-span-2">Role</div>
          <div className="col-span-3">Hardware</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2">Location</div>
          <div className="col-span-2">Vendor</div>
          <div className="col-span-2">Notes</div>
        </div>
        {fgHardware.map((h, idx) => {
          const rolemeta = HARDWARE_ROLES.find((r) => r.role === h.role);
          const cat = catalogs.hardwareByRole[h.role] ?? [];
          const opts = cat.map((c) => ({ id: c.id, name: String(c.name ?? c.id) }));
          const isMandatory = rolemeta?.required;
          return (
            <div key={`${h.role}-${idx}`} className={`grid grid-cols-12 gap-2 items-center mb-1.5 px-1 ${isMandatory ? "" : "opacity-70"}`}>
              <div className="col-span-2 text-xs text-white/80">
                {rolemeta?.label ?? h.role}{isMandatory && <span className="text-[#f08122]"> *</span>}
              </div>
              <div className="col-span-3"><CatalogSelect value={h.hardware_id} onChange={(v) => updateHardware(idx, { hardware_id: v })} options={opts} required={isMandatory} /></div>
              <div className="col-span-1"><input type="number" className={INPUT} value={h.qty ?? ""} onChange={(e) => updateHardware(idx, { qty: e.target.value === "" ? null : Number(e.target.value) })} placeholder="—" /></div>
              <div className="col-span-2"><input className={INPUT} value={h.location ?? ""} onChange={(e) => updateHardware(idx, { location: e.target.value || null })} placeholder="—" /></div>
              <div className="col-span-2"><input className={INPUT} value={h.vendor ?? ""} onChange={(e) => updateHardware(idx, { vendor: e.target.value || null })} placeholder="—" /></div>
              <div className="col-span-2"><input className={INPUT} value={h.notes ?? ""} onChange={(e) => updateHardware(idx, { notes: e.target.value || null })} placeholder="—" /></div>
            </div>
          );
        })}
      </div>

      {/* Finish */}
      <div className={CARD}>
        <div className={SECTION_HDR}>Finish</div>
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className={LABEL}>Stain {fg.finish_type === "stain" && <span className="text-[#f08122]">*</span>}</label>
            <CatalogSelect value={fgFinishUpdate.stain_id} onChange={(v) => updateFinish({ stain_id: v })} options={stainOpts} />
          </div>
          <div>
            <label className={LABEL}>Paint {fg.finish_type === "paint" && <span className="text-[#f08122]">*</span>}</label>
            <CatalogSelect value={fgFinishUpdate.paint_id} onChange={(v) => updateFinish({ paint_id: v })} options={paintOpts} />
          </div>
          <div>
            <label className={LABEL}>Glaze</label>
            <CatalogSelect value={fgFinishUpdate.glaze_id} onChange={(v) => updateFinish({ glaze_id: v })} options={glazeOpts} />
          </div>
          <div>
            <label className={LABEL}>Topcoat</label>
            <CatalogSelect value={fgFinishUpdate.topcoat_id} onChange={(v) => updateFinish({ topcoat_id: v })} options={topcoatOpts} />
          </div>
          <div>
            <label className={LABEL}>Sheen</label>
            <CatalogSelect value={fgFinishUpdate.sheen_id} onChange={(v) => updateFinish({ sheen_id: v })} options={sheenOpts} />
          </div>
        </div>
      </div>

      {/* Countertops */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#f08122]">Countertops</div>
          <button onClick={addCountertop} className="text-[10px] text-white/60 hover:text-white">+ Add Counter</button>
        </div>
        {fgCountertops.length === 0 ? (
          <div className="text-[11px] italic text-white/40 px-1">No countertops in this finish group.</div>
        ) : fgCountertops.map((c, idx) => (
          <div key={idx} className="bg-[#0a0a0a] rounded p-2 mb-2 border border-white/5">
            <div className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-3">
                <label className={LABEL}>Location</label>
                <input className={INPUT} value={c.location ?? ""} onChange={(e) => updateCountertop(idx, { location: e.target.value || null })} placeholder="Island, Perimeter, Bar" />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Style</label>
                <CatalogSelect value={c.style_id} onChange={(v) => updateCountertop(idx, { style_id: v })} options={ctopStyleOpts} />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Edge</label>
                <CatalogSelect value={c.edge_id} onChange={(v) => updateCountertop(idx, { edge_id: v })} options={ctopEdgeOpts} />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Splash</label>
                <input className={INPUT} value={c.splash_style ?? ""} onChange={(e) => updateCountertop(idx, { splash_style: e.target.value || null })} placeholder="4in / Full / None" />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Splash Edge</label>
                <CatalogSelect value={c.splash_edge_id} onChange={(v) => updateCountertop(idx, { splash_edge_id: v })} options={ctopEdgeOpts} />
              </div>
              <div className="col-span-1 flex items-end justify-end">
                <button onClick={() => removeCountertop(idx)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3">
                <label className={LABEL}>Material</label>
                <CatalogSelect value={c.material_id} onChange={(v) => updateCountertop(idx, { material_id: v })} options={ctopMatOpts} />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Buildup (in)</label>
                <input type="number" step="0.25" className={INPUT} value={c.buildup_in ?? ""} onChange={(e) => updateCountertop(idx, { buildup_in: e.target.value === "" ? null : Number(e.target.value) })} placeholder="1.5" />
              </div>
              <div className="col-span-3">
                <label className={LABEL}>Core Substrate</label>
                <input className={INPUT} value={c.core_substrate ?? ""} onChange={(e) => updateCountertop(idx, { core_substrate: e.target.value || null })} placeholder="Plywood / MDF / None" />
              </div>
              <div className="col-span-4">
                <label className={LABEL}>Brackets</label>
                <input className={INPUT} value={c.brackets ?? ""} onChange={(e) => updateCountertop(idx, { brackets: e.target.value || null })} placeholder="qty / style" />
              </div>
              <div className="col-span-12">
                <label className={LABEL}>Notes</label>
                <input className={INPUT} value={c.notes ?? ""} onChange={(e) => updateCountertop(idx, { notes: e.target.value || null })} placeholder="Optional…" />
              </div>
            </div>
          </div>
        ))}
        <button onClick={addCountertop} className="text-xs text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest transition-colors">+ Add Countertop</button>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-4 border-t border-white/10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-6 py-2.5 rounded transition-colors"
        >
          {saving ? "Saving…" : "Save Schedules"}
        </button>
      </div>
      {saveError && <p className="text-red-400 text-xs mt-2 text-right">{saveError}</p>}
    </div>
  );
}
