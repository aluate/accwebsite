/**
 * PDF generator for residential cabinet specs.
 *
 * Rebuilt 2026-05-28 — faithful to RESIDENTIAL COVER SHEET.xlsx layout.
 * Page sequence:
 *   F.x   Per-finish-group cover (landscape, matches RESIDENTIAL COVER SHEET.xlsx)
 *           - Header strip: Job# / WO# / Date / PM / Engineer / Finish / Notes
 *           - Left column: Material / Door / Drawer / Edgeband / Hardware schedules
 *           - Right column: Finish / Moldings / Countertops
 *   R.1   Room matrix (landscape) — rows=rooms, cols=finish groups, ✓ if FG applies
 *   N.1   Notes (landscape) — install / finishing / shop / client (rendered if any notes exist)
 *
 * Source of truth for layout: EXAMPLE DRAWINGS/RESIDENTIAL COVER SHEET.xlsx
 * Source of truth for data shape: lib/spec-data.ts (loadSpecPDFData).
 */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ─── Types (consumed by spec-data.ts loader) ──────────────────────────────────

export type FinishView = {
  stain_name: string; paint_name: string; glaze_name: string;
  topcoat_name: string; sheen_name: string;
};

export type MaterialView = {
  role: string; role_label: string; name: string;
  where_used: string; notes: string;
};

export type DoorFrontView = {
  role: string; role_label: string; slot_label: string;
  style_name: string; material_name: string;
  oe_name: string; ie_name: string; panel_name: string;
  grain: string; vendor: string; notes: string;
};

export type DrawerView = {
  role: string; role_label: string; slot_label: string;
  drawer_box_name: string; slides_name: string; notes: string;
};

export type EdgebandView = {
  code: string; edgeband_name: string; supplier: string; thickness: string;
  where_used_label: string; notes: string;
};

export type HardwareView = {
  role: string; role_label: string; slot_label: string;
  hardware_name: string; brand: string;
  qty: number | null; location: string; vendor: string; notes: string;
};

export type CountertopView = {
  location: string;
  style_name: string; edge_name: string;
  splash_style: string; splash_edge_name: string;
  material_name: string;
  buildup_in: number | null;
  core_substrate: string; brackets: string; notes: string;
};

export type MoldingView = {
  molding_type: string; type_label: string;
  profile_name: string; size_in: number | null;
  material_name: string; qty_lf: number | null;
  where_used: string[]; notes: string;
};

export type FinishGroupView = {
  id: string; label: string; finish_type: string; notes: string; species: string;
  finish: FinishView;
  materials: MaterialView[];
  door_fronts: DoorFrontView[];
  drawers: DrawerView[];
  edgebands: EdgebandView[];
  hardware: HardwareView[];
  countertops: CountertopView[];
  moldings: MoldingView[];
};

export type RoomFinishView = {
  finish_group_id: string;
  finish_label: string;
  zone: string;
};

export type RoomView = {
  id: string;
  name: string;
  notes: string;
  finishes: RoomFinishView[];
  accessories: { name: string; brand: string; qty: number }[];
};

export type AccessoryRollupRow = {
  name: string; brand: string;
  total_qty: number; rooms: string[];
};

export type MoldingRollupRow = {
  type_label: string; profile_name: string;
  size_in: number | null; material_name: string;
  total_lf: number; finishes: string[];
};

export type SpecPullRow = {
  id: string;
  make: string;
  model: string;
  size: string;
  room: string;
  notes: string;
  qty: number;
};

export type SpecAccessoryRow = {
  id: string;
  part_number: string;
  description: string;
  qty: number;
  handed: string;
  room: string;
  notes: string;
};

export type SpecPDFData = {
  job_id: string;
  spec_name: string;
  generated_at: string;

  client_name: string;
  client_email: string | null;
  builder_name: string | null;
  builder_company: string | null;
  pm: string | null;
  site_address: string;
  city: string | null;
  delivery_date: string | null;

  notes_install: string | null;
  notes_finishing: string | null;
  notes_shop: string | null;
  notes_client: string | null;

  finish_groups: FinishGroupView[];
  rooms: RoomView[];
  accessories_rollup: AccessoryRollupRow[];
  moldings_rollup: MoldingRollupRow[];

  spec_pulls: SpecPullRow[];
  spec_accessories: SpecAccessoryRow[];

  // Phase 1 additions (2026-07-02)
  finish_group_pulls: Record<string, FGPullRow[]>;
  room_trim: Record<string, RoomTrimEntry[]>;
  spec_appliances_list: ApplianceEntry[];
  job_notes: string | null;
};

export type FGPullRow = {
  id: string;
  description: string;
  part_no: string;
  finish_color: string;
  where_used: string;
  qty: number;
  sort_order: number;
};

export type RoomTrimEntry = {
  id: string;
  room_id: string;
  trim_type: string;
  size_desc: string;
  material: string;
  qty_lf: number;
  notes: string;
  sort_order: number;
};

export type ApplianceEntry = {
  id: string;
  appliance_type: string;
  manufacturer: string;
  model_no: string;
  room_name: string;
  notes: string;
  sort_order: number;
};

// ─── XLSX fixed-row definitions ───────────────────────────────────────────────

const MATERIAL_ROLES: { role: string; label: string }[] = [
  { role: "cab_ext", label: "Cabinet Exterior" },
  { role: "cab_int", label: "Cabinet Interior" },
];

const DOOR_ROLES: { role: string; label: string }[] = [
  { role: "base",         label: "Base Doors" },
  { role: "upper",        label: "Upper Doors" },
  { role: "applied_ends", label: "Applied Ends" },
  { role: "slab_df",      label: "Slab DF" },
  { role: "5pc_df",       label: "5 PC DF" },
];

