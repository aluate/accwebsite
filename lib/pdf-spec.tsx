/**
 * PDF generator for residential cabinet specs.
 * Rebuilt 2026-07-08 — new 4-page layout + WO sheets per FG.
 *
 * Page 1 (F.1):  Finish Schedule (FG-as-rows) + Room Schedule
 * Page 2 (A.1):  Accessories + Moldings (by FG)
 * Page 3 (AP.1): Appliances + Hardware
 * Page 4 (N.1):  Notes (conditional)
 * Page W.n (per FG): Work Order sheet — Specs + Hardware + Moldings + EB Schedule
 */
import React from "react";
import path from "path";
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";
import { HARDWARE_ROLE_LABEL as HW_ROLE_LABEL_PDF } from "@/lib/acc-standards";
import { ROLE_BASE, ROLE_DRAWER_FRONT, ROLE_APPLIED_END } from "@/lib/door-front-roles";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinishView = {
  stain_name: string; paint_name: string; glaze_name: string;
  topcoat_name: string; sheen_name: string;
};
export type MaterialView = { role: string; role_label: string; name: string; where_used: string; notes: string };
export type DoorFrontView = { role: string; role_label: string; slot_label: string; style_name: string; material_name: string; oe_name: string; ie_name: string; panel_name: string; grain: string; vendor: string; notes: string };
export type DrawerView = { role: string; role_label: string; slot_label: string; drawer_box_name: string; slides_name: string; notes: string };
/*
  `part_no` is the number a PM typed in the editable edgeband table. Empty when they
  did not, in which case pdf-spec derives one from the product name — the stored value
  has to win, because a part number on a shop sheet must be the one on the roll.
*/
export type EdgebandView = { code: string; edgeband_name: string; supplier: string; thickness: string; part_no: string; where_used_label: string; notes: string };
export type HardwareView = { role: string; role_label: string; slot_label: string; hardware_name: string; brand: string; qty: number | null; location: string; vendor: string; notes: string };
export type CountertopView = { location: string; style_name: string; edge_name: string; splash_style: string; splash_edge_name: string; material_name: string; buildup_in: number | null; core_substrate: string; brackets: string; notes: string };
export type MoldingView = { molding_type: string; type_label: string; profile_name: string; size_in: number | null; material_name: string; qty_lf: number | null; where_used: string[]; notes: string };

export type FinishGroupView = {
  id: string; label: string; finish_type: string; notes: string; species: string;
  /** The colour as stored on the finish group — catalog or custom, denormalised. */
  color_name: string;
  /**
   * Absolute path to the melamine swatch, or "" when there is none. Resolved in
   * spec-data.ts and only set when the file exists on disk: @react-pdf throws on a
   * missing image, and a work order that will not render beats one without a picture.
   */
  color_image: string;
  wo_number: string | null;
  grain_orientation: string | null;
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
  accessories: { name: string; brand: string; series: string; category: string; size: string; handed: string; qty: number }[];
};

export type AccessoryRollupRow = { name: string; brand: string; series: string; category: string; size: string; handed: string; total_qty: number; rooms: string[] };
export type MoldingRollupRow = { type_label: string; profile_name: string; size_in: number | null; material_name: string; total_lf: number; finishes: string[] };

export type SpecPullRow = { id: string; make: string; model: string; size: string; room: string; notes: string; qty: number };
export type SpecAccessoryRow = { id: string; type: string; part_number: string; description: string; qty: number; handed: string; room: string; size: string; notes: string };
export type SpecHardwareRow = { id: string; type: string; part_no: string; room: string; qty: number; notes: string };
export type FGPullRow = { id: string; description: string; part_no: string; finish_color: string; where_used: string; qty: number; sort_order: number };

export type RoomTrimEntry = { id: string; room_id: string; trim_type: string; size_desc: string; material: string; qty_lf: number; notes: string; sort_order: number };
export type ApplianceEntry = { id: string; appliance_type: string; manufacturer: string; model_no: string; room_name: string; notes: string; cutout_w: number | null; cutout_h: number | null; cutout_d: number | null; sort_order: number };

