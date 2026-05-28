"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  PaintColor, StainColor, MelamineColor, DoorStyle, HardwarePull, RevaAccessory,
  CabinetFamily, CarcassMaterial, DrawerBox, Edgeband, Room as RoomCatalogEntry,
  MoldingType, MoldingProfile, MoldingMaterial,
} from "@/lib/catalogs";
import { MoldingsTab, type FinishMolding } from "@/components/MoldingsTab";
import { CabinetsDrawingsView } from "@/components/CabinetsDrawingsView";
import { LifecyclePanel } from "@/components/LifecyclePanel";
import { SchedulesTabLoader } from "@/components/SchedulesTabLoader";
import { MaterialsSubsection, type FinishMaterial } from "@/components/MaterialsSubsection";
import { AccessoriesTab, type AccessoriesData } from "@/components/AccessoriesTab";

type CatalogData = {
  paintColors: PaintColor[]; stainColors: StainColor[]; melamineColors: MelamineColor[];
  doorStyles: DoorStyle[]; hardwarePulls: HardwarePull[]; revaAccessories: RevaAccessory[];
  cabinetFamilies: CabinetFamily[];
  carcassMaterials: CarcassMaterial[];
  drawerBoxes: DrawerBox[];
  edgebands: Edgeband[];
  rooms: RoomCatalogEntry[];
  moldingTypes: MoldingType[];
  moldingProfiles: MoldingProfile[];
  moldingMaterials: MoldingMaterial[];   // 2026-05-06 — sourced for MoldingsTab dropdown
};

type FinishType = "paint" | "stain" | "melamine";

export type FinishGroup = {
  id: string; label: string; finish_type: FinishType;
  color_id: string; color_name: string; door_style_id: string;
  pull_id: string; box_material: "melamine" | "plywood";
  carcass_id: string;
  drawer_box_id: string;
  edgeband_id: string;
  applied_panels: "slab" | "match_door";
  notes: string; sort_order: number;
};

export type CabinetItem = {
  id: string; family_code: string;
  width_in: number | null; height_in: number | null; depth_in: number | null;
  qty: number; hinge_side: string; rollout_trays_qty: number;
  trash_kit: string; applied_panels: boolean;
  special_instructions: string; sort_order: number;
};

export type RoomFinishLink = {
  finish_group_id: string;
  zone: string;
  sort_order: number;
};

export type Room = {
  id: string; name: string;
  finish_group_id: string;
  finishes: RoomFinishLink[];
  notes: string; sort_order: number;
  accessories: { acc_id: string; qty: number }[];
  cabinets: CabinetItem[];
};

type Props = {
  specId: string; jobId: string;
  initialFinishGroups: FinishGroup[];
  initialRooms: Room[];
  initialMoldings: FinishMolding[];
  initialMaterials: FinishMaterial[];   // v2 spec-form expansion (2026-05-06)
  initialAccessories: AccessoriesData;  // pulls + RevAShelf items (2026-05-28)
  catalogs: CatalogData;
  lastSaved: string;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

function uid() { return Math.random().toString(36).slice(2, 10); }

type Violation = { tag: string; field: string };

function validateForSave(groups: FinishGroup[], rooms: Room[]): Violation[] {
  const v: Violation[] = [];
  for (const g of groups) {
    const tag = g.label || "(unnamed finish)";
    if (!g.label?.trim())   v.push({ tag, field: "Group Label" });
    // 2026-05-06: legacy Color / Door Style / Hardware Pull requirements RELAXED.
    // These three legacy columns are deprecated. The v2 Schedules tab now carries
    // the canon data (stain/paint/glaze/topcoat/sheen on finish_groups; door style
    // on finish_group_door_fronts; pulls on finish_group_hardware). Forcing the
    // legacy fields blocked the v2-only workflow — PMs filled the form correctly
    // and got "Color is required" with no way to satisfy. The API validate()
    // function in app/api/specs/[id]/save/route.ts mirrors this same relaxation.
    // The $70k canary (carcass / drawer / edgeband) stays REQUIRED below.
    if (!g.carcass_id)      v.push({ tag, field: "Carcass Material" });
    if (!g.drawer_box_id)   v.push({ tag, field: "Drawer Box" });
    if ((g.finish_type === "paint" || g.finish_type === "stain") && !g.edgeband_id) {
      v.push({ tag, field: "Edgeband (paint/stain)" });
    }
  }
  for (const r of rooms) {
    const tag = `Room: ${r.name || "(unnamed)"}`;
    if (!r.name?.trim()) v.push({ tag, field: "Room Name" });
    const validFinishes = (r.finishes ?? []).filter((f) => f.finish_group_id);
    if (validFinishes.length === 0 && !r.finish_group_id) {
      v.push({ tag, field: "At least one finish must be assigned" });
    }
    for (const c of r.cabinets ?? []) {
      if (!c.family_code) v.push({ tag, field: `Cabinet family in ${tag}` });
    }
  }
  return v;
}

// ── ColorPicker ────────────────────────────────────────────────────────────
// Brand/supplier filter pills + code-or-name text search. Works for:
//   paint   → brand: SW | BM | ML | Custom
//   stain   → brand: ACC | ML | Custom
//   melamine → supplier: Stevenswood | TruNorth | Egger | Tafisa | Custom
type CPEntry = { id: string; brand: string; code: string; name: string; hex?: string | null };

function ColorPicker({
  type, value, catalogs, onChange,
}: {
  type: FinishType;
  value: string;
  catalogs: Props["catalogs"];
  onChange: (id: string, label: string) => void;
}) {
  const [filterBrand, setFilterBrand] = useState("");
  const [search, setSearch] = useState("");

  const all: CPEntry[] = useMemo(() => {
    if (type === "paint") {
      return catalogs.paintColors
        .filter((c) => !c.placeholder)
        .map((c) => ({ id: c.id, brand: c.brand, code: c.code ?? "", name: c.name, hex: c.hex_approx }));
    }
    if (type === "stain") {
      return catalogs.stainColors
        .filter((c) => !c.placeholder)
        .map((c) => ({ id: c.id, brand: c.brand, code: c.code && c.code !== "—" ? c.code : "", name: c.name }));
    }
    return catalogs.melamineColors
      .filter((c) => !c.placeholder)
      .map((c) => ({ id: c.id, brand: c.supplier, code: c.code && c.code !== "—" ? c.code : "", name: c.name, hex: c.hex_approx }));
  }, [type, catalogs]);

  const brands = useMemo(() => [...new Set(all.map((c) => c.brand))].sort(), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (filterBrand && c.brand !== filterBrand) return false;
      if (q) return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      return true;
    });
  }, [all, filterBrand, search]);

  const selected = all.find((c) => c.id === value);
  const isCustom = value === "PNT-CUSTOM" || value === "STN-CUSTOM" || value === "MEL-CUSTOM";

  function makeLabel(c: CPEntry) {
    return `${c.code ? c.code + " · " : ""}${c.name} — ${c.brand}`;
  }

  return (
    <div className="space-y-2">
      {/* Brand / supplier filter pills */}
      <div className="flex gap-1 flex-wrap">
        <button type="button" onClick={() => setFilterBrand("")}
          className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === "" ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
        >All</button>
        {brands.map((b) => (
          <button key={b} type="button" onClick={() => setFilterBrand(filterBrand === b ? "" : b)}
            className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === b ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
          >{b}</button>
        ))}
      </div>
      {/* Code search + dropdown */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Code # or name…"
          className="w-32 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors font-mono"
        />
        <select
          value={value}
          onChange={(e) => {
            const c = all.find((x) => x.id === e.target.value);
            onChange(e.target.value, c ? makeLabel(c) : "");
          }}
          className="flex-1 bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors min-w-0"
        >
          <option value="">-- Select Color --</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>{c.code ? `${c.code}  ` : ""}{c.name}</option>
          ))}
        </select>
        {selected?.hex && !isCustom && (
          <span className="w-6 h-6 rounded-full shrink-0 border border-white/20" style={{ background: selected.hex }} />
        )}
      </div>
      {/* Free-text for Custom Match */}
      {isCustom && (
        <input
          type="text"
          placeholder="Type brand + code + name  (e.g. SW 7757 High Reflective White)"
          onChange={(e) => onChange(value, e.target.value || "Other / Custom Match")}
          className="w-full bg-[#1a1a1a] border border-[#f08122]/40 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors"
        />
      )}
      {selected && !isCustom && (
        <p className="text-white/30 text-[11px] font-condensed">
          ✓ {selected.brand}  {selected.code}  ·  {selected.name}
        </p>
      )}
    </div>
  );
}

