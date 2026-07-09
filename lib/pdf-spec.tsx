/**
 * PDF generator for residential cabinet specs.
 * Rebuilt 2026-07-08 — new 4-page layout.
 *
 * Page 1 (F.1):  Finish Schedule (FG-as-rows) + Room Schedule
 * Page 2 (A.1):  Accessories + Moldings (by FG) + Edgebanding (by FG)
 * Page 3 (AP.1): Appliances + Hardware
 * Page 4 (N.1):  Notes (conditional)
 */
import React from "react";
import {
  Document, Page, View, Text, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinishView = {
  stain_name: string; paint_name: string; glaze_name: string;
  topcoat_name: string; sheen_name: string;
};
export type MaterialView = { role: string; role_label: string; name: string; where_used: string; notes: string };
export type DoorFrontView = { role: string; role_label: string; slot_label: string; style_name: string; material_name: string; oe_name: string; ie_name: string; panel_name: string; grain: string; vendor: string; notes: string };
export type DrawerView = { role: string; role_label: string; slot_label: string; drawer_box_name: string; slides_name: string; notes: string };
export type EdgebandView = { code: string; edgeband_name: string; supplier: string; thickness: string; where_used_label: string; notes: string };
export type HardwareView = { role: string; role_label: string; slot_label: string; hardware_name: string; brand: string; qty: number | null; location: string; vendor: string; notes: string };
export type CountertopView = { location: string; style_name: string; edge_name: string; splash_style: string; splash_edge_name: string; material_name: string; buildup_in: number | null; core_substrate: string; brackets: string; notes: string };
export type MoldingView = { molding_type: string; type_label: string; profile_name: string; size_in: number | null; material_name: string; qty_lf: number | null; where_used: string[]; notes: string };

export type FinishGroupView = {
  id: string; label: string; finish_type: string; notes: string; species: string;
  applied_panels: string | null;
  rollout_box_name: string;
  finish: FinishView;
  materials: MaterialView[];
  door_fronts: DoorFrontView[];
  drawers: DrawerView[];
  edgebands: EdgebandView[];
  hardware: HardwareView[];
  countertops: CountertopView[];
  moldings: MoldingView[];
};

export type RoomFinishView = { finish_group_id: string; finish_label: string; zone: string };
export type RoomView = {
  id: string; name: string; notes: string;
  finishes: RoomFinishView[];
  accessories: { name: string; brand: string; qty: number }[];
};

export type AccessoryRollupRow = { name: string; brand: string; total_qty: number; rooms: string[] };
export type MoldingRollupRow = { type_label: string; profile_name: string; size_in: number | null; material_name: string; total_lf: number; finishes: string[] };

export type SpecPullRow = { id: string; make: string; model: string; size: string; room: string; notes: string; qty: number };
export type SpecAccessoryRow = { id: string; type: string; part_number: string; description: string; qty: number; handed: string; room: string; size: string; notes: string };
export type SpecHardwareRow = { id: string; type: string; part_no: string; room: string; qty: number; notes: string };
export type FGPullRow = { id: string; description: string; part_no: string; finish_color: string; where_used: string; qty: number; sort_order: number };

export type RoomTrimEntry = { id: string; room_id: string; trim_type: string; size_desc: string; material: string; qty_lf: number; notes: string; sort_order: number };
export type ApplianceEntry = { id: string; appliance_type: string; manufacturer: string; model_no: string; room_name: string; notes: string; cutout_w: number | null; cutout_h: number | null; cutout_d: number | null; sort_order: number };


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
  job_id: string; spec_name: string; generated_at: string;
  client_name: string; client_email: string | null;
  builder_name: string | null; builder_company: string | null;
  pm: string | null; site_address: string; city: string | null;
  delivery_date: string | null;
  notes_install: string | null; notes_finishing: string | null;
  notes_shop: string | null; notes_client: string | null;
  job_notes: string | null;
  lifecycle_state?: string | null;
  finish_groups: FinishGroupView[];
  rooms: RoomView[];
  accessories_rollup: AccessoryRollupRow[];
  moldings_rollup: MoldingRollupRow[];
  spec_pulls: SpecPullRow[];
  spec_accessories: SpecAccessoryRow[];
  spec_hardware: SpecHardwareRow[];
  finish_group_pulls: Record<string, FGPullRow[]>;
  room_trim: Record<string, RoomTrimEntry[]>;
  spec_appliances_list: ApplianceEntry[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ORANGE  = "#f08122";
const DARK    = "#1a1a1a";
const MUTED   = "#888";
const HAIR    = "#e0e0e0";
const HEAD_BG = "#3d3d3d";
const STRIPE  = "#f7f7f5";
const BAND_BG = "#f0ede8";

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Landscape LETTER. paddingTop must clear the fixed title block (~88pt).
  page: { paddingTop: 92, paddingBottom: 36, paddingLeft: 24, paddingRight: 24, fontSize: 7, fontFamily: "Helvetica", color: DARK },

  // ── Title block (fixed, absolute, top of every page) ──
  tbWrap:     { position: "absolute", top: 10, left: 20, right: 20 },
  tbTopRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 2 },
  tbLeft:     { flex: 1 },
  tbBrand:    { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", letterSpacing: 0.8 },
  tbStageRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  tbStage:    { fontSize: 7, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 1.5, marginRight: 6 },
  tbCover:    { fontSize: 6.5, color: MUTED, letterSpacing: 0.8 },
  tbProject:  { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 1 },
  tbRight:    { fontSize: 6.5, color: "#444", textAlign: "right", lineHeight: 1.3 },
  tbAddrRow:  { borderTopWidth: 0.5, borderTopColor: "#bbb", marginTop: 2, paddingTop: 2, fontSize: 6, color: MUTED, textAlign: "center" },
  tbBanner:   { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.4, borderTopColor: HAIR, borderBottomWidth: 1.5, borderBottomColor: ORANGE, marginTop: 2, paddingVertical: 2 },
  tbBnrLeft:  { fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.4 },
  tbBnrRight: { fontSize: 6.5, color: MUTED, letterSpacing: 0.8 },

  // ── Footer ──
  footer:    { position: "absolute", bottom: 10, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between" },
  footerTxt: { fontSize: 6, color: "#aaa" },

  // ── Section heading ──
  secHead: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 6, marginTop: 4 },

  // ── Table ──
  colHdr:   { flexDirection: "row", backgroundColor: HEAD_BG },
  colHdrTx: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.3, padding: 4 },
  row:      { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR },
  rowAlt:   { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  cell:     { fontSize: 7, color: DARK, padding: 4, flexWrap: "wrap" },
  cellMu:   { fontSize: 7, color: MUTED, fontStyle: "italic", padding: 4 },

  // ── FG group header band (for Moldings / Edgebands) ──
  fgBand:   { backgroundColor: BAND_BG, borderBottomWidth: 0.8, borderBottomColor: ORANGE, paddingHorizontal: 5, paddingVertical: 3, marginTop: 6 },
  fgBandTx: { fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.8, textTransform: "uppercase" },

  // ── Notes box ──
  notesBox: { borderWidth: 0.5, borderColor: HAIR, borderRadius: 2, padding: 5, marginBottom: 4 },
  notesLbl: { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  notesBody:{ fontSize: 7, color: DARK, lineHeight: 1.4 },
  // ── DRAFT watermark ──
  draftWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: 0.08 },
  draftTx:   { fontSize: 120, fontFamily: "Helvetica-Bold", color: "#cc0000", transform: "rotate(-35deg)", letterSpacing: 20 },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const d = (s: string | number | null | undefined) =>
  (s === null || s === undefined || String(s).trim() === "") ? "—" : String(s);

function cleanNotes(s: string | null | undefined): string {
  if (!s) return "";
  if (s.startsWith("Auto-seeded from builder profile:")) return "";
  return s.trim();
}

function fmtAppliedPanels(v: string | null | undefined): string {
  if (!v || v === "slab") return "Slab";
  if (v === "match_door") return "Match Door";
  return v;
}

const stageMap: Record<string, string> = {
  F: "FINISH", A: "ACC & MOLDINGS", AP: "APPLIANCES", N: "NOTES",
};

// ─── Shared components ────────────────────────────────────────────────────────

function DraftWatermark() {
  return (
    <View style={S.draftWrap} fixed>
      <Text style={S.draftTx}>DRAFT</Text>
    </View>
  );
}

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
  const dt = new Date(data.generated_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ver = `v.${String(dt.getFullYear()).slice(2)}${pad(dt.getMonth()+1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}`;
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerTxt}>
        {[data.spec_name, data.job_id, `Generated ${dt.toLocaleString()}`, ver].filter(Boolean).join("  ·  ")}
      </Text>
      <Text style={S.footerTxt} render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─── Page 1: Finish Schedule + Room Schedule ──────────────────────────────────

function FinishSchedulePage({ data }: { data: SpecPDFData }) {
  const fgs = data.finish_groups;
  const fgPulls = data.finish_group_pulls ?? {};

  // Column flex widths
  const COL = { fg: 0.9, color: 1.6, species: 0.9, carcass: 1.3, drawerBox: 1.3, rolloutBox: 1.3, doorStyle: 1.5, appliedPanels: 0.9, pulls: 2.2, notes: 1.6 };

  const isDraft = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraft && <DraftWatermark />}
      <TitleBlock data={data} code="F.1" />

      {/* FINISH SCHEDULE */}
      <Text style={S.secHead}>FINISH SCHEDULE</Text>
      {fgs.length === 0 ? (
        <Text style={[S.cellMu, { marginBottom: 12 }]}>No finish groups defined.</Text>
      ) : (
        <View style={{ marginBottom: 16 }}>
          {/* Header */}
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: COL.fg }]}>Finish Group</Text>
            <Text style={[S.colHdrTx, { flex: COL.color }]}>Color</Text>
            <Text style={[S.colHdrTx, { flex: COL.species }]}>Species</Text>
            <Text style={[S.colHdrTx, { flex: COL.carcass }]}>Carcass</Text>
            <Text style={[S.colHdrTx, { flex: COL.drawerBox }]}>Drawer Box</Text>
            <Text style={[S.colHdrTx, { flex: COL.rolloutBox }]}>Rollout Box</Text>
            <Text style={[S.colHdrTx, { flex: COL.doorStyle }]}>Door Style</Text>
            <Text style={[S.colHdrTx, { flex: COL.appliedPanels }]}>Applied Panels</Text>
            <Text style={[S.colHdrTx, { flex: COL.pulls }]}>Pulls</Text>
            <Text style={[S.colHdrTx, { flex: COL.notes }]}>Notes</Text>
          </View>
          {fgs.map((fg, fi) => {
            const pulls = fgPulls[fg.id] ?? [];
            const colorName = fg.finish.stain_name || fg.finish.paint_name || "";
            const carcass = fg.materials.find(m => m.role === "cab_ext")?.name ?? "";
            const drawerBox = fg.drawers.find(d2 => d2.role === "drawer_box")?.drawer_box_name ?? "";
            const doorStyle = fg.door_fronts.find(d2 => d2.role === "base")?.style_name ?? "";
            const rowStyle = fi % 2 === 0 ? S.row : S.rowAlt;
            const pullLines = pulls.length === 0 ? ["—"] : pulls.map(p => {
              const parts = [p.description, p.where_used ? `(${p.where_used})` : ""].filter(Boolean);
              return parts.join(" ");
            });
            return (
              <View key={fg.id} style={rowStyle} wrap={false}>
                <Text style={[S.cell, { flex: COL.fg, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{fg.label}</Text>
                <Text style={[S.cell, { flex: COL.color }]}>{d(colorName)}</Text>
                <Text style={[S.cell, { flex: COL.species }]}>{d(fg.species)}</Text>
                <Text style={[S.cell, { flex: COL.carcass }]}>{d(carcass)}</Text>
                <Text style={[S.cell, { flex: COL.drawerBox }]}>{d(drawerBox)}</Text>
                <Text style={[S.cell, { flex: COL.rolloutBox }]}>{d(fg.rollout_box_name) === "—" ? d(drawerBox) : d(fg.rollout_box_name)}</Text>
                <Text style={[S.cell, { flex: COL.doorStyle }]}>{d(doorStyle)}</Text>
                <Text style={[S.cell, { flex: COL.appliedPanels }]}>{fmtAppliedPanels(fg.applied_panels)}</Text>
                <View style={{ flex: COL.pulls, padding: 4 }}>
                  {pullLines.map((line, li) => (
                    <Text key={li} style={[{ fontSize: 7, color: DARK }, li > 0 && { borderTopWidth: 0.3, borderTopColor: HAIR, marginTop: 2, paddingTop: 2 }]}>{line}</Text>
                  ))}
                </View>
                <Text style={[S.cellMu, { flex: COL.notes }]}>{d(fg.notes)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ROOM SCHEDULE */}
      <Text style={S.secHead}>ROOM SCHEDULE</Text>
      {data.site_address && (
        <Text style={{ fontSize: 7, color: MUTED, marginBottom: 6 }}>{data.site_address}{data.city ? `, ${data.city}` : ""}</Text>
      )}
      {data.rooms.length === 0 ? (
        <Text style={S.cellMu}>No rooms added.</Text>
      ) : (
        <View>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>FG</Text>
            <Text style={[S.colHdrTx, { flex: 4.7 }]}>Zone / Notes</Text>
          </View>
          {data.rooms.map((room, ri) => {
            const fgText = room.finishes.length > 0
              ? room.finishes.map(f => f.finish_label || "?").join(", ")
              : "—";
            const zones = room.finishes.map(f => f.zone).filter(Boolean).join("; ");
            return (
              <View key={room.id} style={ri % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                <Text style={[S.cell, { flex: 2, fontFamily: "Helvetica-Bold" }]}>{room.name || "—"}</Text>
                <Text style={[S.cell, { flex: 0.8, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{fgText}</Text>
                <Text style={[S.cellMu, { flex: 4.7 }]}>{zones || "—"}</Text>
              </View>
            );
          })}
        </View>
      )}

      <PageFooter data={data} />
    </Page>
  );
}

// ─── Page 2: Accessories + Moldings + Edgebanding ────────────────────────────

function AccessoriesMoldingsPage({ data }: { data: SpecPDFData }) {
  const accs = data.spec_accessories ?? [];
  const fgs  = data.finish_groups;

  // Flatten moldings per FG for display
  type MoldingDisplay = { fgLabel: string; type_label: string; size_in: number | null; qty_lf: number | null; notes: string };
  const moldingsByFG: Map<string, MoldingDisplay[]> = new Map();
  for (const fg of fgs) {
    const rows = fg.moldings.filter(m => m.qty_lf || m.type_label);
    if (rows.length > 0) {
      moldingsByFG.set(fg.id, rows.map(m => ({ fgLabel: fg.label, type_label: m.type_label || m.molding_type, size_in: m.size_in, qty_lf: m.qty_lf, notes: m.notes })));
    }
  }

  // Edgebands per FG
  const ebByFG: Map<string, { fg: FinishGroupView; ebs: EdgebandView[] }> = new Map();
  for (const fg of fgs) {
    if (fg.edgebands.length > 0) ebByFG.set(fg.id, { fg, ebs: fg.edgebands });
  }

  const isDraftA = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraftA && <DraftWatermark />}
      <TitleBlock data={data} code="A.1" />

      {/* ACCESSORIES */}
      <Text style={S.secHead}>ACCESSORIES</Text>
      {accs.length === 0 ? (
        <Text style={[S.cellMu, { marginBottom: 12 }]}>No accessories specified.</Text>
      ) : (
        <View style={{ marginBottom: 16 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Part #</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 1 }]}>Size</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Notes</Text>
          </View>
          {accs.map((a, ai) => (
            <View key={a.id} style={ai % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, { flex: 2, fontFamily: "Helvetica-Bold" }]}>{d(a.type)}</Text>
              <Text style={[S.cell, { flex: 1.5 }]}>{d(a.part_number)}</Text>
              <Text style={[S.cell, { flex: 2 }]}>{d(a.room)}</Text>
              <Text style={[S.cell, { flex: 1 }]}>{d(a.size)}</Text>
              <Text style={[S.cellMu, { flex: 2.5 }]}>{d(a.notes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* MOLDINGS */}
      {moldingsByFG.size > 0 && (
        <>
          <Text style={S.secHead}>MOLDINGS</Text>
          {Array.from(moldingsByFG.entries()).map(([fgId, rows]) => {
            const fg = fgs.find(f => f.id === fgId)!;
            const colorName = fg.finish.stain_name || fg.finish.paint_name || "";
            return (
              <View key={fgId} style={{ marginBottom: 8 }}>
                <View style={S.fgBand}>
                  <Text style={S.fgBandTx}>{fg.label}{colorName ? `  ·  ${colorName}` : ""}</Text>
                </View>
                <View style={S.colHdr}>
                  <Text style={[S.colHdrTx, { flex: 2 }]}>Type</Text>
                  <Text style={[S.colHdrTx, { flex: 1 }]}>Size</Text>
                  <Text style={[S.colHdrTx, { flex: 0.8 }]}>Qty (LF)</Text>
                  <Text style={[S.colHdrTx, { flex: 3 }]}>Notes</Text>
                </View>
                {rows.map((m, mi) => (
                  <View key={mi} style={mi % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                    <Text style={[S.cell, { flex: 2, fontFamily: "Helvetica-Bold" }]}>{d(m.type_label)}</Text>
                    <Text style={[S.cell, { flex: 1 }]}>{m.size_in ? `${m.size_in}"` : "—"}</Text>
                    <Text style={[S.cell, { flex: 0.8 }]}>{m.qty_lf ?? "—"}</Text>
                    <Text style={[S.cellMu, { flex: 3 }]}>{d(m.notes)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </>
      )}

      {/* EDGEBANDING */}
      {ebByFG.size > 0 && (
        <>
          <Text style={[S.secHead, { marginTop: 8 }]}>EDGEBANDING</Text>
          {Array.from(ebByFG.values()).map(({ fg, ebs }) => {
            const colorName = fg.finish.stain_name || fg.finish.paint_name || "";
            return (
              <View key={fg.id} style={{ marginBottom: 8 }}>
                <View style={S.fgBand}>
                  <Text style={S.fgBandTx}>{fg.label}{colorName ? `  ·  ${colorName}` : ""}</Text>
                </View>
                <View style={S.colHdr}>
                  <Text style={[S.colHdrTx, { flex: 0.4 }]}>ID</Text>
                  <Text style={[S.colHdrTx, { flex: 0.7 }]}>Thick</Text>
                  <Text style={[S.colHdrTx, { flex: 1.5 }]}>Supplier</Text>
                  <Text style={[S.colHdrTx, { flex: 2.5 }]}>Description</Text>
                  <Text style={[S.colHdrTx, { flex: 2.5 }]}>Where Used</Text>
                  <Text style={[S.colHdrTx, { flex: 1.5 }]}>Notes</Text>
                </View>
                {ebs.map((eb, ei) => (
                  <View key={ei} style={ei % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                    <Text style={[S.cell, { flex: 0.4, fontFamily: "Helvetica-Bold", fontSize: 9, color: ORANGE }]}>{eb.code}</Text>
                    <Text style={[S.cell, { flex: 0.7 }]}>{d(eb.thickness)}</Text>
                    <Text style={[S.cell, { flex: 1.5 }]}>{d(eb.supplier)}</Text>
                    <Text style={[S.cell, { flex: 2.5 }]}>{d(eb.edgeband_name)}</Text>
                    <Text style={[S.cell, { flex: 2.5 }]}>{d(eb.where_used_label)}</Text>
                    <Text style={[S.cellMu, { flex: 1.5 }]}>{d(eb.notes)}</Text>
                  </View>
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

// ─── Page 3: Appliances + Hardware ───────────────────────────────────────────

function AppliancesHardwarePage({ data }: { data: SpecPDFData }) {
  const apps = data.spec_appliances_list ?? [];
  const hw   = data.spec_hardware ?? [];
  const isDraftAP = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraftAP && <DraftWatermark />}
      <TitleBlock data={data} code="AP.1" />

      {/* APPLIANCES */}
      <Text style={S.secHead}>APPLIANCES &amp; PLUMBING</Text>
      {apps.length === 0 ? (
        <Text style={[S.cellMu, { marginBottom: 12 }]}>No appliances specified.</Text>
      ) : (
        <View style={{ marginBottom: 16 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Manufacturer</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Model #</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 1.8 }]}>Cutout W×H×D″</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Notes</Text>
          </View>
          {apps.map((a, ai) => {
            const cutout = (a.cutout_w && a.cutout_h && a.cutout_d)
              ? `${a.cutout_w} × ${a.cutout_h} × ${a.cutout_d}`
              : "—";
            return (
              <View key={a.id} style={ai % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                <Text style={[S.cell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{a.appliance_type}</Text>
                <Text style={[S.cell, { flex: 1.5 }]}>{d(a.manufacturer)}</Text>
                <Text style={[S.cell, { flex: 2 }]}>{d(a.model_no)}</Text>
                <Text style={[S.cell, { flex: 1.5 }]}>{d(a.room_name)}</Text>
                <Text style={[S.cell, { flex: 1.8 }]}>{cutout}</Text>
                <Text style={[S.cellMu, { flex: 2 }]}>{d(a.notes)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* HARDWARE */}
      <Text style={[S.secHead, { marginTop: 4 }]}>HARDWARE</Text>
      {hw.length === 0 ? (
        <Text style={S.cellMu}>No hardware specified.</Text>
      ) : (
        <View>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Part #</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Room</Text>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>Qty</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Notes</Text>
          </View>
          {hw.map((h, hi) => (
            <View key={h.id} style={hi % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, { flex: 2, fontFamily: "Helvetica-Bold" }]}>{d(h.type)}</Text>
              <Text style={[S.cell, { flex: 1.5 }]}>{d(h.part_no)}</Text>
              <Text style={[S.cell, { flex: 2 }]}>{d(h.room)}</Text>
              <Text style={[S.cell, { flex: 0.8 }]}>{h.qty || "—"}</Text>
              <Text style={[S.cellMu, { flex: 2.5 }]}>{d(h.notes)}</Text>
            </View>
          ))}
        </View>
      )}

      <PageFooter data={data} />
    </Page>
  );
}

// ─── Page 4: Notes ───────────────────────────────────────────────────────────

function NotesPage({ data }: { data: SpecPDFData }) {
  const sections = [
    { label: "Install Notes",   body: cleanNotes(data.notes_install) },
    { label: "Finishing Notes", body: cleanNotes(data.notes_finishing) },
    { label: "Shop Notes",      body: cleanNotes(data.notes_shop) },
    { label: "Client Notes",    body: cleanNotes(data.notes_client) },
  ].filter(s => s.body);

  const isDraftN = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraftN && <DraftWatermark />}
      <TitleBlock data={data} code="N.1" />
      <Text style={S.secHead}>NOTES</Text>
      {sections.map(({ label, body }) => (
        <View key={label} style={[S.notesBox, { marginBottom: 8 }]}>
          <Text style={S.notesLbl}>{label}</Text>
          <Text style={S.notesBody}>{body}</Text>
        </View>
      ))}
      <PageFooter data={data} />
    </Page>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderSpecPDF(data: SpecPDFData): React.ReactElement {
  const hasNotes = !!(
    cleanNotes(data.notes_install) || cleanNotes(data.notes_finishing) ||
    cleanNotes(data.notes_shop)    || cleanNotes(data.notes_client)
  );
  const hasAppliances = (data.spec_appliances_list?.length ?? 0) > 0;
  const hasHardware   = (data.spec_hardware?.length ?? 0) > 0;
  const hasAccs       = (data.spec_accessories?.length ?? 0) > 0;
  const hasMoldings   = data.finish_groups.some(fg => fg.moldings.some(m => m.qty_lf || m.type_label));
  const hasEdgebands  = data.finish_groups.some(fg => fg.edgebands.length > 0);

  return (
    <Document>
      {/* Page 1: Finish Schedule + Room Schedule */}
      <FinishSchedulePage data={data} />
      {/* Page 2: Accessories + Moldings + Edgebanding (only if any content) */}
      {(hasAccs || hasMoldings || hasEdgebands) && <AccessoriesMoldingsPage data={data} />}
      {/* Page 3: Appliances + Hardware (only if any content) */}
      {(hasAppliances || hasHardware) && <AppliancesHardwarePage data={data} />}
      {/* Page 4: Notes */}
      {hasNotes && <NotesPage data={data} />}
    </Document>
  );
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}
      