export type SpecPDFData = {
  /*
    CAREFUL. `job_id` here is a DISPLAY string — `job.job_number ?? spec.job_id` — so
    on a job with a Tradesoft number it holds "88888", not a key. It exists for
    document footers.

    `job_internal_id` is the actual jobs.id. Anything that writes a foreign key, a
    storage path, or a database lookup must use that one. The generate route used
    `job_id` for both and produced
        job_files_job_id_fkey ... Key (job_id)=(88888) is not present in table "jobs"
    — so every generated spec for a job WITH a Tradesoft number failed to record,
    while the endpoint still returned 200. That is why generated files could not be
    found: they were never listed.
  */
  job_id: string; job_internal_id: string; job_number: string | null; spec_name: string; generated_at: string;
  client_name: string; client_email: string | null;
  builder_name: string | null; builder_company: string | null;
  pm: string | null; engineer: string | null; site_address: string; city: string | null;
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

// ─── WO Edgeband type ─────────────────────────────────────────────────────────

export type WOEbRow = {
  code: string;         // D, E, I, V, U, B, C, X
  thickness: string;    // e.g. "1MM", ".018", "3.0"
  manufacturer: string;
  part_no: string;      // # column
  description: string;  // short description
  where_used: string;
  notes: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ORANGE  = "#f08122";
const DARK    = "#1a1a1a";
const MUTED   = "#888";
const HAIR    = "#e0e0e0";
const HEAD_BG = "#3d3d3d";
const STRIPE  = "#f7f7f5";
const BAND_BG = "#f0ede8";
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const RED     = "#cc0000";

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

// WO-specific styles (portrait layout)
const WS = StyleSheet.create({
  page:        { padding: 20, fontSize: 7, fontFamily: "Helvetica", color: DARK },
  header:      { flexDirection: "row", borderWidth: 1, borderColor: "#ccc", marginBottom: 5 },
  hdrLogo:     { width: 90, padding: 6, borderRightWidth: 0.5, borderRightColor: "#ccc", justifyContent: "center", alignItems: "center" },
  hdrLogoImg:  { width: 78 },
  hdrLeft:     { flex: 1, padding: 6, borderRightWidth: 0.5, borderRightColor: "#ccc" },
  hdrRight:    { flex: 1.4, padding: 6, justifyContent: "center" },
  hdrLabel:    { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  hdrTitle:    { fontSize: 13, fontFamily: "Helvetica-Bold", color: DARK, marginBottom: 3 },
  hdrAddr:     { fontSize: 7, color: MUTED, marginTop: 2 },
  hdrFinish:   { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: ORANGE, marginTop: 2 },
  hdrFgLabel:  { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  notesBox:    { borderWidth: 1, borderColor: RED, padding: 4, minHeight: 36, flex: 1 },
  notesLbl:    { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: RED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  notesBody:   { fontSize: 6.5, color: RED, lineHeight: 1.3 },
  metaBar:     { flexDirection: "row", borderWidth: 0.5, borderColor: "#ccc", borderRadius: 2, marginBottom: 5 },
  metaCell:    { flex: 1, borderRightWidth: 0.5, borderRightColor: "#ccc", padding: 0 },
  metaLbl:     { fontSize: 5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 4, paddingTop: 3, paddingBottom: 1 },
  metaVal:     { fontSize: 7, color: DARK, paddingHorizontal: 4, paddingBottom: 3 },
  body:        { flexDirection: "row", gap: 5, marginBottom: 5 },
  bodyLeft:    { flex: 1 },
  bodyRight:   { width: 210 },
  secHead:     { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: HEAD_BG, padding: 3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 0 },
  specRow:     { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR },
  specLabel:   { width: 105, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#555", padding: 3, textTransform: "uppercase", letterSpacing: 0.2 },
  specValue:   { flex: 1, fontSize: 7, color: DARK, padding: 3 },
  // WO SPECS is a three-column table now: what it is, what it is made of, and what
  // edgeband goes on it. Karl: "call out carcass interior like it is, then add a
  // column for EB right there."
  specEb:      { width: 88, fontSize: 6.5, color: DARK, padding: 3, borderLeftWidth: 0.3, borderLeftColor: HAIR },
  specHdrRow:  { flexDirection: "row", backgroundColor: HEAD_BG },
  specHdrTx:   { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: "#fff", padding: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  pullSubHead: { backgroundColor: BAND_BG, paddingHorizontal: 4, paddingVertical: 2, marginTop: 3 },
  pullSubTx:   { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: DARK, textTransform: "uppercase", letterSpacing: 0.6 },
  roomPillRow: { flexDirection: "row", flexWrap: "wrap", padding: 4 },
  roomPill:    { backgroundColor: BAND_BG, borderWidth: 0.4, borderColor: "#ccc", borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2, marginRight: 3, marginBottom: 3 },
  roomPillTx:  { fontSize: 6, color: "#333", fontFamily: "Helvetica-Bold" },
  roomNote:    { fontSize: 6, color: MUTED, fontStyle: "italic", paddingHorizontal: 4, paddingBottom: 2 },
  fullSecHead: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: HEAD_BG, padding: 3, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 5, marginBottom: 0 },
  tableRow:    { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR },
  tableRowAlt: { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  th:          { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#fff", padding: 3, textTransform: "uppercase", letterSpacing: 0.2 },
  td:          { fontSize: 6.5, color: DARK, padding: 3 },
  tdMu:        { fontSize: 6.5, color: MUTED, fontStyle: "italic", padding: 3 },
  tdBold:      { fontSize: 6.5, color: DARK, fontFamily: "Helvetica-Bold", padding: 3 },
  tdOrange:    { fontSize: 7, color: ORANGE, fontFamily: "Helvetica-Bold", padding: 3 },
  footer:      { position: "absolute", bottom: 10, left: 20, right: 20, flexDirection: "row", justifyContent: "space-between" },
  footerTxt:   { fontSize: 6, color: "#aaa" },
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
  F: "FINISH", A: "ACC & MOLDINGS", AP: "APPLIANCES", N: "NOTES", W: "WORK ORDER",
};

/** Extract part# from edgeband product name (e.g. "Uniboard K15 Cannes..." → "K15") */
function extractEbPartNo(supplier: string, productName: string): string {
  if (!supplier || !productName) return "";
  const internals = ["internal", "stock"];
  if (internals.includes(supplier.toLowerCase())) return "STOCK";
  // Remove supplier prefix from name to get "K15 Cannes Riviera Oak" → first token = "K15"
  const normalized = productName.startsWith(supplier)
    ? productName.slice(supplier.length).trim()
    : productName;
  return normalized.split(/\s+/)[0] || "";
}

/**
 * Collapse a hardware role to a comparison key. spec_hardware.type is free text
 * ("DRAWER SLIDES"); finish_group_hardware.role is controlled ("drawer_slides").
 * Both become DRAWER_SLIDES so the two sides can be paired.
 */
export function hardwareRoleKey(s: string): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Which finish group hardware rows survive alongside spec-level hardware.
 *
 * Spec level wins (Karl, 2026-08-15): a role a PM typed at spec level overrides the
 * finish group's record for that role, so the finish group's row is dropped and the
 * shop sees exactly one answer. Roles only one side names are untouched.
 *
 * Exported so the rule can be tested without a database — the WO page that uses it
 * needs a fully seeded catalog to render at all.
 */
export function reconcileWOHardware<T extends { role: string; role_label: string }>(
  fgHw: readonly T[],
  specHw: readonly { type: string }[],
): T[] {
  const claimed = new Set(specHw.map((h) => hardwareRoleKey(h.type)).filter(Boolean));
  return fgHw.filter(
    (h) => !claimed.has(hardwareRoleKey(h.role)) && !claimed.has(hardwareRoleKey(h.role_label)),
  );
}

/** Derive the 8 standard WO edgeband rows from a finish group. */
export function deriveWOEdgebands(fg: FinishGroupView): WOEbRow[] {
  const faceEb = fg.edgebands[0];
  const isPaint = fg.finish_type === "paint";
  const isStain = fg.finish_type === "stain";

  let faceThick: string, faceMfr: string, facePart: string, faceDesc: string;

  if (isPaint) {
    faceThick = "";  faceMfr = "Internal";  facePart = "STOCK";  faceDesc = "Paint to Match";
  } else if (isStain) {
    faceThick = "";  faceMfr = "Internal";  facePart = "STOCK";  faceDesc = "Stain to Match";
  } else {
    // Melamine: use selected edgeband
    faceThick = faceEb?.thickness || "1MM";
    faceMfr   = faceEb?.supplier  || "";
    faceDesc  = fg.label.replace("-", " ");   // "MEL-1" → "MEL 1"
    facePart  = faceEb
      ? extractEbPartNo(faceEb.supplier, faceEb.edgeband_name)
      : "";
  }

  /*
    Interior edgeband follows the carcass: plywood or birch boxes get prefinished
    maple, particleboard gets hardrock.

    This looked up role "cab_ext" — a role that was deliberately removed from the
    vocabulary ("the carcass material IS the cab ext"), and which spec-data.ts has
    never emitted. So carcassName was always "", the condition was always false, and
    every work order printed HARDROCK MAPLE regardless of what the boxes are made of.
    Silent, and wrong on every plywood job.
  */
  const carcassName = (fg.materials.find(m => m.role === "cab_int")?.name ?? "").toLowerCase();
  const interiorDesc = (carcassName.includes("plywood") || carcassName.includes("birch"))
    ? "PF MAPLE" : "HARDROCK MAPLE";

  return [
    { code: "D", thickness: faceThick, manufacturer: faceMfr, part_no: facePart, description: faceDesc,     where_used: "Applied End Panels / Door & Drawer Fronts", notes: "" },
    { code: "E", thickness: faceThick, manufacturer: faceMfr, part_no: facePart, description: faceDesc,     where_used: "Cabinet Body Parts",                        notes: "" },
    { code: "I", thickness: ".018",    manufacturer: "Stock",  part_no: "STOCK",  description: interiorDesc, where_used: "Adjustable Shelves",                        notes: "" },
    { code: "V", thickness: faceThick, manufacturer: faceMfr, part_no: facePart, description: faceDesc,     where_used: "Bottom of Upper F.E.",                      notes: "" },
    { code: "U", thickness: ".018",    manufacturer: "Stock",  part_no: "STOCK",  description: interiorDesc, where_used: "Bottom of Upper UN-F.E.",                   notes: "" },
    { code: "B", thickness: ".018",    manufacturer: "Stock",  part_no: "STOCK",  description: "PF MAPLE",   where_used: "Drawer Box Sides",                          notes: "" },
    { code: "C", thickness: ".018",    manufacturer: "Stock",  part_no: "STOCK",  description: "PF MAPLE",   where_used: "Drawer Box Front and Backs",                notes: "" },
    { code: "X", thickness: "",        manufacturer: "",       part_no: "",       description: "",            where_used: "MISC",                                      notes: "" },
  ];
}

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
  const projectName = data.client_name || "";
  const jobNum      = data.job_number ?? "";   // blank if no job number assigned
  const isApproved  = data.lifecycle_state === "APPROVED";
  return (
    <View style={S.tbWrap} fixed>
      {/* 3-column header: logo | project info | job meta */}
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: "#ccc" }}>
        {/* Logo */}
        <View style={{ width: 80, padding: 5, borderRightWidth: 0.5, borderRightColor: "#ccc", justifyContent: "center", alignItems: "center" }}>
          <Image src={LOGO_PATH} style={{ width: 68 }} />
        </View>
        {/* Centre: project + spec type */}
        <View style={{ flex: 1, padding: 5, borderRightWidth: 0.5, borderRightColor: "#ccc" }}>
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: DARK }}>{projectName}</Text>
          {data.builder_company && (
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 1 }}>{data.builder_company}</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 1.2, marginRight: 6 }}>{stageWord}</Text>
            <Text style={{ fontSize: 6.5, color: MUTED, letterSpacing: 0.8 }}>SHEET {code}</Text>
          </View>
          <Text style={{ fontSize: 6, color: MUTED, marginTop: 2 }}>
            250 W Anton Ave · Coeur d&apos;Alene, Idaho 83815 · (208) 772-2377
          </Text>
        </View>
        {/* Right: meta */}
        <View style={{ width: 130, padding: 5, justifyContent: "center" }}>
          {jobNum ? <Text style={{ fontSize: 6.5, color: "#444", marginBottom: 1 }}>Job #:     {jobNum}</Text> : null}
          {data.pm              && <Text style={{ fontSize: 6.5, color: "#444", marginBottom: 1 }}>PM:        {data.pm}</Text>}
          {data.builder_company && <Text style={{ fontSize: 6.5, color: "#444", marginBottom: 1 }}>Builder:   {data.builder_company}</Text>}
          <Text style={{ fontSize: 6.5, color: "#444", marginBottom: 1 }}>Date:      {new Date(data.generated_at).toLocaleDateString()}</Text>
          <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: isApproved ? "#2a7a2a" : ORANGE, marginTop: 2, letterSpacing: 0.8 }}>
            {isApproved ? "APPROVED" : "DRAFT — PENDING APPROVAL"}
          </Text>
        </View>
      </View>
      {/* Orange banner */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0, borderBottomWidth: 1.5, borderBottomColor: ORANGE, paddingVertical: 2, paddingHorizontal: 2, backgroundColor: "#fffaf6" }}>
        <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.4 }}>
          {[jobNum, projectName].filter(Boolean).join("  ·  ")}
        </Text>
        <Text style={{ fontSize: 6.5, color: MUTED, letterSpacing: 0.8 }}>{stageWord} · SHEET {code}</Text>
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
  const fgs     = data.finish_groups;
  const fgPulls = data.finish_group_pulls ?? {};
  const isDraft = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";

  // Conditional countertop column: only show if any FG has CT data
  const hasCT = fgs.some(fg => fg.countertops.length > 0);

  // Column flex widths for the Finish Schedule
  const COL = {
    fg:       0.9,
    color:    1.6,
    // Karl's placement: right of Color / Finish, before Species. 0.7 of ~13.3 total
    // flex on landscape LETTER lands at about half an inch, which is what the 400px
    // swatches were sized for — 400px over 0.5in is 800dpi, past what any printer
    // resolves. Paint and stain have no photograph, so the cell is simply empty for
    // them rather than showing a placeholder nobody asked about.
    swatch:   0.7,
    species:  0.8,
    carcass:  1.3,
    doorSpec: 2.8,   // stacked: Doors / DF / Applied Ends
    ct:       1.6,   // countertop (conditional)
    pulls:    2.2,
    notes:    1.4,
  };

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraft && <DraftWatermark />}
      <TitleBlock data={data} code="F.1" />

      {/* FINISH SCHEDULE */}
      <Text style={S.secHead}>FINISH SCHEDULE</Text>
      {fgs.length === 0 ? (
        <Text style={[S.cellMu, { marginBottom: 12 }]}>No finish groups defined.</Text>
      ) : (
        <View style={{ marginBottom: 14 }}>
          {/* Header */}
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: COL.fg }]}>Finish Group</Text>
            <Text style={[S.colHdrTx, { flex: COL.color }]}>Color / Finish</Text>
            <Text style={[S.colHdrTx, { flex: COL.swatch }]}> </Text>
            <Text style={[S.colHdrTx, { flex: COL.species }]}>Species</Text>
            <Text style={[S.colHdrTx, { flex: COL.carcass }]}>Carcass</Text>
            <Text style={[S.colHdrTx, { flex: COL.doorSpec }]}>Doors · DF · Applied Ends</Text>
            {hasCT && <Text style={[S.colHdrTx, { flex: COL.ct }]}>Countertop</Text>}
            <Text style={[S.colHdrTx, { flex: COL.pulls }]}>Pulls</Text>
            <Text style={[S.colHdrTx, { flex: COL.notes }]}>Notes</Text>
          </View>

          {fgs.map((fg, fi) => {
            const pulls    = fgPulls[fg.id] ?? [];
            const colorName = fg.finish.stain_name || fg.finish.paint_name || "";
            const carcass   = fg.materials.find(m => m.role === "cab_int")?.name ?? fg.materials.find(m => m.role === "cab_ext")?.name ?? "";
            const rowStyle  = fi % 2 === 0 ? S.row : S.rowAlt;

            // Pull display lines
            const pullLines = pulls.length === 0 ? ["—"] : pulls.map(p => {
              const parts = [p.description, p.where_used ? `(${p.where_used})` : ""].filter(Boolean);
              return parts.join(" ");
            });

            // Door / DF / Applied Ends stacked lines
            const doorLines: { label: string; val: string }[] = [];

            /*
              Every callout gets its own line, tagged with its slot label.

              A finish group can carry several rows per role, which is the whole point
              of Karl's ask: "if I have my 12in drawers 5 piece and the 6in drawers
              slab I need to be able to call it out". This used to take [0] and drop
              the rest, so the second callout existed in the database and appeared on
              no document.

              With one row per role the output is unchanged — "Doors", "DF" — so a
              simple job reads exactly as it did. With two, the slot label
              disambiguates: `DF · 12" DRAWERS`.
            */
            const styleOf = (df: DoorFrontView) =>
              [df.style_name, df.material_name].filter(v => v && v !== "—").join(" / ");
            const tag = (base: string, df: DoorFrontView, many: boolean) =>
              many && df.slot_label ? `${base} · ${df.slot_label}` : base;

            const baseDoors = fg.door_fronts.filter(df => df.role === ROLE_BASE);
            for (const bd of baseDoors) {
              doorLines.push({ label: tag("Doors", bd, baseDoors.length > 1), val: styleOf(bd) || "—" });
            }

            /*
              Drawer fronts.

              The fallback used to be "the first row that is not base and not
              applied_end" — comparing against a role NOTHING has ever written. Rows
              are stored as `applied_ends`, so that exclusion never fired and an
              Applied Ends row was printed as the Drawer Front. On Karl's own case,
              slab everywhere with a shaker panel on the kitchen applied ends, the
              document the CLIENT SIGNS named the wrong drawer front style.

              Roles are normalized in spec-data now, so these compare against the
              canonical constants and there is only one list left to be wrong in.

              The fallback stays: a group may carry only an `upper` or a legacy
              `slab_df` row, and borrowing that beats printing nothing. It must never
              borrow an applied end, which describes a panel on the side of a cabinet.
            */
            const dfFronts = fg.door_fronts.filter(df => df.role === ROLE_DRAWER_FRONT);
            const dfSource = dfFronts.length > 0
              ? dfFronts
              : fg.door_fronts.filter(df => df.role !== ROLE_BASE && df.role !== ROLE_APPLIED_END);
            const baseVal = baseDoors[0] ? styleOf(baseDoors[0]) : "";
            if (dfSource.length > 0) {
              for (const df of dfSource) {
                const val = styleOf(df) || "—";
                const label = tag("DF", df, dfSource.length > 1);
                // A single drawer front identical to the base doors is worth saying as
                // "Match Doors" rather than repeating the style. With several rows each
                // is an explicit callout, so print what it actually says.
                doorLines.push({
                  label,
                  val: dfSource.length === 1 && baseVal && val === baseVal ? "Match Doors" : val,
                });
              }
            } else if (baseDoors.length > 0) {
              doorLines.push({ label: "DF", val: "Match Doors" });
            }

            const appliedEnds = fg.door_fronts.filter(df => df.role === ROLE_APPLIED_END);
            if (appliedEnds.length > 0) {
              for (const ae of appliedEnds) {
                doorLines.push({
                  label: tag("Appl. Ends", ae, appliedEnds.length > 1),
                  val: styleOf(ae) || fmtAppliedPanels(fg.applied_panels) || "—",
                });
              }
            } else if (fg.applied_panels) {
              doorLines.push({ label: "Appl. Ends", val: fmtAppliedPanels(fg.applied_panels) });
            }
            // Grain orientation line
            if (fg.grain_orientation) {
              doorLines.push({ label: "Grain", val: fg.grain_orientation.toUpperCase() });
            }

            // Countertop summary (first CT only, for the column)
            const ct = fg.countertops[0];
            const ctVal = ct
              ? [ct.material_name, ct.style_name, ct.edge_name ? `${ct.edge_name} edge` : ""].filter(v => v && v !== "—").join(" / ")
              : "—";

            return (
              <View key={fg.id} style={rowStyle} wrap={false}>
                <Text style={[S.cell, { flex: COL.fg, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{fg.label}</Text>
                <Text style={[S.cell, { flex: COL.color }]}>{d(colorName)}</Text>

                {/*
                  The colour, as a picture. A client choosing a finish is choosing what
                  it LOOKS like, and a sheet that says "MOAB RIFT" asks them to trust a
                  name. Empty for paint and stain, which have no photograph — an empty
                  cell is quieter than a placeholder.
                */}
                <View style={{ flex: COL.swatch, padding: 3, alignItems: "center", justifyContent: "center" }}>
                  {fg.color_image
                    ? <Image src={fg.color_image} style={{ width: 34, height: 34, borderWidth: 0.3, borderColor: HAIR }} />
                    : null}
                </View>
                {/*
                  Species on a melamine group used to print "—" because
                  finish_groups.species is only filled for paint and stain. But a
                  melamine door is made OF the melamine, so the column had an answer
                  and was showing a dash.

                  It reads "Melamine" / "Laminate" rather than repeating the colour:
                  the specific sheet is already in the Color / Finish column two
                  cells to the left, and a client sheet that says MOAB RIFT twice in
                  a row reads like a mistake.
                */}
                <Text style={[S.cell, { flex: COL.species }]}>
                  {d(fg.species || (fg.finish_type === "melamine" ? "Melamine"
                                  : fg.finish_type === "plam" ? "Laminate" : ""))}
                </Text>
                <Text style={[S.cell, { flex: COL.carcass }]}>{d(carcass)}</Text>

                {/* Stacked door / DF / applied ends */}
                <View style={{ flex: COL.doorSpec, padding: 4 }}>
                  {doorLines.length === 0 ? (
                    <Text style={{ fontSize: 7, color: MUTED, fontStyle: "italic" }}>—</Text>
                  ) : doorLines.map((line, li) => (
                    <View key={li} style={li > 0 ? { borderTopWidth: 0.3, borderTopColor: HAIR, marginTop: 2, paddingTop: 2 } : {}}>
                      <Text style={{ fontSize: 6.5, color: DARK }}>
                        <Text style={{ fontFamily: "Helvetica-Bold", color: MUTED, fontSize: 6 }}>{line.label}: </Text>
                        {line.val}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Countertop (conditional column) */}
                {hasCT && (
                  <Text style={[S.cell, { flex: COL.ct }]}>{ctVal}</Text>
                )}

                {/* Pulls — stacked */}
                <View style={{ flex: COL.pulls, padding: 4 }}>
                  {pullLines.map((line, li) => (
                    <Text key={li} style={[{ fontSize: 7, color: DARK }, li > 0 ? { borderTopWidth: 0.3, borderTopColor: HAIR, marginTop: 2, paddingTop: 2 } : {}]}>{line}</Text>
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
        <View style={{ marginBottom: 12 }}>
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
                <Text style={[S.cellMu, { flex: 4.7 }]}>{[zones, room.notes].filter(Boolean).join("  ·  ") || "—"}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ACCESSORIES BY ROOM (whole-job, sorted by room) */}
      {(() => {
        type AccRow = { roomName: string; name: string; brand: string; series: string; size: string; handed: string; qty: number };
        const allRows: AccRow[] = [];
        for (const room of data.rooms) {
          for (const a of room.accessories) {
            allRows.push({ roomName: room.name, name: a.name, brand: a.brand, series: a.series, size: a.size, handed: a.handed, qty: a.qty });
          }
        }
        if (allRows.length === 0) return null;
        // Group by room
        const byRoom = new Map<string, AccRow[]>();
        for (const row of allRows) {
          if (!byRoom.has(row.roomName)) byRoom.set(row.roomName, []);
          byRoom.get(row.roomName)!.push(row);
        }
        const sortedRooms = Array.from(byRoom.entries()).sort(([a], [b]) => a.localeCompare(b));
        return (
          <>
            <Text style={[S.secHead, { marginTop: 8 }]}>ACCESSORIES BY ROOM</Text>
            <View style={S.colHdr}>
              <Text style={[S.colHdrTx, { flex: 1.5 }]}>Room</Text>
              <Text style={[S.colHdrTx, { flex: 3 }]}>Item</Text>
              <Text style={[S.colHdrTx, { flex: 0.8 }]}>Series</Text>
              <Text style={[S.colHdrTx, { flex: 0.6 }]}>Size</Text>
              <Text style={[S.colHdrTx, { flex: 0.6 }]}>Hand</Text>
              <Text style={[S.colHdrTx, { flex: 0.5 }]}>Qty</Text>
            </View>
            {sortedRooms.flatMap(([roomName, accs]) =>
              accs.map((a, ai) => (
                <View key={`${roomName}-${ai}`} style={ai % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                  <Text style={[S.cell, { flex: 1.5, fontFamily: "Helvetica-Bold" }]}>{ai === 0 ? roomName : ""}</Text>
                  <Text style={[S.cell, { flex: 3 }]}>{d(a.name)}</Text>
                  <Text style={[S.cell, { flex: 0.8 }]}>{d(a.series)}</Text>
                  <Text style={[S.cell, { flex: 0.6 }]}>{a.size ? `${a.size}"` : "—"}</Text>
                  <Text style={[S.cell, { flex: 0.6 }]}>{a.handed && a.handed !== "N/A" ? a.handed : "—"}</Text>
                  <Text style={[S.cell, { flex: 0.5 }]}>{String(a.qty)}</Text>
                </View>
              ))
            )}
          </>
        );
      })()}


      <PageFooter data={data} />
    </Page>
  );
}


// ─── Page 2: Accessories + Moldings ──────────────────────────────────────────
// (Edgebanding removed — now lives on W.n Work Order sheets)

function AccessoriesMoldingsPage({ data }: { data: SpecPDFData }) {
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

  const isDraftA = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraftA && <DraftWatermark />}
      <TitleBlock data={data} code="A.1" />

      {/* ACCESSORIES — unified: Room | Item | QTY */}
      {(() => {
        type AccRow = { room: string; item: string; qty: number | string };
        const rows: AccRow[] = [
          ...(data.accessories_rollup ?? []).map(a => ({
            room: a.rooms.join(", "),
            item: a.name,
            qty:  a.total_qty,
          })),
          ...(data.spec_accessories ?? []).map(a => ({
            room: a.room || "—",
            item: a.description || a.type,
            qty:  a.qty,
          })),
        ];
        if (rows.length === 0) return null;
        return (
          <View style={{ marginBottom: 16 }}>
            <Text style={S.secHead}>ACCESSORIES</Text>
            <View style={S.colHdr}>
              <Text style={[S.colHdrTx, { flex: 2.5 }]}>Room</Text>
              <Text style={[S.colHdrTx, { flex: 4.5 }]}>Item</Text>
              <Text style={[S.colHdrTx, { flex: 0.8 }]}>QTY</Text>
            </View>
            {rows.map((r, i) => (
              <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                <Text style={[S.cellMu, { flex: 2.5 }]}>{r.room}</Text>
                <Text style={[S.cell,   { flex: 4.5, fontFamily: "Helvetica-Bold" }]}>{r.item}</Text>
                <Text style={[S.cell,   { flex: 0.8 }]}>{String(r.qty)}</Text>
              </View>
            ))}
          </View>
        );
      })()}

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

      <PageFooter data={data} />
    </Page>
  );
}

// ─── Page 3: Appliances + Hardware ───────────────────────────────────────────

function AppliancesHardwarePage({ data }: { data: SpecPDFData }) {
  const apps = data.spec_appliances_list ?? [];
  const isDraftAP = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";

  // This page is spec-level, but hardware is recorded per finish group. Roll the
  // finish groups up: one line when every group agrees (the normal case), and a
  // line per group when they do not — a spec whose kitchen and bath use different
  // hinges has to say so here, not average them into a single misleading row.
  //
  // Pulls are excluded; they have their own section on the work order sheets.
  const hwRollup = (() => {
    const byRole = new Map<string, Map<string, string[]>>();  // role -> name -> fg labels
    for (const g of data.finish_groups ?? []) {
      for (const h of g.hardware ?? []) {
        if (h.role === "door_pulls" || h.role === "drawer_pulls") continue;
        if (!h.hardware_name) continue;
        const names = byRole.get(h.role) ?? new Map<string, string[]>();
        const labels = names.get(h.hardware_name) ?? [];
        labels.push(g.label);
        names.set(h.hardware_name, labels);
        byRole.set(h.role, names);
      }
    }
    const out: { id: string; type: string; part_no: string; room: string; qty: number; notes: string }[] = [];
    for (const [role, names] of byRole) {
      const single = names.size === 1;
      for (const [name, labels] of names) {
        out.push({
          id: `fg-${role}-${name}`,
          type: HW_ROLE_LABEL_PDF[role] ?? role,
          part_no: name,
          // Only name the finish groups when they disagree; otherwise it is noise.
          room: single ? "" : labels.join(", "),
          qty: 0,
          notes: "",
        });
      }
    }
    return out;
  })();

  const hw = [...hwRollup, ...(data.spec_hardware ?? [])];

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

// The two signature boxes, lifted out of FinishSchedulePage so that the page which
// draws them and the document which decides where they belong stay separate.
function SignOffBlock() {
  return (
      <View style={{ flexDirection: "row", gap: 16, marginTop: 14, marginBottom: 4 }} wrap={false}>
        {[
          { label: "Client Approval", sub: "I have reviewed and approve the above specification." },
          { label: "ACC Representative", sub: "" },
        ].map((box, bi) => (
          <View key={bi} style={{ flex: 1, borderWidth: 0.5, borderColor: "#ccc", borderRadius: 2, padding: 6 }}>
            <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{box.label}</Text>
            {box.sub ? <Text style={{ fontSize: 6, color: MUTED, marginBottom: 12 }}>{box.sub}</Text> : <View style={{ height: 12 }} />}
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: "#999", marginBottom: 3 }} />
            <Text style={{ fontSize: 6, color: "#bbb" }}>Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</Text>
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: "#999", marginBottom: 3, marginTop: 10 }} />
            <Text style={{ fontSize: 6, color: "#bbb" }}>Print Name</Text>
          </View>
        ))}
      </View>
  );
}

// ─── Sign-off page — client document only, always last ───────────────────────
//
// This sat at the bottom of the Finish Schedule: page one, under the accessories
// table. A signature at the bottom of page one attests to page one. The client was
// signing before the appliances, hardware and notes they had not turned to yet.
//
// Now its own page at the end of the client document, and it states what is being
// signed rather than floating under the nearest table. Karl asked that drawer boxes
// and rollouts be signed off "the same as doors", so they are named explicitly.

function SignOffPage({ data }: { data: SpecPDFData }) {
  const isDraft = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  const fgs = data.finish_groups ?? [];

  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      {isDraft && <DraftWatermark />}
      <TitleBlock data={data} code="F.S" />

      <Text style={S.secHead}>SPECIFICATION SIGN-OFF</Text>
      <Text style={[S.cellMu, { marginBottom: 8 }]}>
        By signing below you confirm that the finishes, door and drawer front styles,
        drawer boxes, rollouts, hardware, accessories and appliances recorded in this
        document are correct. Changes after sign-off may affect price and lead time.
      </Text>

      <View style={S.colHdr}>
        <Text style={[S.colHdrTx, { flex: 0.9 }]}>Finish Group</Text>
        <Text style={[S.colHdrTx, { flex: 1.6 }]}>Color / Finish</Text>
        <Text style={[S.colHdrTx, { flex: 1.6 }]}>Doors</Text>
        <Text style={[S.colHdrTx, { flex: 1.8 }]}>Drawer Box</Text>
        <Text style={[S.colHdrTx, { flex: 1.8 }]}>Rollout</Text>
        <Text style={[S.colHdrTx, { flex: 1.4 }]}>Rooms</Text>
      </View>
      {fgs.map((fg, i) => {
        const base    = fg.door_fronts.find((df) => df.role === ROLE_BASE);
        const box     = fg.drawers.find((dr) => dr.role === "drawer_box");
        const rollout = fg.drawers.find((dr) => dr.role === "rollout");
        const rooms   = (data.rooms ?? [])
          .filter((r) => r.finishes.some((f) => f.finish_group_id === fg.id))
          .map((r) => r.name);
        return (
          <View key={fg.id} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
            <Text style={[S.cell, { flex: 0.9, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{fg.label}</Text>
            <Text style={[S.cell, { flex: 1.6 }]}>{d(fg.finish.stain_name || fg.finish.paint_name)}</Text>
            <Text style={[S.cell, { flex: 1.6 }]}>{d([base?.style_name, base?.material_name].filter(Boolean).join(" / "))}</Text>
            <Text style={[S.cell, { flex: 1.8 }]}>{d([box?.drawer_box_name, box?.slides_name].filter(Boolean).join(" \u00b7 "))}</Text>
            <Text style={[S.cell, { flex: 1.8 }]}>{d([rollout?.drawer_box_name, rollout?.slides_name].filter(Boolean).join(" \u00b7 "))}</Text>
            <Text style={[S.cellMu, { flex: 1.4 }]}>{d(rooms.join(", "))}</Text>
          </View>
        );
      })}

      <SignOffBlock />
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

// ─── Page W.n: Work Order Sheet (portrait, one per Finish Group) ──────────────

function WorkOrderPage({ data, fg, index }: { data: SpecPDFData; fg: FinishGroupView; index: number }) {
  const isDraft     = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
  const projectName = [data.builder_company, data.client_name].filter(Boolean).join(" — ") || data.client_name;
  const pageCode    = `W.${index + 1}`;
  const colorName   = fg.finish.paint_name || fg.finish.stain_name || "";
  const fgPulls     = (data.finish_group_pulls ?? {})[fg.id] ?? [];
  // fgHw = this finish group's own hardware record. hw = spec-level extras a PM
  // typed in, which apply across finish groups. Pulls come from a third table.
  const fgHwRaw     = (fg.hardware ?? []).filter((h) => h.role !== "door_pulls" && h.role !== "drawer_pulls");
  const hw          = data.spec_hardware ?? [];

  /*
    ONE SLIDE, ONE NAME. Karl: the hardware block reads what the drawer/rollout
    schedule reads; pulls stay as they are.

    Each finish group records the same slide twice, in two columns resolved against
    two different catalogs:

      finish_group_hardware.hardware_id  role=drawer_slides   HDS-BLU-001
        -> hardware_drawer_slides        "Blum Tandem Plus Blumotion"
      finish_group_drawers.slides_id     role=drawer_box      DS-ACC-STD
        -> drawer_slides                 "ACC Standard Undermount Soft-Close"

    Same for rollouts: HRS-KV-001 "Knape & Vogt 3132 Full Extension" against
    DS-ACC-RO "ACC Standard Rollout Slide - Side-Mount Ball-Bearing". So one sheet
    named the same slide twice, differently, in two blocks — and someone comparing
    the hardware block against the drawer schedule had no way to tell whether that
    was two names for one slide or two different slides.

    The schedule's record wins. Not arbitrarily:
      - lib/lifecycle.ts validateForRelease() gates on slides_id and never checks
        the hardware row's drawer_slides/rollout_slides at all, so slides_id is
        already the field the system treats as the fact.
      - DS-* entries name WHAT the slide is and leave the length/SKU to the shop,
        which is what belongs on a spec; HDS-* rows carry per-length pricing.
      - Nothing loses an override: in the mounted app neither column is editable.
        The only UI that writes either is components/SpecSchedulesPanel.tsx, which
        is imported nowhere. Both are populated solely by seedAccStandards on save.

    Falls back to the hardware name when the schedule has no slide, because a blank
    where a slide belongs is worse than a differently-worded name.
  */
  const slideFromSchedule = (hwRole: string): string => {
    const drawerRole = hwRole === "drawer_slides" ? "drawer_box"
                     : hwRole === "rollout_slides" ? "rollout" : null;
    if (!drawerRole) return "";
    return (fg.drawers ?? []).find((d) => d.role === drawerRole)?.slides_name ?? "";
  };
  const fgHw = fgHwRaw.map((h) => {
    const fromSchedule = slideFromSchedule(h.role);
    return fromSchedule ? { ...h, hardware_name: fromSchedule } : h;
  });

  /*
    ONE ROLE, ONE ANSWER. Until now this block printed fgHw and hw back to back with
    nothing reconciling them, so a finish group that recorded HINGES and a spec whose
    spec_hardware also said HINGES put two different hinges on the same shop sheet.
    Observed live on ZZ TOP MEL-1: the sheet named both "Blum 110 CLIP top Blumotion
    Soft Close" and "Blum 170°", and both "ACC Standard Undermount Soft-Close" and
    "Blum Tandem Plus Blumotion". Nothing on the page said which one to build.

    Karl's call: SPEC-LEVEL WINS. A PM typing hardware at spec level is overriding the
    finish group's record, so that row is what the shop sees and the finish group's row
    for the same role is suppressed. Roles only one side names are untouched — CLOSET
    RODS typed at spec level still prints, and a finish group role no spec row mentions
    still prints.

    Matching is exact-after-normalising, deliberately. spec_hardware.type is free text
    ("DRAWER SLIDES") while finish_group_hardware.role is a controlled value
    ("drawer_slides"); collapsing both to DRAWER_SLIDES pairs them. A PM who types
    "Hinge" rather than "HINGES" will NOT match and the sheet falls back to printing
    both. That is the safe direction to fail: a visible duplicate asks a question,
    while silently dropping the finish group's real record answers it wrongly.
  */
  const fgHwShown = reconcileWOHardware(fgHw, hw);

  // Task #55 — prefer stored WO edgeband rows over re-derived defaults, BUT:
  //   - Paint/stain FGs: ALWAYS use derivedRows so Task #50 thickness fix ("" not "3.0") applies.
  //     Stored rows for paint/stain may have been saved with old values and would bypass the fix.
  //   - MEL FGs: use stored rows when they have standard WO codes (D/E/I/V/U/B/C/X), preserving
  //     any user edits made via the BUG-004 editable edgeband table.
  const STANDARD_EB_CODES = ["D","E","I","V","U","B","C","X"];
  const isPaintOrStain = fg.finish_type === "paint" || fg.finish_type === "stain";
  /*
    Until 2026-08, this branch could never be taken. lib/spec-data.ts overwrote every
    stored `code` with a synthetic "EB1"/"EB2" whenever the row named an edgeband
    product, so no row ever carried a standard letter, `hasStoredWORows` was always
    false, and the work order silently printed derived defaults over the top of
    whatever a PM had typed in the editable edgeband table. Fixed in spec-data; this
    code was correct all along and simply never ran.

    KNOWN GAP, deliberately left: paint and stain groups still bypass stored rows
    entirely. Task #50 fixed their thickness to blank rather than "3.0", and a stored
    row that inherited 3.0 from a catalogue product would reintroduce it. Telling
    "inherited from the catalogue" apart from "a person typed this" needs the two kept
    separate all the way through the view, which is a larger change than this.
  */
  const hasStoredWORows = !isPaintOrStain && fg.edgebands.some(eb => STANDARD_EB_CODES.includes(eb.code));
  const derivedRows = deriveWOEdgebands(fg);
  const ebRows: WOEbRow[] = hasStoredWORows
    ? STANDARD_EB_CODES.map(code => {
        const stored = fg.edgebands.find(eb => eb.code === code);
        const derived = derivedRows.find(r => r.code === code);
        if (stored) {
          // Per field, not per row: a PM who corrected only the part number keeps the
          // supplier and thickness that were already right, instead of blanking them.
          return {
            code: stored.code,
            thickness: stored.thickness || derived?.thickness || "",
            manufacturer: stored.supplier || derived?.manufacturer || "",
            // A typed part number is the one on the roll. Only guess from the product
            // name when nobody has said otherwise.
            part_no: stored.part_no
                  || (stored.edgeband_name ? extractEbPartNo(stored.supplier, stored.edgeband_name) : "")
                  || derived?.part_no || "",
            description: stored.edgeband_name || derived?.description || "",
            where_used: stored.where_used_label || derived?.where_used || "",
            notes: stored.notes || "",
          } as WOEbRow;
        }
        return derived ?? { code, thickness: "", manufacturer: "", part_no: "", description: "", where_used: "", notes: "" };
      })
    : derivedRows;
  const moldings    = fg.moldings.filter(m => m.qty_lf || m.type_label);

  // Spec summary values
  const cabInt      = fg.materials.find(m => m.role === "cab_int")?.name
                   ?? fg.materials.find(m => m.role === "cab_ext")?.name ?? "—";

  // Finish type label for header
  const finishTypeLabel = fg.finish_type === "paint" ? "PAINT" : fg.finish_type === "stain" ? "STAIN" : "MELAMINE";

  // Rooms assigned to this FG
  const fgRooms = data.rooms.filter(r => r.finishes.some(f => f.finish_group_id === fg.id));

  return (
    <Page size="LETTER" style={WS.page}>
      {isDraft && <DraftWatermark />}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={WS.header}>
        {/* Logo */}
        <View style={WS.hdrLogo}>
          <Image src={LOGO_PATH} style={WS.hdrLogoImg} />
        </View>

        {/* Builder + Address. The job number lives in the meta bar, and only there. */}
        <View style={WS.hdrLeft}>
          {/*
            JOB # IS NOT HERE. Karl: "JOB # should appear in one place, the same way
            every time."

            It used to head this banner AND sit in the meta bar, so the sheet stated it
            twice — and worse, inconsistently: with a Tradesoft number the banner read
            "JOB # 88888" and demoted the project name to a subtitle, while without one
            the project name was the title and the number appeared only in the meta bar.
            Two layouts for the same document depending on whether engineering had
            issued a number yet.

            The banner now always names the project, the meta bar always carries JOB #.
            One place, one shape, whether or not the number exists yet.

            (What it printed before all this was data.job_id — the internal key,
            "ACC-2026-0260". That means nothing outside this database and invited
            someone on the floor to write it on a box. job_number is the fact.)
          */}
          <Text style={WS.hdrTitle}>{projectName}</Text>
          {(data.site_address || data.city) && (
            <Text style={WS.hdrAddr}>
              {[data.site_address, data.city].filter(Boolean).join(", ")}
            </Text>
          )}
        </View>

        {/*
          Finish group.

          This read "MEL-1" then "MELAMINE — MOAB RIFT" on the line below. The word
          MELAMINE is redundant on a sheet whose whole left column is melamine specs,
          and it pushed the thing the shop actually needs — the colour — into small
          type. It now reads MEL-1 = MOAB RIFT, with the swatch beside it, so someone
          at a machine can see what they are building rather than matching a name
          against a sample board across the room.
        */}
        <View style={WS.hdrRight}>
          <Text style={WS.hdrFgLabel}>FINISH GROUP</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
            {fg.color_image
              ? <Image src={fg.color_image} style={{ width: 30, height: 30, marginRight: 5, borderWidth: 0.4, borderColor: "#999" }} />
              : null}
            <View>
              <Text style={WS.hdrFinish}>
                {fg.label}{colorName ? ` = ${colorName.toUpperCase()}` : ""}
              </Text>
              {!colorName && (
                <Text style={[WS.hdrFinish, { fontSize: 8, marginTop: 2 }]}>{finishTypeLabel}</Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── Meta bar ────────────────────────────────────────────────────── */}
      <View style={WS.metaBar}>
        {[
          /*
            JOB # first, and it is data.job_number — the five-digit number that comes
            from Tradesoft when the job is released to engineering. NOT data.job_id,
            which is the internal key ("ACC-2026-0260") and means nothing to anyone
            outside this database. A shop sheet showing that invites someone to write
            it on a box or quote it back to a builder.

            Blank until Tradesoft issues one, shown as an em dash like PM and Engineer
            so the box reads "not assigned yet" rather than looking broken.
          */
          { label: "JOB #",    value: data.job_number || "—" },
          { label: "WO #",     value: fg.wo_number || "" },
          { label: "PM",       value: data.pm || "—" },
          { label: "Engineer", value: data.engineer || "—" },
          { label: "Date",     value: new Date(data.generated_at).toLocaleDateString() },
        ].map(({ label, value }, i, arr) => (
          <View key={label} style={[WS.metaCell, i === arr.length - 1 ? { borderRightWidth: 0 } : {}]}>
            <Text style={WS.metaLbl}>{label}</Text>
            <Text style={WS.metaVal}>{value}</Text>
          </View>
        ))}
      </View>

      {/* ── ROOMS TABLE (first) ─────────────────────────────────────────── */}
      {fgRooms.length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={WS.fullSecHead}>ROOMS ({fgRooms.length})</Text>
          <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
            <Text style={[WS.th, { flex: 2 }]}>Room</Text>
            <Text style={[WS.th, { flex: 1.2 }]}>Zone / FG</Text>
            <Text style={[WS.th, { flex: 4 }]}>Notes</Text>
          </View>
          {fgRooms.map((r, ri) => {
            const zones = r.finishes.map(f => f.zone).filter(Boolean).join("; ");
            const fgLabels = r.finishes.map(f => f.finish_label || "").filter(Boolean).join(", ");
            const zoneCell = [zones, fgLabels].filter(Boolean).join("  ·  ");
            return (
              <View key={r.id} style={ri % 2 === 0 ? WS.tableRow : WS.tableRowAlt} wrap={false}>
                <Text style={[WS.tdBold, { flex: 2 }]}>{r.name || "—"}</Text>
                <Text style={[WS.td,     { flex: 1.2 }]}>{zoneCell || "—"}</Text>
                <Text style={[WS.tdMu,   { flex: 4 }]}>{r.notes || "—"}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Body: two columns ─────────────────────────────────────────── */}
      <View style={WS.body}>

        {/* LEFT: Work Order Specs + Finish Sched + Rooms */}
        <View style={WS.bodyLeft}>
          <Text style={WS.secHead}>WORK ORDER SPECS</Text>
          {(() => {
            /*
              Two rows that matter, each with its own edgeband, per Karl:

                INTERIOR   what the boxes are made of, and the edgeband that goes on
                           the inside — prefinished or hardrock maple depending.
                EXTERIOR   what the cabinet IS, which is the colour, and the edgeband
                           we actually selected for it.

              The exterior row did not exist. There was one "Edgebanding" row that
              printed the colour name for melamine — so the sheet named the colour in
              a row labelled Edgebanding, and never said what the exterior was.

              Both edgeband values come off `ebRows`, NOT from a second call to
              deriveWOEdgebands. That distinction is the whole point: ebRows prefers
              the rows a PM edited by hand in the editable edgeband table and only
              falls back to the derived defaults. Re-deriving here would print the
              default and quietly ignore the override.

              Worth knowing: until this row existed, `ebRows` was computed on every
              work order and rendered nowhere. The 8-row edgeband schedule it was
              built for was removed from this sheet in 69f6ba3 (the WO rebuild) to
              make room for the door and drawer schedules, and nothing replaced it —
              so the thickness, manufacturer, part number and where-used detail for
              each band is still resolved on every render and still prints nowhere.
              This summary quotes only the description. Restoring the schedule is a
              question for Karl, not a silent addition: this sheet is exactly one
              page and eight more rows would not be.

              Touchup kit is gone. Karl: "we don't need the touch up kit here."
            */
            const faceEb     = ebRows.find((r) => r.code === "D");
            const interiorEb = ebRows.find((r) => r.code === "I");

            const exteriorMaterial = colorName
              || (fg.finish_type === "paint" ? "Paint — colour not set"
                : fg.finish_type === "stain" ? "Stain — colour not set" : "—");

            const rows: { label: string; value: string; eb: string }[] = [
              { label: "Interior", value: cabInt || "—", eb: interiorEb?.description || "—" },
              { label: "Exterior", value: exteriorMaterial, eb: faceEb?.description || "—" },
            ];

            // Countertop rows (from free-entry ct_ fields). No edgeband on a countertop.
            const ct = fg.countertops[0];
            if (ct) {
              if (ct.material_name) rows.push({ label: "CT Material", value: ct.material_name, eb: "" });
              if (ct.style_name)    rows.push({ label: "CT Style",    value: ct.style_name,    eb: "" });
              if (ct.edge_name)     rows.push({ label: "CT Edge",     value: ct.edge_name,     eb: "" });
              if (ct.splash_style)  rows.push({ label: "CT Splash",   value: ct.splash_style,  eb: "" });
            }

            return (
              <>
                <View style={WS.specHdrRow}>
                  <Text style={[WS.specHdrTx, { width: 105 }]}>Item</Text>
                  <Text style={[WS.specHdrTx, { flex: 1 }]}>Material</Text>
                  <Text style={[WS.specHdrTx, { width: 88 }]}>Edgebanding</Text>
                </View>
                {rows.map(({ label, value, eb }, i) => (
                  <View key={i} style={[WS.specRow, i % 2 === 1 ? { backgroundColor: STRIPE } : {}]}>
                    <Text style={WS.specLabel}>{label}</Text>
                    <Text style={WS.specValue}>{value}</Text>
                    <Text style={WS.specEb}>{eb}</Text>
                  </View>
                ))}
              </>
            );
          })()}


        </View>

        {/* RIGHT: Work Order Hardware */}
        <View style={WS.bodyRight}>
          <Text style={WS.secHead}>WORK ORDER HARDWARE</Text>
          {fgHwShown.length === 0 && hw.length === 0 && fgPulls.length === 0 ? (
            <Text style={[WS.tdMu, { padding: 4 }]}>No hardware specified.</Text>
          ) : (
            <>
              {/*
                Spec-level hardware first, because it wins. A PM who typed a role here
                is overriding the finish group, so their row is the one the shop reads
                and the finish group's row for that role never renders — see the
                fgHwShown comment above for why a near-miss prints both instead.
              */}
              {hw.map((h, i) => (
                <View key={`spec-${i}`} style={[WS.specRow, i % 2 === 1 ? { backgroundColor: STRIPE } : {}]}>
                  <Text style={[WS.specLabel, { width: 90 }]}>{h.type}</Text>
                  <Text style={WS.specValue}>{h.part_no || h.notes || "—"}</Text>
                </View>
              ))}
              {/*
                THIS finish group's own record, from finish_group_hardware, for every
                role spec level did not claim. Until 2026-08 this block rendered
                spec-level free text only, so a hinge changed on the Schedules tab
                never reached the work order at all.
              */}
              {fgHwShown.map((h, i) => (
                <View key={`fg-${i}`} style={[WS.specRow, (hw.length + i) % 2 === 1 ? { backgroundColor: STRIPE } : {}]}>
                  <Text style={[WS.specLabel, { width: 90 }]}>
                    {h.role_label}{h.slot_label ? ` · ${h.slot_label}` : ""}
                  </Text>
                  <Text style={WS.specValue}>
                    {[h.hardware_name, h.qty ? `× ${h.qty}` : "", h.notes].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
              ))}
              {fgPulls.length > 0 && (
                <>
                  <View style={WS.pullSubHead}>
                    <Text style={WS.pullSubTx}>PULLS</Text>
                  </View>
                  {fgPulls.map((p, i) => (
                    <View key={i} style={[WS.specRow, i % 2 === 1 ? { backgroundColor: STRIPE } : {}]}>
                      <Text style={[WS.specLabel, { width: 90 }]}>{p.where_used || `Pull ${i + 1}`}</Text>
                      <Text style={WS.specValue}>
                        {[p.description, p.part_no, p.finish_color].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── MOLDINGS ──────────────────────────────────────────────────── */}
      {/* ── ACCESSORIES ──────────────────────────────────────────────── */}
      {(() => {
        // Room-level accessories for rooms in this FG
        const fgAccs = fgRooms.flatMap(r => r.accessories.map(a => ({ ...a, roomName: r.name })));
        // Spec-level accessories (from Spec Details tab) — show all on every WO sheet
        const specAccs = data.spec_accessories ?? [];
        if (fgAccs.length === 0 && specAccs.length === 0) return null;
        return (
          <View style={{ marginBottom: 4 }}>
            <Text style={WS.fullSecHead}>ACCESSORIES</Text>
            <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
              <Text style={[WS.th, { flex: 1.5 }]}>Room</Text>
              <Text style={[WS.th, { flex: 2.5 }]}>Item</Text>
              <Text style={[WS.th, { flex: 1 }]}>Part #</Text>
              <Text style={[WS.th, { flex: 0.6 }]}>Size</Text>
              <Text style={[WS.th, { flex: 0.6 }]}>Hand</Text>
              <Text style={[WS.th, { flex: 0.5 }]}>Qty</Text>
            </View>
            {fgAccs.map((a, i) => (
              <View key={`r-${i}`} style={i % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
                <Text style={[WS.tdBold, { flex: 1.5 }]}>{a.roomName}</Text>
                <Text style={[WS.tdBold, { flex: 2.5 }]}>{d(a.name)}</Text>
                <Text style={[WS.td,     { flex: 1 }]}>{d(a.series)}</Text>
                <Text style={[WS.td,     { flex: 0.6 }]}>{a.size ? `${a.size}"` : "—"}</Text>
                <Text style={[WS.td,     { flex: 0.6 }]}>{a.handed && a.handed !== "N/A" ? a.handed : "—"}</Text>
                <Text style={[WS.td,     { flex: 0.5 }]}>{String(a.qty)}</Text>
              </View>
            ))}
            {specAccs.map((a, i) => (
              <View key={`s-${i}`} style={(fgAccs.length + i) % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
                <Text style={[WS.tdBold, { flex: 1.5 }]}>{d(a.room) || "—"}</Text>
                <Text style={[WS.tdBold, { flex: 2.5 }]}>{d(a.description || a.type)}</Text>
                <Text style={[WS.td,     { flex: 1 }]}>{d(a.part_number)}</Text>
                <Text style={[WS.td,     { flex: 0.6 }]}>{a.size ? `${a.size}"` : "—"}</Text>
                <Text style={[WS.td,     { flex: 0.6 }]}>{a.handed && a.handed !== "N/A" ? a.handed : "—"}</Text>
                <Text style={[WS.td,     { flex: 0.5 }]}>{String(a.qty)}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {moldings.length > 0 && (() => {
        // Build rollup: group by type_label + profile_name + size_in, sum LF
        const rollupMap = new Map<string, { type_label: string; profile_name: string; size_in: number | null; material_name: string; total_lf: number }>();
        for (const m of moldings) {
          const key = `${m.type_label}||${m.profile_name}||${m.size_in ?? ""}`;
          const cur = rollupMap.get(key) ?? { type_label: m.type_label, profile_name: m.profile_name, size_in: m.size_in, material_name: m.material_name, total_lf: 0 };
          cur.total_lf += m.qty_lf ?? 0;
          rollupMap.set(key, cur);
        }
        const rollupRows = Array.from(rollupMap.values());
        const grandTotal = rollupRows.reduce((s, r) => s + r.total_lf, 0);
        return (
          <View style={{ marginBottom: 4 }}>
            <Text style={WS.fullSecHead}>MOLDINGS</Text>
            {/* Line items */}
            <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
              {[{ l: "Type", w: 1.5 }, { l: "Profile", w: 1.5 }, { l: "Size", w: 0.7 }, { l: "Material", w: 1.5 }, { l: "Qty (LF)", w: 0.8 }, { l: "Notes", w: 2 }].map((h, i) => (
                <Text key={i} style={[WS.th, { flex: h.w }]}>{h.l}</Text>
              ))}
            </View>
            {moldings.map((m, i) => (
              <View key={i} style={i % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
                <Text style={[WS.tdBold, { flex: 1.5 }]}>{m.type_label}</Text>
                <Text style={[WS.td, { flex: 1.5 }]}>{d(m.profile_name)}</Text>
                <Text style={[WS.td, { flex: 0.7 }]}>{m.size_in ? `${m.size_in}"` : "—"}</Text>
                <Text style={[WS.td, { flex: 1.5 }]}>{d(m.material_name)}</Text>
                <Text style={[WS.td, { flex: 0.8 }]}>{m.qty_lf ?? "—"}</Text>
                <Text style={[WS.tdMu, { flex: 2 }]}>{d(m.notes)}</Text>
              </View>
            ))}
            {/* Rollup / totals */}
            <View style={{ flexDirection: "row", backgroundColor: HEAD_BG, marginTop: 3 }}>
              <Text style={[WS.th, { flex: 1.5 }]}>ROLLUP — TYPE</Text>
              <Text style={[WS.th, { flex: 1.5 }]}>Profile</Text>
              <Text style={[WS.th, { flex: 0.7 }]}>Size</Text>
              <Text style={[WS.th, { flex: 1.5 }]}>Material</Text>
              <Text style={[WS.th, { flex: 0.8 }]}>Total LF</Text>
              <Text style={[WS.th, { flex: 2 }]}></Text>
            </View>
            {rollupRows.map((r, ri) => (
              <View key={ri} style={ri % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
                <Text style={[WS.tdBold, { flex: 1.5 }]}>{r.type_label}</Text>
                <Text style={[WS.td,     { flex: 1.5 }]}>{d(r.profile_name)}</Text>
                <Text style={[WS.td,     { flex: 0.7 }]}>{r.size_in ? `${r.size_in}"` : "—"}</Text>
                <Text style={[WS.td,     { flex: 1.5 }]}>{d(r.material_name)}</Text>
                <Text style={[WS.tdBold, { flex: 0.8 }]}>{r.total_lf > 0 ? r.total_lf.toFixed(1) : "—"}</Text>
                <Text style={[WS.td,     { flex: 2 }]}></Text>
              </View>
            ))}
            {/* Grand total row */}
            <View style={[WS.tableRow, { backgroundColor: "#f08122" + "22" }]}>
              <Text style={[WS.tdBold, { flex: 5.2, color: "#f08122" }]}>GRAND TOTAL</Text>
              <Text style={[WS.tdBold, { flex: 0.8, color: "#f08122" }]}>{grandTotal > 0 ? grandTotal.toFixed(1) : "—"} LF</Text>
              <Text style={[WS.td,     { flex: 2 }]}></Text>
            </View>
          </View>
        );
      })()}

      {/* ── TRIM MOLDING ─────────────────────────────────────────────── */}
      {(() => {
        const fgTrimRows = fgRooms.flatMap(r => (data.room_trim[r.id] ?? []).map(t => ({ ...t, roomName: r.name })));
        if (fgTrimRows.length === 0) return null;
        // Roll up by trim_type + size_desc — different sizes stay as separate rows
        type TrimRollup = { type: string; size_desc: string; material: string; notes: string[]; lf: number };
        const rollupMap = new Map<string, TrimRollup>();
        for (const t of fgTrimRows) {
          const key = `${t.trim_type}::${t.size_desc ?? ""}`;
          const existing = rollupMap.get(key) ?? { type: t.trim_type, size_desc: t.size_desc ?? "", material: t.material ?? "", notes: [], lf: 0 };
          existing.lf += (t.qty_lf ?? 0);
          if (t.notes?.trim()) existing.notes.push(t.notes.trim());
          rollupMap.set(key, existing);
        }
        const rollupRows = Array.from(rollupMap.values());
        return (
          <View style={{ marginBottom: 4 }}>
            <Text style={WS.fullSecHead}>TRIM MOLDING</Text>
            <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
              <Text style={[WS.th, { flex: 2 }]}>Type</Text>
              <Text style={[WS.th, { flex: 2 }]}>Size / Profile</Text>
              <Text style={[WS.th, { flex: 2.5 }]}>Notes</Text>
              <Text style={[WS.th, { flex: 0.8 }]}>Total (LF)</Text>
            </View>
            {rollupRows.map((r, i) => (
              <View key={i} style={i % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
                <Text style={[WS.tdBold, { flex: 2 }]}>{r.type}</Text>
                <Text style={[WS.td,     { flex: 2 }]}>{r.size_desc || "—"}</Text>
                <Text style={[WS.td,     { flex: 2.5 }]}>{[...new Set(r.notes)].join("; ") || "—"}</Text>
                <Text style={[WS.td,     { flex: 0.8 }]}>{r.lf > 0 ? r.lf.toFixed(1) : "—"}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {/* ── DOOR & DF SCHEDULE ──────────────────────────────────────────── */}
      {fg.door_fronts.filter(df => df.style_name || df.material_name || df.notes
                                 || df.oe_name || df.ie_name || df.panel_name).length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={WS.fullSecHead}>DOOR &amp; DRAWER FRONT SCHEDULE</Text>
          <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
            {/*
              Type is the widest column because it carries role AND slot label —
              "Drawer Fronts — 12\" DRAWERS". At 1.6 the new Edge/Inside/Panel column
              squeezed it enough that @react-pdf hyphenated mid-word: the sheet read
              `12" DRAW-ERS`. The data was all there; it was just unreadable, which on
              a shop sheet is the same problem.
            */}
            <Text style={[WS.th, { flex: 2.4 }]}>Type</Text>
            <Text style={[WS.th, { flex: 1.7 }]}>Style</Text>
            <Text style={[WS.th, { flex: 1.5 }]}>Material / Species</Text>
            {/*
              Edge / Inside / Panel — the Cab Door Custom options.

              oe_name, ie_name and panel_name have been on DoorFrontView since it was
              written and printed on NO document. So a custom cab door — the one thing
              on this sheet that cannot be inferred from a catalog name — reached the
              shop as bare "Cab Door Custom" and someone had to ring the office. Karl:
              "I need all that to pull through to the spec."
            */}
            <Text style={[WS.th, { flex: 1.4 }]}>Edge / Inside / Panel</Text>
            <Text style={[WS.th, { flex: 0.7 }]}>Grain</Text>
            <Text style={[WS.th, { flex: 1.2 }]}>Notes</Text>
          </View>
          {fg.door_fronts.map((df, i) => (
            <View key={i} style={i % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
              <Text style={[WS.tdBold, { flex: 2.4 }]}>
                {df.role_label}{df.slot_label ? ` — ${df.slot_label}` : ""}
              </Text>
              <Text style={[WS.td, { flex: 1.7 }]}>{d(df.style_name)}</Text>
              <Text style={[WS.td, { flex: 1.5 }]}>{d(df.material_name)}</Text>
              <Text style={[WS.td, { flex: 1.4 }]}>
                {[df.oe_name, df.ie_name, df.panel_name].filter(Boolean).join(" / ") || "—"}
              </Text>
              <Text style={[WS.td, { flex: 0.7 }]}>{d(df.grain || fg.grain_orientation)}</Text>
              <Text style={[WS.tdMu, { flex: 1.2 }]}>{d(df.notes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── DRAWER & ROLLOUT SCHEDULE ────────────────────────────────────── */}
      {fg.drawers.filter(dr => dr.drawer_box_name || dr.notes).length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={WS.fullSecHead}>DRAWER &amp; ROLLOUT SCHEDULE</Text>
          <View style={{ flexDirection: "row", backgroundColor: HEAD_BG }}>
            <Text style={[WS.th, { flex: 1.6 }]}>Type</Text>
            <Text style={[WS.th, { flex: 2.5 }]}>Box / Style</Text>
            <Text style={[WS.th, { flex: 2.5 }]}>Slides</Text>
            <Text style={[WS.th, { flex: 1.4 }]}>Notes</Text>
          </View>
          {fg.drawers.map((dr, i) => (
            <View key={i} style={i % 2 === 0 ? WS.tableRow : WS.tableRowAlt}>
              <Text style={[WS.tdBold, { flex: 1.6 }]}>
                {dr.role_label}{dr.slot_label ? ` — ${dr.slot_label}` : ""}
              </Text>
              <Text style={[WS.td, { flex: 2.5 }]}>{d(dr.drawer_box_name)}</Text>
              <Text style={[WS.td, { flex: 2.5 }]}>{d(dr.slides_name)}</Text>
              <Text style={[WS.tdMu, { flex: 1.4 }]}>{d(dr.notes)}</Text>
            </View>
          ))}
        </View>
      )}


      {/* ── JOB NOTES ────────────────────────────────────────────────────── */}
      {(() => {
        const noteRows = [
          { label: "Shop Notes",      body: cleanNotes(data.notes_shop) },
          { label: "Install Notes",   body: cleanNotes(data.notes_install) },
          { label: "Finishing Notes", body: cleanNotes(data.notes_finishing) },
          { label: "Client Notes",    body: cleanNotes(data.notes_client) },
        ].filter(n => n.body);
        if (noteRows.length === 0) return null;
        return (
          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <Text style={WS.fullSecHead}>NOTES</Text>
            {noteRows.map((n, ni) => (
              <View key={ni} style={ni % 2 === 0 ? WS.tableRow : WS.tableRowAlt} wrap={false}>
                <Text style={[WS.tdBold, { flex: 1.5 }]}>{n.label}</Text>
                <Text style={[WS.tdMu,   { flex: 6 }]}>{n.body}</Text>
              </View>
            ))}
          </View>
        );
      })()}

            <View style={WS.footer} fixed>
        <Text style={WS.footerTxt}>
          {[data.spec_name, data.job_id, fg.label, "Work Order Spec"].filter(Boolean).join("  ·  ")}
        </Text>
        <Text style={WS.footerTxt} render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

/**
 * What renderToBuffer() actually accepts. The render functions below used to return
 * a bare React.ReactElement, which discards the Document props and made every
 * renderToBuffer() call a type error nobody had fixed. Derived from <Document> so it
 * stays correct if the library's props change.
 */
type DocumentElement = React.ReactElement<React.ComponentProps<typeof Document>>;

// ─── Documents ───────────────────────────────────────────────────────────────
//
// There used to be one document holding the client pages AND every work order sheet.
// That meant the client signed the shop paperwork: buildContractPacket() in
// lib/docusign.ts sends this PDF for signature, so drawer-box construction, slide
// part numbers and shop notes all travelled into the envelope with the finish
// schedule.
//
// Now: one client document, and one per finish group for the floor. They share the
// same page components, so a change to the finish schedule cannot reach the client
// copy and miss the shop copy.

/** Which optional pages actually have something to say. */
function pageFlags(data: SpecPDFData) {
  return {
    hasNotes: !!(
      cleanNotes(data.notes_install) || cleanNotes(data.notes_finishing) ||
      cleanNotes(data.notes_shop)    || cleanNotes(data.notes_client)
    ),
    hasAppliances: (data.spec_appliances_list?.length ?? 0) > 0,
    hasHardware:   (data.spec_hardware?.length ?? 0) > 0,
    hasAccs:       (data.spec_accessories?.length ?? 0) > 0 || (data.accessories_rollup?.length ?? 0) > 0,
    hasMoldings:   data.finish_groups.some((fg) => fg.moldings.some((m) => m.qty_lf || m.type_label)),
  };
}

function ClientPages({ data }: { data: SpecPDFData }) {
  const f = pageFlags(data);
  return (
    <>
      <FinishSchedulePage data={data} />
      {(f.hasAccs || f.hasMoldings) && <AccessoriesMoldingsPage data={data} />}
      {(f.hasAppliances || f.hasHardware) && <AppliancesHardwarePage data={data} />}
      {f.hasNotes && <NotesPage data={data} />}
      <SignOffPage data={data} />
    </>
  );
}

/** The client's document. Sign-off is always the final page. */
export function renderClientSpecPDF(data: SpecPDFData): DocumentElement {
  return <Document><ClientPages data={data} /></Document>;
}

/** One finish group's work order — what goes to the floor. */
export function renderWorkOrderPDF(data: SpecPDFData, fg: FinishGroupView): DocumentElement {
  const i = data.finish_groups.findIndex((g) => g.id === fg.id);
  return <Document><WorkOrderPage data={data} fg={fg} index={i < 0 ? 0 : i} /></Document>;
}

/** Every work order in one file, for printing the shop set in a single job. */
export function renderAllWorkOrdersPDF(data: SpecPDFData): DocumentElement {
  return (
    <Document>
      {data.finish_groups.map((fg, i) => (
        <WorkOrderPage key={fg.id} data={data} fg={fg} index={i} />
      ))}
    </Document>
  );
}

/**
 * Client pages plus every work order in one file.
 *
 * Only for callers that genuinely want everything. Never use it for anything the
 * client sees — renderClientSpecPDF is for that, and confusing the two is the bug
 * this split exists to fix.
 */
export function renderSpecPDF(data: SpecPDFData): DocumentElement {
  return (
    <Document>
      <ClientPages data={data} />
      {data.finish_groups.map((fg, i) => (
        <WorkOrderPage key={fg.id} data={data} fg={fg} index={i} />
      ))}
    </Document>
  );
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}

export async function renderClientSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderClientSpecPDF(data));
}

export async function renderWorkOrderPDFBuffer(data: SpecPDFData, fg: FinishGroupView): Promise<Buffer> {
  return renderToBuffer(renderWorkOrderPDF(data, fg));
}

export async function renderAllWorkOrdersPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderAllWorkOrdersPDF(data));
}