const DRAWER_ROLES: { role: string; label: string }[] = [
  { role: "drawer_box", label: "Drawer Box" },
  { role: "rollout",    label: "Rollout" },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const ORANGE  = "#f08122";
const DARK    = "#222";
const MUTED   = "#777";
const HAIR    = "#e0e0e0";
const HEAD_BG = "#3d3d3d";
const STRIPE  = "#f7f7f5";
const BAND_BG = "#f0ede8";

const S = StyleSheet.create({
  // Landscape LETTER. paddingTop accommodates the fixed title block (~64pt).
  page: {
    paddingTop: 72, paddingBottom: 32, paddingLeft: 24, paddingRight: 24,
    fontSize: 7, fontFamily: "Helvetica", color: DARK,
  },

  // ── Title block (fixed, top of every page) ──
  tbWrap:    { position: "absolute", top: 12, left: 20, right: 20 },
  tbTopRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 2 },
  tbLeft:    { flex: 1 },
  tbBrand:   { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", letterSpacing: 0.8 },
  tbStageRow:{ flexDirection: "row", alignItems: "center", marginTop: 1 },
  tbStage:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 1.5, marginRight: 6 },
  tbCover:   { fontSize: 6.5, color: MUTED, letterSpacing: 0.8 },
  tbProject: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 1 },
  tbRight:   { fontSize: 6.5, color: "#444", textAlign: "right", lineHeight: 1.3 },
  tbAddrRow: { borderTopWidth: 0.5, borderTopColor: "#bbb", marginTop: 2, paddingTop: 2, fontSize: 6, color: MUTED, textAlign: "center" },
  tbBanner:  { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.4, borderTopColor: HAIR, borderBottomWidth: 1.2, borderBottomColor: ORANGE, marginTop: 2, paddingVertical: 2 },
  tbBnrLeft: { fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.4 },
  tbBnrRight:{ fontSize: 6.5, color: MUTED, letterSpacing: 0.8 },

  // ── Footer ──
  footer:    { position: "absolute", bottom: 12, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between" },
  footerTxt: { fontSize: 6, color: "#aaa" },

  // ── Header strip (beneath title block, top of each finish-group page) ──
  hStrip:      { flexDirection: "row", borderWidth: 0.5, borderColor: "#999", marginBottom: 5 },
  hCell:       { paddingHorizontal: 5, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: "#bbb" },
  hCellLast:   { paddingHorizontal: 5, paddingVertical: 3 },
  hLabel:      { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase" },
  hVal:        { fontSize: 8, color: DARK, marginTop: 1 },

  // ── Two-column body ──
  twoCol:  { flexDirection: "row", gap: 7 },
  colLeft: { flex: 1.65 },
  colRight:{ flex: 1 },

  // ── Section band (matches the XLSX section headers) ──
  band:      { flexDirection: "row", backgroundColor: BAND_BG, borderBottomWidth: 0.8, borderBottomColor: ORANGE, paddingHorizontal: 4, paddingVertical: 2, marginTop: 5 },
  bandTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.8, textTransform: "uppercase", flex: 1 },
  bandRight: { fontSize: 6.5, color: ORANGE, fontFamily: "Helvetica-Bold" },

  // ── Schedule table rows (compact) ──
  colHdr:  { flexDirection: "row", backgroundColor: HEAD_BG, paddingHorizontal: 3, paddingVertical: 2 },
  colHdrTx:{ fontSize: 6, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.3 },
  sRow:    { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  sRowAlt: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  sCell:   { fontSize: 7, color: DARK },
  sCellMu: { fontSize: 7, color: MUTED, fontStyle: "italic" },

  // ── Key-value rows (Finish schedule, Countertop fields) ──
  kvRow:   { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  kvRowAlt:{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  kvLabel: { width: 72, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.4, textTransform: "uppercase" },
  kvVal:   { flex: 1, fontSize: 7.5, color: DARK },

  // ── Notes box ──
  notesBox:  { borderWidth: 0.4, borderColor: HAIR, backgroundColor: STRIPE, padding: 5, marginTop: 3 },
  notesLabel:{ fontSize: 6, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  notesBody: { fontSize: 7, color: DARK, lineHeight: 1.4 },

  // ── Room matrix ──
  matrixHdr: { flexDirection: "row", backgroundColor: HEAD_BG, paddingHorizontal: 3, paddingVertical: 3 },
  matrixRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  matrixRowAlt:{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  matrixHdrTx:{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase" },
  matrixCell:{ fontSize: 8, color: DARK, textAlign: "center" },
  matrixRoomCell:{ fontSize: 7.5, color: DARK },

  // ── Notes page ──
  npSection: { marginBottom: 10 },
  npLabel:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", borderBottomWidth: 0.8, borderBottomColor: ORANGE, paddingBottom: 2, marginBottom: 4 },
  npBody:    { fontSize: 8, color: DARK, lineHeight: 1.5 },

  // ── Empty state ──
  empty: { fontSize: 7, fontStyle: "italic", color: MUTED, padding: 4 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dash = (s: string | number | null | undefined) =>
  s === null || s === undefined || s === "" ? "" : String(s);

function cleanNotes(s: string | null | undefined): string {
  if (!s) return "";
  if (s.startsWith("Auto-seeded from builder profile:")) return "";
  return s.trim();
}

const stageMap: Record<string, string> = {
  F: "FINISH", R: "ROOMS", N: "NOTES", A: "ACCESSORIES",
  EB: "EDGEBANDS", T: "TRIM", AP: "APPLIANCES",
};

// ─── Shared components ────────────────────────────────────────────────────────

function TitleBlock({ data, code }: { data: SpecPDFData; code: string }) {
  const stageLetter = code.split(".")[0] || "F";
  const stageWord   = stageMap[stageLetter] ?? "SPEC";
  const projectName = [data.builder_company, data.client_name].filter(Boolean).join(" — ") || data.client_name;
  return (
    <View style={S.tbWrap} fixed>
      <View style={S.tbTopRow}>
        <View style={S.tbLeft}>
          <Text style={S.tbBrand}>ADVANCED CUSTOM CABINETS</Text>
          <View style={S.tbStageRow}>
            <Text style={S.tbStage}>{stageWord}</Text>
            <Text style={S.tbCover}>SHEET {code}</Text>
          </View>
          <Text style={S.tbProject}>{projectName}</Text>
        </View>
        <View>
          <Text style={S.tbRight}>Job #: {data.job_id}</Text>
          {data.pm              && <Text style={S.tbRight}>PM: {data.pm}</Text>}
          {data.builder_company && <Text style={S.tbRight}>Builder: {data.builder_company}</Text>}
          {data.builder_name    && <Text style={[S.tbRight, { fontSize: 6, color: MUTED }]}>Contact: {data.builder_name}</Text>}
          <Text style={S.tbRight}>Date: {new Date(data.generated_at).toLocaleDateString()}</Text>
        </View>
      </View>
      <Text style={S.tbAddrRow}>250 W Anton Ave · Coeur d&apos;Alene, Idaho 83815 · (208) 772-2377</Text>
      <View style={S.tbBanner}>
        <Text style={S.tbBnrLeft}>{data.job_id}  ·  {projectName}</Text>
        <Text style={S.tbBnrRight}>{stageWord} · SHEET {code}</Text>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: SpecPDFData }) {
  const d = new Date(data.generated_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const version = `v.${String(d.getFullYear()).slice(2)}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerTxt}>
        {[data.spec_name, data.job_id, `Generated ${d.toLocaleString()}`, version].filter(Boolean).join("  ·  ")}
      </Text>
      <Text style={S.footerTxt} render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Band({ title, right }: { title: string; right?: string }) {
  return (
    <View style={S.band}>
      <Text style={S.bandTitle}>{title}</Text>
      {right ? <Text style={S.bandRight}>{right}</Text> : null}
    </View>
  );
}

// ─── F.x Finish-group header strip ────────────────────────────────────────────

function FinishHeaderStrip({ data, fg }: { data: SpecPDFData; fg: FinishGroupView }) {
  const dateStr = new Date(data.generated_at).toLocaleDateString();
  return (
    <View style={S.hStrip}>
      <View style={[S.hCell, { flex: 0.7 }]}>
        <Text style={S.hLabel}>Job #</Text>
        <Text style={S.hVal}>{data.job_id}</Text>
      </View>
      <View style={[S.hCell, { flex: 0.7 }]}>
        <Text style={S.hLabel}>WO #</Text>
        <Text style={S.hVal}> </Text>
      </View>
      <View style={[S.hCell, { flex: 0.9 }]}>
        <Text style={S.hLabel}>Date</Text>
        <Text style={S.hVal}>{dateStr}</Text>
      </View>
      <View style={[S.hCell, { flex: 1.3 }]}>
        <Text style={S.hLabel}>Project Manager</Text>
        <Text style={S.hVal}>{data.pm ?? "—"}</Text>
      </View>
      <View style={[S.hCell, { flex: 1.3 }]}>
        <Text style={S.hLabel}>Engineer</Text>
        <Text style={S.hVal}> </Text>
      </View>
      <View style={[S.hCell, { flex: 1.6 }]}>
        <Text style={S.hLabel}>Finish</Text>
        <Text style={S.hVal}>
          {fg.finish_type === 'paint'
            ? (fg.finish.paint_name || fg.label)
            : fg.finish_type === 'stain'
            ? (fg.finish.stain_name || fg.label)
            : (fg.finish_type ? fg.finish_type.charAt(0).toUpperCase() + fg.finish_type.slice(1) : fg.label)}
        </Text>
      </View>
      <View style={[S.hCellLast, { flex: 3 }]}>
        <Text style={S.hLabel}>Notes</Text>
        <Text style={[S.hVal, { fontSize: 7 }]}>{cleanNotes(fg.notes) || "—"}</Text>
      </View>
    </View>
  );
}

// ─── F.x Left column sections ─────────────────────────────────────────────────

function MaterialSchedule({ fg }: { fg: FinishGroupView }) {
  const matByRole = new Map(fg.materials.map(m => [m.role, m]));
  return (
    <>
      <Band title="Material Schedule" />
      <View style={[S.colHdr]}>
        <Text style={[S.colHdrTx, { flex: 1.6 }]}>Type</Text>
        <Text style={[S.colHdrTx, { flex: 2.2 }]}>Material</Text>
        <Text style={[S.colHdrTx, { flex: 2 }]}>Notes / Location</Text>
      </View>
      {MATERIAL_ROLES.map(({ role, label }, i) => {
        const m = matByRole.get(role);
        return (
          <View key={role} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
            <Text style={[S.sCell, { flex: 1.6, fontFamily: "Helvetica-Bold" }]}>{label}</Text>
            <Text style={[S.sCell, { flex: 2.2 }]}>{dash(m?.name)}</Text>
            <Text style={[S.sCellMu, { flex: 2 }]}>{dash(m?.where_used)}</Text>
          </View>
        );
      })}
    </>
  );
}

function DoorSchedule({ fg }: { fg: FinishGroupView }) {
  const doorByRole = new Map(fg.door_fronts.map(d => [d.role, d]));
  // Collect door notes
  const doorNotes = fg.door_fronts.filter(d => d.notes).map(d => `${d.role_label}: ${d.notes}`).join("  ·  ");
  return (
    <>
      <Band title="Door Schedule" />
      <View style={S.colHdr}>
        <Text style={[S.colHdrTx, { flex: 1.2 }]}>Type</Text>
        <Text style={[S.colHdrTx, { flex: 2.2 }]}>Style</Text>
        <Text style={[S.colHdrTx, { flex: 1.6 }]}>Material</Text>
        <Text style={[S.colHdrTx, { flex: 0.7 }]}>OE</Text>
        <Text style={[S.colHdrTx, { flex: 0.7 }]}>IE</Text>
        <Text style={[S.colHdrTx, { flex: 0.8 }]}>Panel</Text>
        <Text style={[S.colHdrTx, { flex: 0.7 }]}>Grain</Text>
        <Text style={[S.colHdrTx, { flex: 1.2 }]}>Vendor</Text>
      </View>
      {DOOR_ROLES.map(({ role, label }, i) => {
        const d = doorByRole.get(role);
        return (
          <View key={role} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
            <Text style={[S.sCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{label}</Text>
            <Text style={[S.sCell, { flex: 2.2 }]}>{dash(d?.style_name)}</Text>
            <Text style={[S.sCell, { flex: 1.6 }]}>{dash(d?.material_name)}</Text>
            <Text style={[S.sCell, { flex: 0.7 }]}>{dash(d?.oe_name)}</Text>
            <Text style={[S.sCell, { flex: 0.7 }]}>{dash(d?.ie_name)}</Text>
            <Text style={[S.sCell, { flex: 0.8 }]}>{dash(d?.panel_name)}</Text>
            <Text style={[S.sCell, { flex: 0.7 }]}>{dash(d?.grain)}</Text>
            <Text style={[S.sCell, { flex: 1.2 }]}>{dash(d?.vendor)}</Text>
          </View>
        );
      })}
      {doorNotes ? (
        <View style={S.notesBox}>
          <Text style={S.notesLabel}>Notes</Text>
          <Text style={S.notesBody}>{doorNotes}</Text>
        </View>
      ) : null}
    </>
  );
}

function DrawerSchedule({ fg }: { fg: FinishGroupView }) {
  const drawerByRole = new Map(fg.drawers.map(d => [d.role, d]));
  const drawerNotes = fg.drawers.filter(d => d.notes).map(d => `${d.role_label}: ${d.notes}`).join("  ·  ");
  return (
    <>
      <Band title="Drawer Schedule" />
      <View style={S.colHdr}>
        <Text style={[S.colHdrTx, { flex: 1.4 }]}>Type</Text>
        <Text style={[S.colHdrTx, { flex: 2.4 }]}>Drawer Box</Text>
        <Text style={[S.colHdrTx, { flex: 2 }]}>Slides</Text>
      </View>
      {DRAWER_ROLES.map(({ role, label }, i) => {
        const d = drawerByRole.get(role);
        return (
          <View key={role} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
            <Text style={[S.sCell, { flex: 1.4, fontFamily: "Helvetica-Bold" }]}>{label}</Text>
            <Text style={[S.sCell, { flex: 2.4 }]}>{dash(d?.drawer_box_name)}</Text>
            <Text style={[S.sCell, { flex: 2 }]}>{dash(d?.slides_name)}</Text>
          </View>
        );
      })}
      {drawerNotes ? (
        <View style={S.notesBox}>
          <Text style={S.notesLabel}>Notes</Text>
          <Text style={S.notesBody}>{drawerNotes}</Text>
        </View>
      ) : null}
    </>
  );
}

function EdgebandSchedule({ fg }: { fg: FinishGroupView }) {
  return (
    <>
      <Band title="Edgeband Schedule" />
      {fg.edgebands.length === 0 ? (
        <Text style={S.empty}>No edgebands specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 0.4 }]}>ID</Text>
            <Text style={[S.colHdrTx, { flex: 0.7 }]}>Thick</Text>
            <Text style={[S.colHdrTx, { flex: 1.4 }]}>Mfr / Supplier</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Description</Text>
            <Text style={[S.colHdrTx, { flex: 2.2 }]}>Where Used</Text>
            <Text style={[S.colHdrTx, { flex: 1.4 }]}>Notes</Text>
          </View>
          {fg.edgebands.map((e, i) => (
            <View key={i} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 0.4, fontFamily: "Helvetica-Bold" }]}>{e.code}</Text>
              <Text style={[S.sCell, { flex: 0.7 }]}>{dash(e.thickness)}</Text>
              <Text style={[S.sCell, { flex: 1.4 }]}>{dash(e.supplier)}</Text>
              <Text style={[S.sCell, { flex: 2 }]}>{dash(e.edgeband_name)}</Text>
              <Text style={[S.sCell, { flex: 2.2 }]}>{dash(e.where_used_label)}</Text>
              <Text style={[S.sCellMu, { flex: 1.4 }]}>{dash(e.notes)}</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function HardwareSchedule({ fg }: { fg: FinishGroupView }) {
  return (
    <>
      <Band title="Hardware" />
      {fg.hardware.length === 0 ? (
        <Text style={S.empty}>No hardware specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Brand</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Description</Text>
            <Text style={[S.colHdrTx, { flex: 0.4, textAlign: "right" }]}>Qty</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Location</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Vendor</Text>
            <Text style={[S.colHdrTx, { flex: 1.4 }]}>Notes</Text>
          </View>
          {fg.hardware.map((h, i) => (
            <View key={i} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{h.role_label}</Text>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(h.brand)}</Text>
              <Text style={[S.sCell, { flex: 2 }]}>{dash(h.hardware_name)}</Text>
              <Text style={[S.sCell, { flex: 0.4, textAlign: "right" }]}>{h.qty ?? ""}</Text>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(h.location)}</Text>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(h.vendor)}</Text>
              <Text style={[S.sCellMu, { flex: 1.4 }]}>{dash(h.notes)}</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

// ─── F.x Right column sections ────────────────────────────────────────────────


function FGPullsSection({ data, fg }: { data: SpecPDFData; fg: FinishGroupView }) {
  const fgPulls = (data.finish_group_pulls ?? {})[fg.id] ?? [];
  if (fgPulls.length === 0) {
    return (
      <>
        <Band title="Pulls" />
        <Text style={S.empty}>See hardware schedule</Text>
      </>
    );
  }
  return (
    <>
      <Band title="Pulls" />
      <View style={S.colHdr}>
        <Text style={[S.colHdrTx, { flex: 2.2 }]}>Description</Text>
        <Text style={[S.colHdrTx, { flex: 1.2 }]}>Part #</Text>
        <Text style={[S.colHdrTx, { flex: 1 }]}>Finish</Text>
        <Text style={[S.colHdrTx, { flex: 1.5 }]}>Where Used</Text>
        <Text style={[S.colHdrTx, { flex: 0.5, textAlign: "right" }]}>Qty</Text>
      </View>
      {fgPulls.map((p, i) => (
        <View key={p.id} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
          <Text style={[S.sCell, { flex: 2.2, fontFamily: "Helvetica-Bold" }]}>{dash(p.description)}</Text>
          <Text style={[S.sCell, { flex: 1.2 }]}>{dash(p.part_no)}</Text>
          <Text style={[S.sCell, { flex: 1 }]}>{dash(p.finish_color)}</Text>
          <Text style={[S.sCell, { flex: 1.5 }]}>{dash(p.where_used)}</Text>
          <Text style={[S.sCell, { flex: 0.5, textAlign: "right" }]}>{p.qty || ""}</Text>
        </View>
      ))}
    </>
  );
}

function FinishSchedule({ fg }: { fg: FinishGroupView }) {
  const isPaintOrStain = fg.finish_type === "paint" || fg.finish_type === "stain";
  const baseRows = [
    { label: "Stain",   value: fg.finish.stain_name },
    { label: "Paint",   value: fg.finish.paint_name },
    { label: "Glaze",   value: fg.finish.glaze_name },
    { label: "Finish",  value: fg.finish.topcoat_name },
    { label: "Sheen",   value: fg.finish.sheen_name },
  ];
  const rows = [
    ...baseRows,
    ...(isPaintOrStain && fg.species ? [{ label: "Species", value: fg.species }] : []),
  ];
  return (
    <>
      <Band title="Finish Schedule" right={fg.finish_type ? fg.finish_type.charAt(0).toUpperCase() + fg.finish_type.slice(1) : ''} />
      {rows.map(({ label, value }, i) => (
        <View key={label} style={i % 2 === 0 ? S.kvRow : S.kvRowAlt}>
          <Text style={S.kvLabel}>{label}</Text>
          <Text style={S.kvVal}>{value || "—"}</Text>
        </View>
      ))}
    </>
  );
}

function MoldingsSchedule({ fg }: { fg: FinishGroupView }) {
  return (
    <>
      <Band title="Moldings" />
      {fg.moldings.length === 0 ? (
        <Text style={S.empty}>No moldings specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.4 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 0.6 }]}>Size</Text>
            <Text style={[S.colHdrTx, { flex: 1.6 }]}>Material</Text>
            <Text style={[S.colHdrTx, { flex: 0.6, textAlign: "right" }]}>Qty LF</Text>
          </View>
          {fg.moldings.map((m, i) => (
            <View key={i} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.4 }]}>{m.type_label}</Text>
              <Text style={[S.sCell, { flex: 0.6 }]}>{m.size_in ? `${m.size_in}"` : ""}</Text>
              <Text style={[S.sCell, { flex: 1.6 }]}>{dash(m.material_name)}</Text>
              <Text style={[S.sCell, { flex: 0.6, textAlign: "right" }]}>
                {m.qty_lf !== null ? m.qty_lf : ""}
              </Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function CountertopsSchedule({ fg }: { fg: FinishGroupView }) {
  // Countertop fields as label-value pairs per location
  return (
    <>
      <Band title="Countertops" />
      {fg.countertops.length === 0 ? (
        <Text style={S.empty}>No countertops specified.</Text>
      ) : fg.countertops.map((c, ci) => {
        const locFields = [
          { label: "Location",       value: c.location },
          { label: "Counter Style",  value: c.style_name },
          { label: "Counter Edge",   value: c.edge_name },
          { label: "Splash",         value: c.splash_style },
          { label: "Splash Edge",    value: c.splash_edge_name },
          { label: "Material",       value: c.material_name },
          { label: "Buildup",        value: c.buildup_in ? `${c.buildup_in}"` : "" },
          { label: "Core Substrate", value: c.core_substrate },
          { label: "Brackets",       value: c.brackets },
        ];
        return (
          <View key={ci}>
            {ci > 0 && <View style={{ height: 3 }} />}
            {locFields.map(({ label, value }, i) => (
              <View key={label} style={i % 2 === 0 ? S.kvRow : S.kvRowAlt}>
                <Text style={S.kvLabel}>{label}</Text>
                <Text style={S.kvVal}>{value || "—"}</Text>
              </View>
            ))}
            {c.notes ? (
              <View style={S.notesBox}>
                <Text style={S.notesLabel}>Notes</Text>
                <Text style={S.notesBody}>{c.notes}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

// ─── F.x Per-finish-group page ────────────────────────────────────────────────

function FinishGroupPage({ data, fg, idx }: { data: SpecPDFData; fg: FinishGroupView; idx: number }) {
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code={`F.${idx + 1}`} />
      <FinishHeaderStrip data={data} fg={fg} />
      <View style={S.twoCol}>
        {/* Left column: Material / Door / Drawer / Edgeband / Hardware */}
        <View style={S.colLeft}>
          <MaterialSchedule fg={fg} />
          <DoorSchedule fg={fg} />
          <EdgebandSchedule fg={fg} />
          <HardwareSchedule fg={fg} />
        </View>
        {/* Right column: Finish / Pulls / Moldings / Countertops */}
        <View style={S.colRight}>
          <FinishSchedule fg={fg} />
          <FGPullsSection data={data} fg={fg} />
          <MoldingsSchedule fg={fg} />
          <CountertopsSchedule fg={fg} />
        </View>
      </View>
      <PageFooter data={data} />
    </Page>
  );
}

// Room schedule page (3-column list: Room | Finish Group | Notes)

function RoomMatrixPage({ data }: { data: SpecPDFData }) {
  const address = data.site_address || "";
  const fgs = data.finish_groups;
  const rooms = data.rooms;

  // Build flat list of rows: one row per room×FG assignment
  type RoomRow = { roomName: string; fgLabel: string; notes: string };
  const rows: RoomRow[] = [];
  for (const room of rooms) {
    if (room.finishes.length === 0) {
      rows.push({ roomName: room.name || "—", fgLabel: "—", notes: "" });
    } else {
      for (const f of room.finishes) {
        const fg = fgs.find((g) => g.id === f.finish_group_id);
        rows.push({
          roomName: room.name || "—",
          fgLabel: fg ? fg.label : (f.finish_group_id ? "?" : "—"),
          notes: f.zone || "",
        });
      }
    }
  }

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="R.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 2 }}>
        ROOM SCHEDULE
      </Text>
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>{address}</Text>
      {cleanNotes(data.job_notes) ? (
        <View style={[S.notesBox, { borderColor: "#c00", marginBottom: 8 }]}>
          <Text style={[S.notesLabel, { color: "#c00" }]}>JOB NOTES</Text>
          <Text style={[S.notesBody, { color: "#111" }]}>{cleanNotes(data.job_notes)}</Text>
        </View>
      ) : null}
      {/* Finish group legend */}
      {fgs.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {fgs.map((fg) => (
            <View key={fg.id} style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ORANGE, marginRight: 3 }}>
                {fg.label}:
              </Text>
              <Text style={{ fontSize: 7, color: DARK }}>{fg.finish_type || "—"}</Text>
            </View>
          ))}
        </View>
      )}
      {/* 3-column table */}
      {rooms.length === 0 ? (
        <Text style={S.empty}>No rooms added.</Text>
      ) : (
        <>
          {/* Header row */}
          <View style={{ flexDirection: "row", backgroundColor: DARK, paddingHorizontal: 3, paddingVertical: 3 }}>
            <Text style={[S.matrixHdrTx, { flex: 3.5 }]}>ROOM</Text>
            <Text style={[S.matrixHdrTx, { flex: 2 }]}>FINISH GROUP</Text>
            <Text style={[S.matrixHdrTx, { flex: 4.5 }]}>NOTES</Text>
          </View>
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={[
                ri % 2 === 0 ? S.matrixRow : S.matrixRowAlt,
                { flexWrap: "wrap" },
              ]}
            >
              <Text style={[S.matrixRoomCell, { flex: 3.5 }]}>{row.roomName}</Text>
              <Text style={[S.sCell, { flex: 2, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{row.fgLabel}</Text>
              <Text style={[S.sCell, { flex: 4.5 }]}>{row.notes}</Text>
            </View>
          ))}
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// Notes page

function NotesPage({ data }: { data: SpecPDFData }) {
  const sections = [
    { label: "Install Notes",   body: cleanNotes(data.notes_install) },
    { label: "Finishing Notes", body: cleanNotes(data.notes_finishing) },
    { label: "Shop Notes",      body: cleanNotes(data.notes_shop) },
    { label: "Client Notes",    body: cleanNotes(data.notes_client) },
  ].filter(s => s.body);

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="N.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 8 }}>
        NOTES
      </Text>
      {sections.map((s) => (
        <View key={s.label} style={S.npSection}>
          <Text style={S.npLabel}>{s.label}</Text>
          <Text style={S.npBody}>{s.body}</Text>
        </View>
      ))}
      <PageFooter data={data} />
    </Page>
  );
}

// A.1 Accessories and Pulls page

function AccessoriesPage({ data }: { data: SpecPDFData }) {
  const pulls = data.spec_pulls ?? [];
  const accs = data.spec_accessories ?? [];

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="A.1" />

      {/* PULLS section */}
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 4 }}>
        PULLS
      </Text>
      {pulls.length === 0 ? (
        <Text style={S.empty}>No pulls specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Make</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Model</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Size</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 0.5, textAlign: "right" }]}>Qty</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Notes</Text>
          </View>
          {pulls.map((p, i) => (
            <View key={p.id} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(p.make)}</Text>
              <Text style={[S.sCell, { flex: 1.5, fontFamily: "Helvetica-Bold" }]}>{dash(p.model)}</Text>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(p.size)}</Text>
              <Text style={[S.sCell, { flex: 1.5 }]}>{dash(p.room)}</Text>
              <Text style={[S.sCell, { flex: 0.5, textAlign: "right" }]}>{p.qty}</Text>
              <Text style={[S.sCellMu, { flex: 2 }]}>{dash(p.notes)}</Text>
            </View>
          ))}
        </>
      )}

      {/* Spacer between sections */}
      <View style={{ height: 14 }} />

      {/* ACCESSORIES section */}
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 4 }}>
        REVASHELF / ACCESSORIES
      </Text>
      {accs.length === 0 ? (
        <Text style={S.empty}>No accessories specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Part Number</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Description</Text>
            <Text style={[S.colHdrTx, { flex: 0.5, textAlign: "right" }]}>Qty</Text>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>Handed</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Notes</Text>
          </View>
          {accs.map((a, i) => (
            <View key={a.id} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{dash(a.part_number)}</Text>
              <Text style={[S.sCell, { flex: 2.5 }]}>{dash(a.description)}</Text>
              <Text style={[S.sCell, { flex: 0.5, textAlign: "right" }]}>{a.qty}</Text>
              <Text style={[S.sCell, { flex: 0.8 }]}>{dash(a.handed)}</Text>
              <Text style={[S.sCell, { flex: 1.5 }]}>{dash(a.room)}</Text>
              <Text style={[S.sCellMu, { flex: 2 }]}>{dash(a.notes)}</Text>
            </View>
          ))}
        </>
      )}

      <PageFooter data={data} />
    </Page>
  );
}


// Appliances page
function AppliancesPage({ data }: { data: SpecPDFData }) {
  const apps = data.spec_appliances_list ?? [];
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="AP.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 8 }}>
        APPLIANCES & PLUMBING
      </Text>
      {apps.length === 0 ? (
        <Text style={S.empty}>No appliances specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Manufacturer</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Model #</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Notes</Text>
          </View>
          {apps.map((a, i) => (
            <View key={a.id} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{a.appliance_type}</Text>
              <Text style={[S.sCell, { flex: 1.5 }]}>{dash(a.manufacturer)}</Text>
              <Text style={[S.sCell, { flex: 2 }]}>{dash(a.model_no)}</Text>
              <Text style={[S.sCell, { flex: 1.5 }]}>{dash(a.room_name)}</Text>
              <Text style={[S.sCellMu, { flex: 2 }]}>{dash(a.notes)}</Text>
            </View>
          ))}
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// ─── F.1  Consolidated Finish Schedule (all finish groups on one page) ────────

function ConsolidatedFinishPage({ data }: { data: SpecPDFData }) {
  const fgs = data.finish_groups;

  type RowDef = { label: string; getValue: (fg: FinishGroupView) => string };
  const ROW_DEFS: RowDef[] = [
    { label: "Finish Type",  getValue: (fg) => fg.finish_type ? (fg.finish_type.charAt(0).toUpperCase() + fg.finish_type.slice(1)) : "\u2014" },
    { label: "Color/Stain", getValue: (fg) => fg.finish.stain_name || fg.finish.paint_name || "\u2014" },
    { label: "Glaze",       getValue: (fg) => fg.finish.glaze_name || "\u2014" },
    { label: "Topcoat",     getValue: (fg) => fg.finish.topcoat_name || "\u2014" },
    { label: "Sheen",       getValue: (fg) => fg.finish.sheen_name || "\u2014" },
    { label: "Species",     getValue: (fg) => fg.species || "\u2014" },
    { label: "Carcass Ext", getValue: (fg) => fg.materials.find(m => m.role === "cab_ext")?.name || "\u2014" },
    { label: "Carcass Int", getValue: (fg) => fg.materials.find(m => m.role === "cab_int")?.name || "\u2014" },
    { label: "Drawer Box",  getValue: (fg) => fg.drawers.find(d => d.role === "drawer_box")?.drawer_box_name || "\u2014" },
    { label: "Door Style",  getValue: (fg) => fg.door_fronts.find(d => d.role === "base")?.style_name || "\u2014" },
    { label: "Edgebands",   getValue: (fg) => fg.edgebands.map(e => e.code).join(" / ") || "\u2014" },
    { label: "Pulls",       getValue: (fg) => { const pulls = (data.finish_group_pulls ?? {})[fg.id] ?? []; return pulls.map((p: FGPullRow) => p.description || p.part_no).filter(Boolean).join(", ") || "\u2014"; } },
  ];

  const labelFlex = 1.3;
  const fgFlex = 1;

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="F.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 8 }}>
        FINISH SCHEDULE
      </Text>
      {fgs.length === 0 ? (
        <Text style={S.empty}>No finish groups defined.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: labelFlex }]}>Attribute</Text>
            {fgs.map(fg => (
              <Text key={fg.id} style={[S.colHdrTx, { flex: fgFlex, textAlign: "center" }]}>{fg.label}</Text>
            ))}
          </View>
          {ROW_DEFS.map(({ label, getValue }, ri) => (
            <View key={label} style={ri % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: labelFlex, fontFamily: "Helvetica-Bold", color: MUTED, fontSize: 6, letterSpacing: 0.3 }]}>
                {label.toUpperCase()}
              </Text>
              {fgs.map(fg => (
                <Text key={fg.id} style={[S.sCell, { flex: fgFlex, textAlign: "center" }]}>{getValue(fg)}</Text>
              ))}
            </View>
          ))}
          {fgs.some(fg => cleanNotes(fg.notes)) && (
            <View style={{ marginTop: 8 }}>
              <Band title="Notes" />
              {fgs.filter(fg => cleanNotes(fg.notes)).map(fg => (
                <View key={fg.id} style={[S.notesBox, { marginBottom: 3 }]}>
                  <Text style={S.notesLabel}>{fg.label}</Text>
                  <Text style={S.notesBody}>{cleanNotes(fg.notes)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// ─── EB.1  Edgeband Schedule (consolidated across all finish groups) ──────────

function EdgebandSchedulePage({ data }: { data: SpecPDFData }) {
  const bandMap = new Map<string, { eb: EdgebandView; fgLabels: string[] }>();
  for (const fg of data.finish_groups) {
    for (const eb of fg.edgebands) {
      const key = eb.code || eb.edgeband_name;
      if (!bandMap.has(key)) {
        bandMap.set(key, { eb, fgLabels: [fg.label] });
      } else {
        const entry = bandMap.get(key)!;
        if (!entry.fgLabels.includes(fg.label)) entry.fgLabels.push(fg.label);
      }
    }
  }
  const bands = Array.from(bandMap.values()).sort((a, b) => a.eb.code.localeCompare(b.eb.code));

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="EB.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 3 }}>
        EDGEBAND SCHEDULE
      </Text>
      <Text style={{ fontSize: 7, color: "#cc0000", fontFamily: "Helvetica-Bold", marginBottom: 8 }}>
        Letter IDs are machine positions — verify before ordering. One wrong ID = full job redo.
      </Text>
      {bands.length === 0 ? (
        <Text style={S.empty}>No edgebands specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 0.35 }]}>ID</Text>
            <Text style={[S.colHdrTx, { flex: 0.7 }]}>Thick</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Supplier</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Description</Text>
            <Text style={[S.colHdrTx, { flex: 2.2 }]}>Where Used</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Finish Groups</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Notes</Text>
          </View>
          {bands.map(({ eb, fgLabels }, i) => (
            <View key={eb.code || i} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 0.35, fontFamily: "Helvetica-Bold", fontSize: 10, color: ORANGE }]}>{eb.code}</Text>
              <Text style={[S.sCell, { flex: 0.7 }]}>{dash(eb.thickness)}</Text>
              <Text style={[S.sCell, { flex: 1.5 }]}>{dash(eb.supplier)}</Text>
              <Text style={[S.sCell, { flex: 2.5 }]}>{dash(eb.edgeband_name)}</Text>
              <Text style={[S.sCell, { flex: 2.2 }]}>{dash(eb.where_used_label)}</Text>
              <Text style={[S.sCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{fgLabels.join(", ")}</Text>
              <Text style={[S.sCellMu, { flex: 1.5 }]}>{dash(eb.notes)}</Text>
            </View>
          ))}
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// ─── T.1  Trim & Moldings Rollup ─────────────────────────────────────────────

function TrimRollupPage({ data }: { data: SpecPDFData }) {
  const allTrim: (RoomTrimEntry & { room_name: string })[] = [];
  for (const room of data.rooms) {
    const entries = (data.room_trim ?? {})[room.id] ?? [];
    for (const t of entries) {
      allTrim.push({ ...t, room_name: room.name || "\u2014" });
    }
  }
  allTrim.sort((a, b) => (a.trim_type || "").localeCompare(b.trim_type || ""));

  const typeMap = new Map<string, number>();
  for (const t of allTrim) {
    typeMap.set(t.trim_type, (typeMap.get(t.trim_type) ?? 0) + (Number(t.qty_lf) || 0));
  }
  const totals = Array.from(typeMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="T.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 8 }}>
        TRIM & MOLDINGS SCHEDULE
      </Text>
      {allTrim.length === 0 ? (
        <Text style={S.empty}>No trim callouts specified.</Text>
      ) : (
        <>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Size</Text>
            <Text style={[S.colHdrTx, { flex: 0.7, textAlign: "right" }]}>LF</Text>
            <Text style={[S.colHdrTx, { flex: 3.5 }]}>Notes</Text>
          </View>
          {allTrim.map((t, i) => (
            <View key={t.id} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
              <Text style={[S.sCell, { flex: 1.5, fontFamily: "Helvetica-Bold" }]}>{t.trim_type || "\u2014"}</Text>
              <Text style={[S.sCell, { flex: 2.5 }]}>{t.room_name}</Text>
              <Text style={[S.sCell, { flex: 1.2 }]}>{dash(t.size_desc)}</Text>
              <Text style={[S.sCell, { flex: 0.7, textAlign: "right" }]}>{t.qty_lf || ""}</Text>
              <Text style={[S.sCellMu, { flex: 3.5 }]}>{dash(t.notes)}</Text>
            </View>
          ))}
          <View style={{ marginTop: 12 }}>
            <Band title="Totals by Type" />
            <View style={S.colHdr}>
              <Text style={[S.colHdrTx, { flex: 4 }]}>Type</Text>
              <Text style={[S.colHdrTx, { flex: 1, textAlign: "right" }]}>Total LF</Text>
            </View>
            {totals.map(([type, lf], i) => (
              <View key={type} style={i % 2 === 0 ? S.sRow : S.sRowAlt}>
                <Text style={[S.sCell, { flex: 4, fontFamily: "Helvetica-Bold" }]}>{type}</Text>
                <Text style={[S.sCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{lf}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// Main exported renderer

export function renderSpecPDF(data: SpecPDFData): React.ReactElement {
  const hasNotes = !!(cleanNotes(data.notes_install) || cleanNotes(data.notes_finishing) || cleanNotes(data.notes_shop) || cleanNotes(data.notes_client));
  const hasAccessories = (data.spec_pulls?.length ?? 0) > 0 || (data.spec_accessories?.length ?? 0) > 0;
  const hasAppliances = (data.spec_appliances_list?.length ?? 0) > 0;
  const hasEdgebands = data.finish_groups.some(fg => fg.edgebands.length > 0);
  const hasTrim = data.rooms.some(r => ((data.room_trim ?? {})[r.id]?.length ?? 0) > 0);
  return (
    <Document>
      {/* Sheet 1: Finish Schedule — all finish groups in one matrix */}
      <ConsolidatedFinishPage data={data} />
      {/* Sheet 2: Room Schedule — 3-column (room | FG | notes) */}
      <RoomMatrixPage data={data} />
      {/* Sheet 3: Edgeband Schedule — consolidated, machine-position IDs */}
      {hasEdgebands && <EdgebandSchedulePage data={data} />}
      {/* Sheet 4: Trim & Moldings — detail + totals by type */}
      {hasTrim && <TrimRollupPage data={data} />}
      {/* Sheet 5: Appliances & Plumbing */}
      {hasAppliances && <AppliancesPage data={data} />}
      {/* Accessories (when present) */}
      {hasAccessories && <AccessoriesPage data={data} />}
      {/* Notes (when present) */}
      {hasNotes && <NotesPage data={data} />}
    </Document>
  );
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}
