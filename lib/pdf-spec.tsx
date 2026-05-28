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
  id: string; label: string; finish_type: string; notes: string;
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
};

// ─── XLSX fixed-row definitions ───────────────────────────────────────────────

const MATERIAL_ROLES: { role: string; label: string }[] = [
  { role: "cab_ext",  label: "Cabinet Exterior" },
  { role: "cab_int",  label: "Cabinet Interior" },
  { role: "cab_ext2", label: "Cab Exterior 2" },
  { role: "cab_int2", label: "Cab Interior 2" },
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
  sRow:    { flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  sRowAlt: { flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  sCell:   { fontSize: 7, color: DARK },
  sCellMu: { fontSize: 7, color: MUTED, fontStyle: "italic" },

  // ── Key-value rows (Finish schedule, Countertop fields) ──
  kvRow:   { flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  kvRowAlt:{ flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  kvLabel: { width: 72, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.4, textTransform: "uppercase" },
  kvVal:   { flex: 1, fontSize: 7.5, color: DARK },

  // ── Notes box ──
  notesBox:  { borderWidth: 0.4, borderColor: HAIR, backgroundColor: STRIPE, padding: 5, marginTop: 3 },
  notesLabel:{ fontSize: 6, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  notesBody: { fontSize: 7, color: DARK, lineHeight: 1.4 },

  // ── Room matrix ──
  matrixHdr: { flexDirection: "row", backgroundColor: HEAD_BG, paddingHorizontal: 3, paddingVertical: 3 },
  matrixRow: { flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  matrixRowAlt:{ flexDirection: "row", paddingHorizontal: 3, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
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

const stageMap: Record<string, string> = {
  F: "FINISH", R: "ROOMS", N: "NOTES",
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
          {data.pm           && <Text style={S.tbRight}>PM: {data.pm}</Text>}
          {data.builder_name && <Text style={S.tbRight}>Builder: {data.builder_name}</Text>}
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
        <Text style={S.hLabel}>Finish Group</Text>
        <Text style={S.hVal}>{fg.label}</Text>
      </View>
      <View style={[S.hCellLast, { flex: 3 }]}>
        <Text style={S.hLabel}>Notes</Text>
        <Text style={[S.hVal, { fontSize: 7 }]} numberOfLines={3}>{fg.notes || "—"}</Text>
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
        <Text style={[S.colHdrTx, { flex: 1.4 }]}>Type</Text>
        <Text style={[S.colHdrTx, { flex: 1.6 }]}>Style</Text>
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
            <Text style={[S.sCell, { flex: 1.4, fontFamily: "Helvetica-Bold" }]}>{label}</Text>
            <Text style={[S.sCell, { flex: 1.6 }]}>{dash(d?.style_name)}</Text>
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

function FinishSchedule({ fg }: { fg: FinishGroupView }) {
  const rows = [
    { label: "Stain",   value: fg.finish.stain_name },
    { label: "Paint",   value: fg.finish.paint_name },
    { label: "Glaze",   value: fg.finish.glaze_name },
    { label: "Finish",  value: fg.finish.topcoat_name },
    { label: "Sheen",   value: fg.finish.sheen_name },
  ];
  return (
    <>
      <Band title="Finish Schedule" right={fg.finish_type} />
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
        {/* Right column: Finish / Moldings / Countertops */}
        <View style={S.colRight}>
          <FinishSchedule fg={fg} />
          <MoldingsSchedule fg={fg} />
          <CountertopsSchedule fg={fg} />
        </View>
      </View>
      <PageFooter data={data} />
    </Page>
  );
}

// Room matrix page

function RoomMatrixPage({ data }: { data: SpecPDFData }) {
  const address = [data.site_address, data.city].filter(Boolean).join(", ");
  const fgs = data.finish_groups;
  const rooms = data.rooms;
  const fgFlex = 0.8;
  const roomFlex = 2;

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="R.1" />
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 2 }}>
        ROOM SCHEDULE
      </Text>
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>{address}</Text>
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
      {rooms.length === 0 ? (
        <Text style={S.empty}>No rooms added.</Text>
      ) : (
        <>
          <View style={S.matrixHdr}>
            <Text style={[S.matrixHdrTx, { flex: roomFlex }]}>Room</Text>
            {fgs.map((fg) => (
              <Text key={fg.id} style={[S.matrixHdrTx, { flex: fgFlex, textAlign: "center" }]} numberOfLines={2}>
                {fg.label}
              </Text>
            ))}
          </View>
          {rooms.map((room, ri) => {
            const assignedFgIds = new Set(room.finishes.map(f => f.finish_group_id));
            return (
              <View key={room.id} style={ri % 2 === 0 ? S.matrixRow : S.matrixRowAlt}>
                <Text style={[S.matrixRoomCell, { flex: roomFlex }]}>{room.name || "—"}</Text>
                {fgs.map((fg) => (
                  <Text key={fg.id} style={[S.matrixCell, {
                    flex: fgFlex,
                    color: assignedFgIds.has(fg.id) ? "#1a7a1a" : HAIR,
                  }]}>
                    {assignedFgIds.has(fg.id) ? "✓" : "—"}
                  </Text>
                ))}
              </View>
            );
          })}
        </>
      )}
      <PageFooter data={data} />
    </Page>
  );
}

// Notes page

function NotesPage({ data }: { data: SpecPDFData }) {
  const sections = [
    { label: "Install Notes",   body: data.notes_install },
    { label: "Finishing Notes", body: data.notes_finishing },
    { label: "Shop Notes",      body: data.notes_shop },
    { label: "Client Notes",    body: data.notes_client },
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

// Main exported renderer

export function renderSpecPDF(data: SpecPDFData): React.ReactElement {
  const hasNotes = !!(data.notes_install || data.notes_finishing || data.notes_shop || data.notes_client);
  return (
    <Document>
      {data.finish_groups.map((fg, i) => (
        <FinishGroupPage key={fg.id} data={data} fg={fg} idx={i} />
      ))}
      <RoomMatrixPage data={data} />
      {hasNotes && <NotesPage data={data} />}
    </Document>
  );
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}