export function ResidentialSpecClient({ specId, jobId, initialFinishGroups, initialRooms, initialMoldings, initialMaterials, initialAccessories, catalogs, lastSaved }: Props) {
  const [tab, setTab]       = useState<"finishes" | "rooms" | "cabinets" | "moldings" | "schedules" | "accessories" | "summary">("finishes");
  const [groups, setGroups] = useState<FinishGroup[]>(initialFinishGroups);
  const [rooms, setRooms]   = useState<Room[]>(initialRooms);
  const [moldings, setMoldings] = useState<FinishMolding[]>(initialMoldings);
  const [materials, setMaterials] = useState<FinishMaterial[]>(initialMaterials);
  const [dirty, setDirty]   = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState(lastSaved);
  const [showViolations, setShowViolations] = useState(false);
  const [genState, setGenState] = useState<"idle" | "generating" | "done" | "error">("idle");

  function markDirty() { setDirty(true); setSaveState("idle"); }

  // 2026-05-06 — "Save All" coordinator. The Schedules tab (SpecSchedulesPanel)
  // owns its own save state and POSTs to /api/specs/[id]/schedules. The legacy
  // save() above POSTs to /api/specs/[id]/save. Two endpoints, two state trees.
  // SchedulesTabLoader → SpecSchedulesPanel registers its save fn into this ref
  // on mount; saveAll() then fires both with one click. Matches Karl's
  // "10-year-old can drive it" standard — one button, both writes.
  const schedulesSaveRef = useRef<(() => Promise<void>) | null>(null);
  const [saveAllState, setSaveAllState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // violations and save must be declared BEFORE saveAll (which lists save as a dep)
  // to avoid a TDZ crash on render.
  const violations = useMemo(() => validateForSave(groups, rooms), [groups, rooms]);

  const save = useCallback(async (archive?: string): Promise<boolean> => {
    if (violations.length > 0) {
      setShowViolations(true);
      return false;
    }
    setSaveState("saving");
    try {
      const roomsForSave = rooms.map((r) => {
        const firstFinishId = (r.finishes ?? []).find((f) => f.finish_group_id)?.finish_group_id ?? r.finish_group_id ?? "";
        return { ...r, finish_group_id: firstFinishId };
      });
      const res = await fetch(`/api/specs/${specId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finish_groups: groups, rooms: roomsForSave, moldings, materials }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Save failed:", body);
        setSaveState("error");
        return false;
      }
      if (archive !== undefined) {
        await fetch(`/api/specs/${specId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: archive }),
        });
      }
      setDirty(false);
      setSaveState("saved");
      setSavedAt(new Date().toISOString());
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [specId, groups, rooms, moldings, materials, violations.length]);

  const saveAll = useCallback(async () => {
    setSaveAllState("saving");
    try {
      const okLegacy = await save();
      if (!okLegacy) {
        setSaveAllState("error");
        return;
      }
      // Schedules ref is null until the user has visited the Schedules tab at
      // least once (lazy mount). Skipping the call when null is correct — the
      // user can't have unsaved schedules edits if the panel never mounted.
      if (schedulesSaveRef.current) {
        await schedulesSaveRef.current();
      }
      setSaveAllState("saved");
      setTimeout(() => setSaveAllState("idle"), 2000);
    } catch {
      setSaveAllState("error");
    }
  }, [save]);

  // Dual-UI sync (2026-05-06): the Schedules · v2 tab and the inline Materials
  // sub-section both write to finish_group_materials via different endpoints.
  // When the user leaves the Schedules tab (where SpecSchedulesPanel may have
  // saved fresh data via /api/specs/[id]/schedules), we refetch materials so
  // the inline state isn't stale — otherwise the next main "Save" would post
  // stale inline state and silently overwrite the Schedules-tab edits ($70k
  // pattern). Tracking previous tab via useRef avoids triggering on the
  // initial mount, and we only refetch when leaving 'schedules' specifically.
  const prevTab = useRef(tab);
  useEffect(() => {
    const wasSchedules = prevTab.current === "schedules";
    prevTab.current = tab;
    if (!wasSchedules || tab === "schedules") return;
    // Don't clobber unsaved inline edits — only sync when client is clean.
    if (dirty) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/specs/${specId}/schedules-init`, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        const fresh = (body?.schedules?.materials ?? []) as Array<{
          id: string; finish_group_id: string; role: string;
          material_id: string | null; where_used: string | null; notes: string | null;
        }>;
        if (cancelled) return;
        setMaterials(fresh.map((m) => ({
          id: m.id,
          finish_group_id: m.finish_group_id,
          role: m.role as FinishMaterial["role"],
          material_id: m.material_id ?? "",
          where_used: m.where_used ?? "",
          notes: m.notes ?? "",
        })));
      } catch {
        // Network blip — keep stale state; next save risks overwrite, but
        // that's no worse than before this guard.
      }
    })();
    return () => { cancelled = true; };
  }, [tab, specId, dirty]);

  const generateSpec = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setGenState("generating");
    try {
      const res = await fetch(`/api/specs/${specId}/generate`, { method: "POST" });
      if (!res.ok) { setGenState("error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setGenState("done");
      // File was saved to job folder — show link if file_id came back
      const savedId = res.headers.get("X-File-Id");
      if (savedId) setContractFileId("");  // don't clobber a contract link
    } catch {
      setGenState("error");
    }
  }, [specId, dirty, violations.length, save]);

  const [combineState, setCombineState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [combineErr, setCombineErr] = useState<string>("");
  const [contractState, setContractState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [contractFileId, setContractFileId] = useState<string>("");
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  const generateCombined = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    // DAC #3: confirm the exact drawing filename we're about to merge before
    // actually combining. Out-of-order uploads can shadow the right drawing;
    // this gives the PM a chance to abort if the wrong filename is showing.
    setCombineState("working");
    setCombineErr("");
    try {
      // Look up latest drawing filename via the files endpoint (job-scoped).
      const filesRes = await fetch(`/api/jobs/${jobId}/files`, { cache: "no-store" });
      let latestName: string | null = null;
      if (filesRes.ok) {
        const body = await filesRes.json();
        const drawings = body.files?.drawings ?? [];
        latestName = drawings[0]?.filename ?? null;
      }
      if (!latestName) {
        setCombineErr("No drawings uploaded yet — go to the job page and upload kind=drawings first.");
        setCombineState("error");
        return;
      }
      const ok = window.confirm(`Combining spec with drawing:\n  ${latestName}\n\nIf this is the wrong drawing, click Cancel and upload the correct one as kind=drawings on the job page first.`);
      if (!ok) {
        setCombineState("idle");
        return;
      }
      const res = await fetch(`/api/specs/${specId}/combine`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCombineErr(body.error ?? `Combine failed (${res.status})`);
        setCombineState("error");
        return;
      }
      setCombineState("done");
      if (body.url) window.open(body.url, "_blank");
    } catch {
      setCombineState("error");
      setCombineErr("Combine failed");
    }
  }, [specId, dirty, violations.length, save]);

  const [excelState, setExcelState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [excelErr, setExcelErr]   = useState<string>("");
  const generateExcel = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setExcelState("working"); setExcelErr("");
    try {
      const res = await fetch(`/api/specs/${specId}/excel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExcelErr(body.error ?? `Excel failed (${res.status})`);
        setExcelState("error");
        return;
      }
      setExcelState("done");
      if (body.url) window.open(body.url, "_blank");
    } catch {
      setExcelState("error"); setExcelErr("Excel failed");
    }
  }, [specId, dirty, violations.length, save]);

  // ── Finish Groups ─────────────────────────────────────────────────────────
  function addGroup() {
    const idx = groups.length + 1;
    setGroups([...groups, {
      id: uid(),
      label: `FG-${String(idx).padStart(2, "0")}`,
      finish_type: "paint",
      color_id: "", color_name: "",
      door_style_id: "", pull_id: "",
      box_material: "melamine",
      carcass_id: "", drawer_box_id: "", edgeband_id: "",
      applied_panels: "slab",
      notes: "",
      sort_order: idx,
    }]);
    markDirty();
  }
  function updateGroup(id: string, patch: Partial<FinishGroup>) {
    setGroups(groups.map((g) => g.id === id ? { ...g, ...patch } : g));
    markDirty();
  }
  function removeGroup(id: string) {
    setGroups(groups.filter((g) => g.id !== id));
    setRooms(rooms.map((r) => ({
      ...r,
      finish_group_id: r.finish_group_id === id ? "" : r.finish_group_id,
      finishes: (r.finishes ?? []).filter((f) => f.finish_group_id !== id),
    })));
    setMoldings(moldings.filter((m) => m.finish_group_id !== id));
    setMaterials(materials.filter((m) => m.finish_group_id !== id));
    markDirty();
  }

  // Material sub-section (v2): upsert by (finish_group_id, role). The DB has
  // UNIQUE(finish_group_id, role), so each pair is at most one row. We keep
  // the same invariant in client state.
  function upsertMaterial(finish_group_id: string, role: FinishMaterial["role"], patch: Partial<FinishMaterial>) {
    setMaterials((prev) => {
      const idx = prev.findIndex((m) => m.finish_group_id === finish_group_id && m.role === role);
      if (idx === -1) {
        return [...prev, {
          id: uid(),
          finish_group_id,
          role,
          material_id: "",
          where_used: "",
          notes: "",
          ...patch,
        }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    markDirty();
  }


  // Called from disclosure modal with user's choice
  const buildContract = useCallback(async (includeDisclosure: boolean) => {
    setShowDisclosureModal(false);
    setContractState("working");
    setContractFileId("");
    try {
      const res = await fetch(`/api/specs/${specId}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeDisclosure }),
      });
      const body = await res.json();
      if (!res.ok) {
        setContractState("error");
        return;
      }
      setContractState("done");
      setContractFileId(body.file_id ?? "");
      if (body.download_url) window.open(body.download_url, "_blank");
    } catch {
      setContractState("error");
    }
  }, [specId]);

  const generateContract = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    // Show disclosure modal before building
    setShowDisclosureModal(true);
  }, [specId, dirty, violations.length, save]);

  // ── Rooms ─────────────────────────────────────────────────────────────────
  function addRoom() {
    setRooms([...rooms, {
      id: uid(), name: "",
      finish_group_id: "", finishes: [],
      notes: "", sort_order: rooms.length + 1,
      accessories: [], cabinets: [],
    }]);
    markDirty();
  }
  function updateRoom(id: string, patch: Partial<Room>) {
    setRooms(rooms.map((r) => r.id === id ? { ...r, ...patch } : r));
    markDirty();
  }
  function removeRoom(id: string) {
    setRooms(rooms.filter((r) => r.id !== id));
    setMoldings(moldings.map((m) => ({ ...m, where_used_room_ids: m.where_used_room_ids.filter((x) => x !== id) })));
    markDirty();
  }
  function addRoomFinish(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r,
      finishes: [...(r.finishes ?? []), { finish_group_id: "", zone: "", sort_order: r.finishes?.length ?? 0 }],
    }));
    markDirty();
  }
  function updateRoomFinish(roomId: string, idx: number, patch: Partial<RoomFinishLink>) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const list = [...(r.finishes ?? [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...r, finishes: list };
    }));
    markDirty();
  }
  function removeRoomFinish(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r, finishes: (r.finishes ?? []).filter((_, i) => i !== idx),
    }));
    markDirty();
  }

  // ── Accessories ───────────────────────────────────────────────────────────
  function addAccessory(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, accessories: [...r.accessories, { acc_id: "", qty: 1 }] }));
    markDirty();
  }
  function updateAccessory(roomId: string, idx: number, patch: { acc_id?: string; qty?: number }) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const acc = [...r.accessories]; acc[idx] = { ...acc[idx], ...patch };
      return { ...r, accessories: acc };
    }));
    markDirty();
  }
  function removeAccessory(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, accessories: r.accessories.filter((_, i) => i !== idx) }));
    markDirty();
  }

  // ── Cabinets ──────────────────────────────────────────────────────────────
  function addCabinet(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r,
      cabinets: [...r.cabinets, {
        id: uid(), family_code: "", width_in: null, height_in: null, depth_in: null,
        qty: 1, hinge_side: "", rollout_trays_qty: 0, trash_kit: "None",
        applied_panels: false, special_instructions: "", sort_order: r.cabinets.length,
      }],
    }));
    markDirty();
  }
  function updateCabinet(roomId: string, idx: number, patch: Partial<CabinetItem>) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const cabs = [...r.cabinets]; cabs[idx] = { ...cabs[idx], ...patch };
      return { ...r, cabinets: cabs };
    }));
    markDirty();
  }
  function removeCabinet(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, cabinets: r.cabinets.filter((_, i) => i !== idx) }));
    markDirty();
  }

  // ── Moldings ──────────────────────────────────────────────────────────────
  function addMolding(finish_group_id: string) {
    setMoldings([...moldings, {
      id: uid(), finish_group_id,
      molding_type: "", molding_profile_id: "",
      qty_lf: null,
      // 2026-05-06 — size + material added; material_other is the free-entry
      // escape (filled when material_id == "MM-099"). See MoldingsTab.tsx.
      size_in: null, material_id: "", material_other: "",
      notes: "",
      where_used_room_ids: [],
      sort_order: moldings.filter((m) => m.finish_group_id === finish_group_id).length,
    }]);
    markDirty();
  }
  function updateMolding(id: string, patch: Partial<FinishMolding>) {
    setMoldings(moldings.map((m) => m.id === id ? { ...m, ...patch } : m));
    markDirty();
  }
  function removeMolding(id: string) {
    setMoldings(moldings.filter((m) => m.id !== id));
    markDirty();
  }

  // ── Toolbar labels ────────────────────────────────────────────────────────
  const saveLabel =
    saveState === "saving" ? "Saving..." :
    saveState === "saved"  ? "Saved" :
    saveState === "error"  ? "Error - retry" : "Save";
  const genLabel =
    genState === "generating" ? "Generating..." :
    genState === "error"      ? "Error - retry" : "Generate Spec";
  const canSave = dirty && saveState !== "saving" && violations.length === 0;
  const canGen  = violations.length === 0 && genState !== "generating";
  const blockedReason = violations.length > 0
    ? `Blocked - fix these first:\n${violations.map((v) => `- ${v.tag}: ${v.field}`).join("\n")}`
    : "";

  return (
    <div>
      {/* ── Residential Disclosure Modal ──────────────────────────────────── */}
      {showDisclosureModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md space-y-5">
            <div>
              <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">
                Build Contract
              </p>
              <p className="text-white font-condensed uppercase tracking-widest text-sm">
                Include Residential Disclosure?
              </p>
            </div>
            <p className="text-white/50 text-xs leading-relaxed">
              The Residential Disclosure Agreement covers the right of rescission, Idaho contractor
              license disclosure, lien rights notice, payment terms, and warranty scope. It should
              be included for all direct residential clients.
            </p>
            <p className="text-white/30 text-[11px]">
              The disclosure PDF must be uploaded to Supabase Storage at{" "}
              <span className="font-mono text-white/50">templates/residential-disclosure.pdf</span>.
              If it hasn&apos;t been uploaded yet, the contract will be built without it.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => buildContract(true)}
                className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                Yes — Include Disclosure
              </button>
              <button
                onClick={() => buildContract(false)}
                className="bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                No — Skip
              </button>
              <button
                onClick={() => setShowDisclosureModal(false)}
                className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="room-name-suggestions">
        {catalogs.rooms.map((r) => <option key={r.id} value={r.name} />)}
      </datalist>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LifecyclePanel specId={specId} />
        <div className="text-white/25 text-xs font-condensed uppercase tracking-widest">
          {dirty ? "Unsaved changes" : `Saved ${new Date(savedAt).toLocaleString()}`}
        </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {violations.length > 0 && (
            <span
              className="text-[10px] font-condensed uppercase tracking-widest text-yellow-400/80 mr-2"
              title={blockedReason}
            >
              {violations.length} required field{violations.length === 1 ? "" : "s"} unfilled
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={saveAllState === "saving" || violations.length > 0}
            title={blockedReason || "Save spec + schedules in one click"}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              saveAllState === "saving" || violations.length > 0
                ? "bg-white/5 text-white/20 cursor-not-allowed"
                : "bg-[#f08122] hover:bg-[#d9711e] text-white"
            }`}
          >
            {saveAllState === "saving" ? "Saving..." :
             saveAllState === "saved"  ? "Saved" :
             saveAllState === "error"  ? "Error - retry" :
             "Save All"}
          </button>
          {/* Legacy "Save" — fires only the spec form, NOT the Schedules tab.
              Kept for the case where the user wants to save mid-edit without
              triggering a schedules POST. Save All above is the default. */}
          <button
            onClick={() => save()}
            disabled={!canSave}
            title={blockedReason || (dirty ? "Save spec only — does NOT save Schedules tab edits" : "Nothing to save")}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded border transition-colors ${
              canSave
                ? "border-white/20 hover:border-white/40 text-white/60 hover:text-white"
                : "border-white/5 text-white/15 cursor-not-allowed"
            }`}
          >
            {saveLabel} (spec only)
          </button>
          <button
            onClick={() => {
              if (violations.length > 0) { setShowViolations(true); return; }
              const label = prompt("Archive label (e.g. 'Sent to DocuSign', 'Pre-revision backup'):");
              if (label !== null) save(label);
            }}
            disabled={violations.length > 0}
            className={`border border-white/15 ${violations.length > 0 ? "text-white/15 cursor-not-allowed" : "hover:border-white/40 text-white/40 hover:text-white"} font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors`}
          >
            Archive Snapshot
          </button>
          <button
            onClick={generateSpec}
            disabled={!canGen}
            title={canGen ? "Save and generate the spec PDF (opens inline in a new tab)" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-[#f08122]"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {genLabel}
          </button>
          <button
            onClick={generateCombined}
            disabled={!canGen || combineState === "working"}
            title={canGen ? "Render spec + most-recent drawings into a single PDF" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && combineState !== "working"
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-white/30"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {combineState === "working" ? "Combining..." : combineState === "error" ? "Combine - retry" : "Spec + Drawings"}
          </button>
          {combineErr && <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest" title={combineErr}>{combineErr.length > 40 ? combineErr.slice(0,40) + "..." : combineErr}</span>}
          <button
            onClick={generateContract}
            disabled={!canGen || contractState === "working"}
            title={canGen ? "Merge spec + drawings + quote into one PDF, save to job folder, and email to PM" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && contractState !== "working"
                ? "bg-[#f08122] hover:bg-[#d9711e] text-white border border-[#f08122]"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {contractState === "working" ? "Building..." : contractState === "error" ? "Contract - retry" : contractState === "done" ? "✓ Contract Sent" : "Send Contract"}
          </button>
          {contractState === "done" && contractFileId && (
            <a
              href={`/api/jobs/${jobId}/files?file_id=${contractFileId}`}
              target="_blank"
              rel="noreferrer"
              className="text-green-400 text-[10px] font-condensed uppercase tracking-widest hover:text-green-300 transition-colors"
            >
              View in job folder →
            </a>
          )}
          <button
            onClick={generateExcel}
            disabled={!canGen || excelState === "working"}
            title={canGen ? "Render the Artifex spec template (.xlsx) and download" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && excelState !== "working"
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-white/30"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {excelState === "working" ? "Excel..." : excelState === "error" ? "Excel - retry" : "Excel"}
          </button>
          {excelErr && <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest" title={excelErr}>{excelErr.length > 40 ? excelErr.slice(0,40) + "..." : excelErr}</span>}
        </div>
      </div>

      {showViolations && violations.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 mb-6">
          <div className="flex items-start justify-between mb-2">
            <p className="text-yellow-300/80 text-xs font-condensed uppercase tracking-widest">
              Save blocked - required fields unfilled
            </p>
            <button onClick={() => setShowViolations(false)} className="text-yellow-300/40 hover:text-yellow-300 text-xs">x</button>
          </div>
          <ul className="space-y-1 text-yellow-100/80 text-xs">
            {violations.map((v, i) => (
              <li key={i}><span className="text-yellow-400/60">{v.tag}:</span> {v.field}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-8 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 sticky top-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-sm">
        {(["finishes", "rooms", "cabinets", "moldings", "schedules", "accessories", "summary"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`font-condensed uppercase tracking-widest text-xs py-3 px-3 sm:px-5 border-b-2 transition-colors ${
              tab === t ? "border-[#f08122] text-[#f08122]" : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {t === "finishes" ? `Finish Groups (${groups.length})`
              : t === "rooms" ? `Rooms (${rooms.length})`
              : t === "cabinets" ? `Cabinet Order (${rooms.reduce((n, r) => n + r.cabinets.length, 0)})`
              : t === "moldings" ? `Moldings (${moldings.length})`
              : t === "schedules" ? `Schedules · v2`
              : t === "accessories" ? "Accessories"
              : "Summary"}
          </button>
        ))}
      </div>

      {/* FINISH GROUPS */}
      {tab === "finishes" && (
        <div className="space-y-6">
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            Each group defines one finish + door + pull + carcass + drawer box. Every required dropdown must be picked before save.
          </p>
          {groups.map((g) => {
            const carcass = catalogs.carcassMaterials.find((c) => c.id === g.carcass_id);
            const drawerBox = catalogs.drawerBoxes.find((d) => d.id === g.drawer_box_id);
            const requiresEdgebandPick = g.finish_type === "paint" || g.finish_type === "stain";
            // Melamine edgeband auto-match: look up color name → edgeband.color_match
            const matchedEdgeband = g.finish_type === "melamine" && g.color_id
              ? (() => {
                  const mc = catalogs.melamineColors.find((c) => c.id === g.color_id);
                  return mc ? catalogs.edgebands.find((e) => e.color_match === mc.name && !e.placeholder) : undefined;
                })()
              : undefined;
            const edgebandOptions = catalogs.edgebands.filter((e) => {
              // sync-catalogs.mjs auto-arrays semicolon-separated values, so the
              // runtime is sometimes string and sometimes string[]. Handle both.
              const cft = e.compatible_finish_type;
              if (!cft || cft === "all") return true;
              const types = Array.isArray(cft) ? cft : String(cft).split(";");
              return types.includes(g.finish_type);
            });

            return (
              <div key={g.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[#f08122] font-condensed uppercase tracking-widest text-sm">{g.label}</span>
                  <button onClick={() => removeGroup(g.id)} className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Group Label *</label>
                    <input value={g.label} onChange={(e) => updateGroup(g.id, { label: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Finish Type *</label>
                    <select
                      value={g.finish_type}
                      onChange={(e) => {
                        const newType = e.target.value as FinishType;
                        const patch: Partial<FinishGroup> = { finish_type: newType, color_id: "", color_name: "", edgeband_id: "" };
                        // When switching to melamine, check if current door style is a slab;
                        // if not, clear it so the user must re-pick from the restricted list.
                        if (newType === "melamine" && g.door_style_id) {
                          const currentDoor = catalogs.doorStyles.find((d) => d.id === g.door_style_id);
                          if (currentDoor && currentDoor.construction !== "slab") {
                            patch.door_style_id = "";
                          }
                        }
                        updateGroup(g.id, patch);
                      }}
                      className={SELECT}
                    >
                      <option value="paint">Paint</option>
                      <option value="stain">Stain</option>
                      <option value="melamine">Melamine / TFL</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Color *</label>
                    <ColorPicker
                      type={g.finish_type}
                      value={g.color_id}
                      catalogs={catalogs}
                      onChange={(id, label) => {
                        const updates: Partial<FinishGroup> = { color_id: id, color_name: label };
                        // Auto-derive edgeband when a melamine color is picked
                        if (g.finish_type === "melamine" && id) {
                          const mc = catalogs.melamineColors.find((c) => c.id === id);
                          if (mc) {
                            const eb = catalogs.edgebands.find((e) => e.color_match === mc.name && !e.placeholder);
                            if (eb) updates.edgeband_id = eb.id;
                          }
                        }
                        updateGroup(g.id, updates);
                      }}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>
                      Door Style{" "}
                      <span className="text-white/30 normal-case font-normal">(set detail in Schedules tab)</span>
                      {g.finish_type === "melamine" && (
                        <span className="ml-1 text-[#f08122]/70 normal-case font-normal text-[10px]">— slab only</span>
                      )}
                    </label>
                    <select
                      value={g.door_style_id}
                      onChange={(e) => updateGroup(g.id, { door_style_id: e.target.value })}
                      className={SELECT}
                    >
                      <option value="">-- Select Door --</option>
                      {catalogs.doorStyles
                        .filter((d) => {
                          if (d.placeholder) return false;
                          if (g.finish_type === "melamine") return d.construction === "slab";
                          return true;
                        })
                        .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {g.finish_type === "melamine" && !g.door_style_id && (
                      <p className="text-yellow-400/70 text-[10px] mt-1 font-condensed uppercase tracking-widest">
                        Door style reset — melamine finish uses slab doors only.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Applied Panels</label>
                    <select
                      value={g.applied_panels ?? "slab"}
                      onChange={(e) => updateGroup(g.id, { applied_panels: e.target.value as "slab" | "match_door" })}
                      className={SELECT}
                    >
                      <option value="slab">Slab</option>
                      <option value="match_door">Match door style</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Hardware Pull <span className="text-white/30 normal-case font-normal">(set detail in Schedules tab)</span></label>
                    <select value={g.pull_id} onChange={(e) => updateGroup(g.id, { pull_id: e.target.value })} className={SELECT}>
                      <option value="">-- Select Pull --</option>
                      {catalogs.hardwarePulls.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.brand}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Notes</label>
                    <input value={g.notes} onChange={(e) => updateGroup(g.id, { notes: e.target.value })} placeholder="Sheen, custom mix, special instructions..." className={INPUT} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-white/5">
                  <div>
                    <label className={LABEL}>Carcass Material *</label>
                    <select value={g.carcass_id} onChange={(e) => updateGroup(g.id, { carcass_id: e.target.value })} className={SELECT}>
                      <option value="">-- Select Carcass --</option>
                      {catalogs.carcassMaterials.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {carcass?.is_other && (
                      <p className="text-yellow-400/60 text-[10px] mt-1 font-condensed uppercase tracking-widest">Specify in Notes</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Drawer Box *</label>
                    <select value={g.drawer_box_id} onChange={(e) => updateGroup(g.id, { drawer_box_id: e.target.value })} className={SELECT}>
                      <option value="">-- Select Drawer Box --</option>
                      {catalogs.drawerBoxes.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {drawerBox?.is_other && (
                      <p className="text-yellow-400/60 text-[10px] mt-1 font-condensed uppercase tracking-widest">Specify in Notes</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Edgeband {requiresEdgebandPick ? "*" : ""}</label>
                    {g.finish_type === "melamine" ? (
                      // Melamine: edgeband IS the carcass material — no separate pick needed.
                      // Store no edgeband_id (null). Display a read-only callout.
                      <div className={INPUT + " text-white/50 text-xs italic"}>
                        Matches carcass material
                      </div>
                    ) : (
                      // Paint / Stain: PM must pick an edgeband from the filtered list.
                      <select value={g.edgeband_id} onChange={(e) => updateGroup(g.id, { edgeband_id: e.target.value })} className={SELECT}>
                        <option value="">-- Select Edgeband --</option>
                        {edgebandOptions.map((e) => (
                          <option key={e.id} value={e.id}>{e.product_name} - {e.supplier}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Spec form expansion v2 (2026-05-06): Material sub-section.
                    First of 7 sub-sections. The legacy carcass_id dropdown
                    above stays for back-compat until all sub-sections ship
                    and the cleanup migration drops the legacy column. */}
                <MaterialsSubsection
                  finishGroupId={g.id}
                  finishGroupLabel={g.label}
                  materials={materials}
                  carcassMaterials={catalogs.carcassMaterials}
                  onUpsert={upsertMaterial}
                />
              </div>
            );
          })}
          <button onClick={addGroup} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors w-full">
            + Add Finish Group
          </button>
        </div>
      )}

      {/* ROOMS */}
      {tab === "rooms" && (
        <div className="space-y-6">
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            Define rooms. Each room can have multiple finishes - e.g. Kitchen Perimeter (MEL-1) + Kitchen Island (MEL-2). Add a zone label per finish if it&apos;s split.
          </p>
          {groups.length === 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 text-yellow-300/70 text-xs font-condensed uppercase tracking-widest">
              Define at least one finish group first.
            </div>
          )}
          {rooms.map((room) => (
            <div key={room.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-white/50 font-condensed uppercase tracking-widest text-xs">Room</span>
                <button onClick={() => removeRoom(room.id)} className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
              </div>
              <div>
                <label className={LABEL}>Room Name *</label>
                <input
                  list="room-name-suggestions"
                  value={room.name}
                  onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                  placeholder="Kitchen Perimeter, Master Bath Vanity, Kitchen Island..."
                  className={INPUT}
                />
                <p className="text-white/20 text-[10px] mt-1 font-condensed uppercase tracking-widest">
                  Type freely - suggestions appear as you go.
                </p>
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">
                  Finishes assigned to this room *
                </p>
                <div className="space-y-2">
                  {(room.finishes ?? []).map((f, fi) => (
                    <div key={fi} className="flex flex-wrap sm:flex-nowrap gap-2 items-stretch sm:items-center bg-[#1a1a1a] rounded p-2">
                      <select
                        value={f.finish_group_id}
                        onChange={(e) => updateRoomFinish(room.id, fi, { finish_group_id: e.target.value })}
                        className={SELECT + " flex-1"}
                      >
                        <option value="">-- Select Finish Group --</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label} - {g.color_name?.split(" - ")[0] || g.finish_type}
                          </option>
                        ))}
                      </select>
                      <input
                        value={f.zone}
                        onChange={(e) => updateRoomFinish(room.id, fi, { zone: e.target.value })}
                        placeholder="Zone (e.g. Perimeter, Island, Tall Panels)"
                        className={INPUT + " w-full sm:w-72"}
                      />
                      <button onClick={() => removeRoomFinish(room.id, fi)} className="text-white/20 hover:text-red-400 transition-colors px-1 shrink-0">x</button>
                    </div>
                  ))}
                  <button
                    onClick={() => addRoomFinish(room.id)}
                    className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors"
                  >
                    + Add Finish to Room
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">Rev-A-Shelf Accessories</p>
                <div className="space-y-2">
                  {room.accessories.map((acc, ai) => (
                    <div key={ai} className="flex flex-wrap sm:flex-nowrap gap-3 items-stretch sm:items-center">
                      <select value={acc.acc_id} onChange={(e) => updateAccessory(room.id, ai, { acc_id: e.target.value })} className={SELECT + " flex-1"}>
                        <option value="">-- Select Accessory --</option>
                        {catalogs.revaAccessories.map((a) => <option key={a.id} value={a.id}>{a.name} - {a.brand}</option>)}
                      </select>
                      <input type="number" min={1} value={acc.qty} onChange={(e) => updateAccessory(room.id, ai, { qty: parseInt(e.target.value) || 1 })}
                        className="w-16 bg-[#1a1a1a] border border-white/15 rounded px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-[#f08122]" />
                      <button onClick={() => removeAccessory(room.id, ai)} className="text-white/20 hover:text-red-400 transition-colors px-1">x</button>
                    </div>
                  ))}
                  <button onClick={() => addAccessory(room.id)} className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">
                    + Add Accessory
                  </button>
                </div>
              </div>

              <div>
                <label className={LABEL}>Room Notes</label>
                <input value={room.notes} onChange={(e) => updateRoom(room.id, { notes: e.target.value })} placeholder="Crown, light rail, special conditions..." className={INPUT} />
              </div>
            </div>
          ))}
          <button onClick={addRoom} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors w-full">
            + Add Room
          </button>
        </div>
      )}

      {/* CABINETS — drawings-linked (Karl 2026-05 decision: option C) */}
      {tab === "cabinets" && (
        <CabinetsDrawingsView
          jobId={jobId}
          legacyManualEntry={
            <div className="space-y-8">
              {rooms.length === 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 text-yellow-300/70 text-xs font-condensed uppercase tracking-widest">
                  Define rooms first.
                </div>
              )}
              {rooms.map((room) => {
                const firstFinishId = (room.finishes ?? []).find((f) => f.finish_group_id)?.finish_group_id ?? room.finish_group_id;
                const fg = firstFinishId ? groups.find((g) => g.id === firstFinishId) : undefined;
                const totalPcs = room.cabinets.reduce((n, c) => n + c.qty, 0);
                return (
                  <div key={room.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <span className="text-white text-sm font-medium">{room.name || "Unnamed Room"}</span>
                        {fg && <span className="ml-3 text-white/30 text-xs font-condensed uppercase tracking-widest">{fg.label}</span>}
                        {(room.finishes ?? []).length > 1 && (
                          <span className="ml-3 text-[#f08122]/60 text-xs font-condensed uppercase tracking-widest">
                            +{(room.finishes ?? []).length - 1} more finish{(room.finishes ?? []).length - 1 === 1 ? "" : "es"}
                          </span>
                        )}
                      </div>
                      {totalPcs > 0 && (
                        <span className="text-white/20 text-xs font-condensed uppercase tracking-widest">{totalPcs} pcs</span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {room.cabinets.map((cab, ci) => {
                        const fam = catalogs.cabinetFamilies.find((f) => f.family_code === cab.family_code);
                        return (
                          <CabinetRow
                            key={cab.id}
                            cab={cab}
                            fam={fam}
                            families={catalogs.cabinetFamilies}
                            onChange={(patch) => updateCabinet(room.id, ci, patch)}
                            onRemove={() => removeCabinet(room.id, ci)}
                          />
                        );
                      })}
                    </div>
                    <button
                      onClick={() => addCabinet(room.id)}
                      className="mt-4 border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-2 px-5 transition-colors w-full"
                    >
                      + Add Cabinet
                    </button>
                  </div>
                );
              })}
            </div>
          }
        />
      )}

      {/* MOLDINGS (Phase 1B) */}
      {tab === "moldings" && (
        <MoldingsTab
          groups={groups.map((g) => ({ id: g.id, label: g.label }))}
          rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
          moldings={moldings}
          moldingTypes={catalogs.moldingTypes}
          moldingProfiles={catalogs.moldingProfiles}
          moldingMaterials={catalogs.moldingMaterials}
          onAdd={addMolding}
          onUpdate={updateMolding}
          onRemove={removeMolding}
        />
      )}

      {/* SCHEDULES (spec form expansion v2) — full per-finish-group schedule editors.
          onRegisterSave wires the panel's internal save() back to ResidentialSpecClient
          so the page-level "Save All" button can invoke both endpoints from one click. */}
      {tab === "schedules" && (
        <SchedulesTabLoader
          specId={specId}
          onRegisterSave={(fn) => { schedulesSaveRef.current = fn; }}
        />
      )}

      {/* ACCESSORIES -- pulls + RevAShelf items (2026-05-28) */}
      {tab === "accessories" && (
        <AccessoriesTab specId={specId} initialData={initialAccessories} />
      )}

      {/* SUMMARY */}
      {tab === "summary" && (
        <div className="space-y-4">
          {rooms.length === 0 ? (
            <p className="text-white/20 font-condensed uppercase tracking-widest text-xs">No rooms defined yet.</p>
          ) : rooms.map((room) => {
            const finishes = (room.finishes ?? []).filter((f) => f.finish_group_id);
            const links = finishes.length > 0
              ? finishes
              : (room.finish_group_id ? [{ finish_group_id: room.finish_group_id, zone: "", sort_order: 0 }] : []);

            return (
              <div key={room.id} className="bg-[#2d2d2d] rounded p-5">
                <p className="text-white font-medium text-sm mb-3">{room.name || "Unnamed Room"}</p>
                {links.length === 0 ? (
                  <p className="text-yellow-400/60 text-xs italic">No finish assigned yet</p>
                ) : (
                  <div className="space-y-3">
                    {links.map((link, li) => {
                      const fg   = groups.find((g) => g.id === link.finish_group_id);
                      const door = fg ? catalogs.doorStyles.find((d) => d.id === fg.door_style_id) : null;
                      const pull = fg ? catalogs.hardwarePulls.find((p) => p.id === fg.pull_id) : null;
                      const carc = fg ? catalogs.carcassMaterials.find((c) => c.id === fg.carcass_id) : null;
                      const dbox = fg ? catalogs.drawerBoxes.find((d) => d.id === fg.drawer_box_id) : null;
                      const eb   = fg ? catalogs.edgebands.find((e) => e.id === fg.edgeband_id) : null;
                      return (
                        <div key={li} className="border-l-2 border-[#f08122]/30 pl-3">
                          <p className="text-[#f08122]/80 text-xs font-condensed uppercase tracking-widest mb-2">
                            {link.zone ? `${link.zone} - ` : ""}{fg?.label}
                          </p>
                          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                            <SumRow label="Color"        value={fg?.color_name?.split(" - ")[0]} />
                            <SumRow label="Type"         value={fg?.finish_type} />
                            <SumRow label="Door Style"   value={door?.name} />
                            <SumRow label="Hardware"     value={pull?.name} />
                            <SumRow label="Carcass"      value={carc?.name} />
                            <SumRow label="Drawer Box"   value={dbox?.name} />
                            <SumRow label="Edgeband"     value={eb?.product_name} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CAB_CATS = ["Base", "Wall", "Tall", "Vanity", "Accessory"] as const;

function CabinetRow({
  cab, fam, families, onChange, onRemove,
}: {
  cab: CabinetItem;
  fam: CabinetFamily | undefined;
  families: CabinetFamily[];
  onChange: (patch: Partial<CabinetItem>) => void;
  onRemove: () => void;
}) {
  const widthOpts   = fam?.allowed_widths_in ?? [];
  const heightOpts  = fam?.allowed_heights_in ?? [];
  const showHinge   = fam?.requires_hinge_side ?? false;
  const showRollout = (fam?.options?.supports_rollouts && (fam.options.max_rollouts ?? 0) > 0) ?? false;
  const maxRollouts = fam?.options?.max_rollouts ?? 0;
  const showTrash   = fam?.options?.supports_trash_kit ?? false;
  const trashConfig = fam?.options?.trash_config ?? ["None", "Single", "Double"];
  const showApplied = fam?.options?.supports_applied_panels ?? false;
  const hasOptions  = showHinge || showRollout || showTrash || showApplied;

  function pickFamily(code: string) {
    const f = families.find((x) => x.family_code === code);
    onChange({
      family_code: code,
      width_in:   f?.allowed_widths_in?.[0]  ?? null,
      height_in:  f?.allowed_heights_in?.[0] ?? null,
      depth_in:   f?.default_depth_in        ?? null,
      hinge_side: "", rollout_trays_qty: 0, trash_kit: "None", applied_panels: false,
    });
  }

  const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
  const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
  const SELECT = INPUT;

  return (
    <div className="bg-[#1a1a1a] border border-white/8 rounded p-4 space-y-3">
      <div className="flex gap-3 items-start">
        <select value={cab.family_code} onChange={(e) => pickFamily(e.target.value)} className={SELECT + " flex-1"}>
          <option value="">-- Select Cabinet Family --</option>
          {CAB_CATS.map((cat) => {
            const fams = families.filter((f) => f.category === cat);
            if (!fams.length) return null;
            return (
              <optgroup key={cat} label={cat}>
                {fams.map((f) => <option key={f.family_code} value={f.family_code}>{f.display_name}</option>)}
              </optgroup>
            );
          })}
        </select>
        <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors px-1 mt-2.5 text-sm shrink-0">x</button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={LABEL}>Width (in)</label>
          {widthOpts.length > 0
            ? <select value={cab.width_in ?? ""} onChange={(e) => onChange({ width_in: Number(e.target.value) })} className={SELECT}>
                <option value="">--</option>
                {widthOpts.map((w) => <option key={w} value={w}>{w}&quot;</option>)}
              </select>
            : <input type="number" value={cab.width_in ?? ""} onChange={(e) => onChange({ width_in: parseFloat(e.target.value) || null })} className={INPUT} placeholder="W" />
          }
        </div>
        <div>
          <label className={LABEL}>Height (in)</label>
          {heightOpts.length > 0
            ? <select value={cab.height_in ?? ""} onChange={(e) => onChange({ height_in: Number(e.target.value) })} className={SELECT}>
                <option value="">--</option>
                {heightOpts.map((h) => <option key={h} value={h}>{h}&quot;</option>)}
              </select>
            : <input type="number" value={cab.height_in ?? ""} onChange={(e) => onChange({ height_in: parseFloat(e.target.value) || null })} className={INPUT} placeholder="H" />
          }
        </div>
        <div>
          <label className={LABEL}>Depth (in)</label>
          <input type="number" value={cab.depth_in ?? ""} onChange={(e) => onChange({ depth_in: parseFloat(e.target.value) || null })}
            className={INPUT} placeholder={fam?.default_depth_in ? String(fam.default_depth_in) : "D"} />
        </div>
        <div>
          <label className={LABEL}>Qty</label>
          <input type="number" min={1} value={cab.qty} onChange={(e) => onChange({ qty: parseInt(e.target.value) || 1 })} className={INPUT} />
        </div>
      </div>

      {hasOptions && (
        <div className="flex flex-wrap gap-4 items-end pt-1">
          {showHinge && (
            <div>
              <label className={LABEL}>Hinge Side</label>
              <select value={cab.hinge_side} onChange={(e) => onChange({ hinge_side: e.target.value })} className={SELECT + " w-28"}>
                <option value="">--</option>
                <option value="L">Left</option>
                <option value="R">Right</option>
              </select>
            </div>
          )}
          {showRollout && (
            <div>
              <label className={LABEL}>Rollout Trays (max {maxRollouts})</label>
              <input type="number" min={0} max={maxRollouts} value={cab.rollout_trays_qty}
                onChange={(e) => onChange({ rollout_trays_qty: Math.min(parseInt(e.target.value) || 0, maxRollouts) })}
                className={INPUT + " w-20"} />
            </div>
          )}
          {showTrash && (
            <div>
              <label className={LABEL}>Trash Kit</label>
              <select value={cab.trash_kit} onChange={(e) => onChange({ trash_kit: e.target.value })} className={SELECT + " w-36"}>
                {trashConfig.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          {showApplied && (
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input type="checkbox" checked={cab.applied_panels} onChange={(e) => onChange({ applied_panels: e.target.checked })}
                className="accent-[#f08122] w-4 h-4" />
              <span className="text-white/50 text-xs font-condensed uppercase tracking-widest">Applied Panels</span>
            </label>
          )}
        </div>
      )}

      <div>
        <label className={LABEL}>Special Instructions</label>
        <input value={cab.special_instructions} onChange={(e) => onChange({ special_instructions: e.target.value })}
          placeholder="Custom dims, modifications, island back..." className={INPUT} />
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-white/30 font-condensed uppercase tracking-wider mr-2">{label}:</span>
      <span className="text-white/70 capitalize">{value}</span>
    </div>
  );
}
