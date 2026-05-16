/**
 * PDF generator for residential cabinet specs.
 *
 * Rebuilt 2026-05-06 for the spec form expansion v2 (cover sheet redesign).
 * Page sequence:
 *   C.1   Room-matrix coversheet (landscape)
 *           - Project header
 *           - Finish-group key
 *           - Room x Finish Group matrix
 *           - Accessories rollup (job-total — purchasing view)
 *           - Moldings rollup (job-total — purchasing view)
 *   F.x   Per-finish-group cover (landscape, faithful to RESIDENTIAL COVER SHEET.xlsx)
 *           - Header strip with Job#/PM/Engineer/Finish + Notes
 *           - Material / Door / Drawer / Edgeband / Hardware schedules
 *           - Right column: Finish / Moldings / Countertops
 *   N.1   Notes (landscape, audience-split: install / finishing / shop / client)
 *
 * H.1, A.1, M.1 (the old global hardware/accessories/moldings pages) are gone.
 * Their content lives on either the per-finish covers (shop/install view) or
 * the C.1 coversheet rollups (engineer purchasing view).
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const ORANGE = "#f08122";
const DARK   = "#222";
const MUTED  = "#888";
const HAIR   = "#e0e0e0";
const HEAD_BG = "#3d3d3d";
const STRIPE  = "#f7f7f5";

const S = StyleSheet.create({
  // Landscape LETTER. paddingTop accommodates the fixed title block.
  page:       { paddingTop: 78, paddingBottom: 36, paddingLeft: 28, paddingRight: 28, fontSize: 8, fontFamily: "Helvetica", color: DARK },

  // Title block (top-of-page, fixed)
  tbWrap:     { position: "absolute", top: 14, left: 22, right: 22 },
  tbTopRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 3 },
  tbLeft:     { flex: 1 },
  tbBrand:    { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111", letterSpacing: 1 },
  tbStageRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  tbStage:    { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 1.5, marginRight: 8 },
  tbCover:    { fontSize: 7, color: MUTED, letterSpacing: 1 },
  tbProject:  { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 1 },
  tbRight:    { fontSize: 6.5, color: "#444", textAlign: "right", lineHeight: 1.3 },
  tbAddrRow:  { borderTopWidth: 0.5, borderTopColor: "#bbb", marginTop: 3, paddingTop: 2, fontSize: 6.5, color: MUTED, textAlign: "center" },
  tbBanner:   { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.4, borderTopColor: HAIR, borderBottomWidth: 1.2, borderBottomColor: ORANGE, marginTop: 2, paddingVertical: 2 },
  tbBnrLeft:  { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.5 },
  tbBnrRight: { fontSize: 6.5, color: MUTED, letterSpacing: 1 },

  // Footer
  footer:    { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between" },
  footerTxt: { fontSize: 6.5, color: "#aaa" },

  // Page heading
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 3 },
  h2: { fontSize: 9, color: MUTED, marginBottom: 8 },

  // Section header (orange band, like the xlsx)
  bandRow:   { flexDirection: "row", backgroundColor: STRIPE, borderBottomWidth: 1, borderBottomColor: ORANGE, paddingHorizontal: 5, paddingVertical: 3, marginTop: 6, marginBottom: 0 },
  bandTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 1, textTransform: "uppercase", flex: 1 },

  // Two-column page layout (per-finish cover)
  twoCol:    { flexDirection: "row", gap: 8 },
  colLeft:   { flex: 1.55 },
  colRight:  { flex: 1 },

  // Tables
  tHead:    { flexDirection: "row", backgroundColor: HEAD_BG, paddingHorizontal: 4, paddingVertical: 3 },
  tHeadCl:  { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.4 },
  tRow:     { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: HAIR, minHeight: 14 },
  tRowAlt:  { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: HAIR, backgroundColor: STRIPE, minHeight: 14 },
  tCell:    { fontSize: 7.5, color: DARK },

  // Header strip (top of per-finish cover): Job/WO/Date/PM/Eng/Finish + Notes
  headStrip:    { flexDirection: "row", borderWidth: 0.6, borderColor: "#999", marginBottom: 6 },
  headLabel:    { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  headVal:      { fontSize: 8.5, color: DARK, marginTop: 1 },
  headCell:     { paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 0.6, borderRightColor: "#bbb" },
  headCellLast: { paddingHorizontal: 6, paddingVertical: 4 },

  // Notes box
  notesBox:   { backgroundColor: STRIPE, padding: 8, borderRadius: 2, marginBottom: 6 },
  notesLabel: { fontSize: 6.5, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 },
  notesBody:  { fontSize: 8, color: DARK, lineHeight: 1.4 },

  // Inline label/value
  kv:        { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  kvLabel:   { width: 90, fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" },
  kvValue:   { flex: 1, fontSize: 8, color: DARK },

  // Empty-state
  empty:     { fontSize: 7.5, fontStyle: "italic", color: MUTED, padding: 5 },

  // Project metadata (cover page)
  metaRow:   { flexDirection: "row", gap: 8, marginBottom: 8 },
  metaBox:   { flex: 1, backgroundColor: STRIPE, padding: 6, borderRadius: 2 },
  metaLabel: { fontSize: 6, color: "#aaa", fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 2, textTransform: "uppercase" },
  metaVal:   { fontSize: 8.5, color: DARK },

  // Finish group key (coversheet)
  fgKey:      { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: HAIR, minHeight: 14 },
  fgKeyLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ORANGE, width: 110 },
  fgKeyDetail:{ fontSize: 7.5, color: DARK, flex: 1 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dash = (s: string | number | null | undefined) =>
  (s === null || s === undefined || s === "") ? "—" : String(s);

const stageMap: Record<string, string> = {
  C: "COVER", F: "FINISH", H: "HARDWARE",
  A: "ACCESSORIES", M: "MOLDINGS", N: "NOTES", D: "DRAWINGS",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TitleBlock({ data, code }: { data: SpecPDFData; code: string }) {
  const stageLetter = code.split(".")[0] || "C";
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
          {data.pm           && <Text style={S.tbRight}>Project MGR: {data.pm}</Text>}
          {data.builder_name && <Text style={S.tbRight}>Builder: {data.builder_name}</Text>}
          <Text style={S.tbRight}>Date: {new Date(data.generated_at).toLocaleDateString()}</Text>
          <Text style={S.tbRight} render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
        </View>
      </View>
      <Text style={S.tbAddrRow}>250 W Anton Ave   Coeur d&apos; Alene, Idaho 83815   (208) 772-2377</Text>
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
    <View style={S.bandRow}>
      <Text style={S.bandTitle}>{title}</Text>
      {right ? <Text style={[S.bandTitle, { textAlign: "right", flex: 0, color: ORANGE }]}>{right}</Text> : null}
    </View>
  );
}

function MetaBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={S.metaBox}>
      <Text style={S.metaLabel}>{label}</Text>
      <Text style={S.metaVal}>{children}</Text>
    </View>
  );
}

// ─── C.1 Room-matrix coversheet ───────────────────────────────────────────────

function CoverPage({ data }: { data: SpecPDFData }) {
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code="C.1" />
      <Text style={S.h1}>Project Cover · Room × Finish Matrix</Text>
      <Text style={S.h2}>Engineer overview · accessories and moldings rollups for purchasing</Text>

      {/* Project metadata */}
      <View style={S.metaRow}>
        <MetaBox label="Client">{data.client_name}</MetaBox>
        <MetaBox label="Site">{[data.site_address, data.city].filter(Boolean).join(", ")}</MetaBox>
        <MetaBox label="Builder">{[data.builder_name, data.builder_company].filter(Boolean).join(" — ") || "—"}</MetaBox>
        <MetaBox label="PM">{data.pm ?? "—"}</MetaBox>
        <MetaBox label="Delivery">{data.delivery_date ?? "TBD"}</MetaBox>
      </View>

      {/* Finish-group key (lets the matrix below stay terse) */}
      <Band title="Finish Group Key" />
      {data.finish_groups.length === 0 ? (
        <Text style={S.empty}>No finish groups defined.</Text>
      ) : data.finish_groups.map((fg) => {
        const finishParts = [
          fg.finish.paint_name && `Paint: ${fg.finish.paint_name}`,
          fg.finish.stain_name && `Stain: ${fg.finish.stain_name}`,
          fg.finish.glaze_name && `Glaze: ${fg.finish.glaze_name}`,
          fg.finish.topcoat_name && `Topcoat: ${fg.finish.topcoat_name}`,
          fg.finish.sheen_name && `Sheen: ${fg.finish.sheen_name}`,
        ].filter(Boolean).join(" · ");
        return (
          <View key={fg.id} style={S.fgKey}>
            <Text style={S.fgKeyLabel}>{fg.label}</Text>
            <Text style={S.fgKeyDetail}>{finishParts || "—"}</Text>
          </View>
        );
      })}

      {/* Two-column body: Matrix on left, Rollups on right */}
      <View style={[S.twoCol, { marginTop: 10 }]}>
        <View style={S.colLeft}>
          <Band title="Room × Finish Matrix" />
          {data.rooms.length === 0 ? (
            <Text style={S.empty}>No rooms defined.</Text>
          ) : (
            <>
              <View style={S.tHead}>
                <Text style={[S.tHeadCl, { flex: 1.4 }]}>Room</Text>
                <Text style={[S.tHeadCl, { flex: 1.4 }]}>Finish Group</Text>
                <Text style={[S.tHeadCl, { flex: 1 }]}>Zone</Text>
              </View>
              {data.rooms.flatMap((r, ri) =>
                r.finishes.length === 0
                  ? [(
                    <View key={r.id} style={ri % 2 === 0 ? S.tRow : S.tRowAlt}>
                      <Text style={[S.tCell, { flex: 1.4, fontFamily: "Helvetica-Bold" }]}>{r.name || "—"}</Text>
                      <Text style={[S.tCell, { flex: 1.4, color: "#c44" }]}>(no finish assigned)</Text>
                      <Text style={[S.tCell, { flex: 1 }]}>—</Text>
                    </View>
                  )]
                  : r.finishes.map((f, i) => (
                    <View key={`${r.id}-${i}`} style={ri % 2 === 0 ? S.tRow : S.tRowAlt}>
                      <Text style={[S.tCell, { flex: 1.4, fontFamily: i === 0 ? "Helvetica-Bold" : "Helvetica" }]}>
                        {i === 0 ? (r.name || "—") : ""}
                      </Text>
                      <Text style={[S.tCell, { flex: 1.4, color: ORANGE }]}>{f.finish_label}</Text>
                      <Text style={[S.tCell, { flex: 1 }]}>{f.zone || "—"}</Text>
                    </View>
                  ))
              )}
            </>
          )}
        </View>
        <View style={S.colRight}>
          {/* Accessories rollup (purchasing view) */}
          <Band title="Accessories Rollup" right="Job Total" />
          {data.accessories_rollup.length === 0 ? (
            <Text style={S.empty}>No accessories assigned.</Text>
          ) : (
            <>
              <View style={S.tHead}>
                <Text style={[S.tHeadCl, { flex: 2.2 }]}>Accessory</Text>
                <Text style={[S.tHeadCl, { flex: 1 }]}>Brand</Text>
                <Text style={[S.tHeadCl, { flex: 0.5, textAlign: "right" }]}>Qty</Text>
              </View>
              {data.accessories_rollup.map((a, i) => (
                <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
                  <Text style={[S.tCell, { flex: 2.2 }]}>{a.name}</Text>
                  <Text style={[S.tCell, { flex: 1 }]}>{a.brand || "—"}</Text>
                  <Text style={[S.tCell, { flex: 0.5, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{a.total_qty}</Text>
                </View>
              ))}
            </>
          )}

          {/* Moldings rollup (purchasing view) */}
          <Band title="Moldings Rollup" right="Job Total" />
          {data.moldings_rollup.length === 0 ? (
            <Text style={S.empty}>No moldings specified.</Text>
          ) : (
            <>
              <View style={S.tHead}>
                <Text style={[S.tHeadCl, { flex: 1.2 }]}>Type</Text>
                <Text style={[S.tHeadCl, { flex: 1.4 }]}>Profile · Material</Text>
                <Text style={[S.tHeadCl, { flex: 0.6, textAlign: "right" }]}>Total LF</Text>
              </View>
              {data.moldings_rollup.map((m, i) => (
                <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
                  <Text style={[S.tCell, { flex: 1.2 }]}>{m.type_label}</Text>
                  <Text style={[S.tCell, { flex: 1.4 }]}>
                    {[m.profile_name, m.size_in ? `${m.size_in}"` : null, m.material_name].filter(Boolean).join(" · ") || "—"}
                  </Text>
                  <Text style={[S.tCell, { flex: 0.6, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                    {m.total_lf > 0 ? m.total_lf.toFixed(1) : "—"}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      </View>

      <PageFooter data={data} />
    </Page>
  );
}

// ─── F.x Per-finish-group cover ───────────────────────────────────────────────

function FinishHeaderStrip({ data, fg }: { data: SpecPDFData; fg: FinishGroupView }) {
  return (
    <View style={S.headStrip}>
      <View style={[S.headCell, { flex: 1 }]}>
        <Text style={S.headLabel}>Job #</Text>
        <Text style={S.headVal}>{data.job_id}</Text>
      </View>
      <View style={[S.headCell, { flex: 1 }]}>
        <Text style={S.headLabel}>WO #</Text>
        <Text style={S.headVal}>—</Text>
      </View>
      <View style={[S.headCell, { flex: 1.2 }]}>
        <Text style={S.headLabel}>Date</Text>
        <Text style={S.headVal}>{new Date(data.generated_at).toLocaleDateString()}</Text>
      </View>
      <View style={[S.headCell, { flex: 1.4 }]}>
        <Text style={S.headLabel}>Project Manager</Text>
        <Text style={S.headVal}>{data.pm ?? "—"}</Text>
      </View>
      <View style={[S.headCell, { flex: 1.4 }]}>
        <Text style={S.headLabel}>Engineer</Text>
        <Text style={S.headVal}>—</Text>
      </View>
      <View style={[S.headCell, { flex: 2 }]}>
        <Text style={S.headLabel}>Finish</Text>
        <Text style={S.headVal}>{fg.label}</Text>
      </View>
      <View style={[S.headCellLast, { flex: 3 }]}>
        <Text style={S.headLabel}>Notes</Text>
        <Text style={[S.headVal, { fontSize: 7.5 }]} numberOfLines={3}>{fg.notes || "—"}</Text>
      </View>
    </View>
  );
}

function FinishGroupPage({ data, fg, idx }: { data: SpecPDFData; fg: FinishGroupView; idx: number }) {
  return (
    <Page size="LETTER" orientation="landscape" style={S.page}>
      <TitleBlock data={data} code={`F.${idx + 1}`} />
      <FinishHeaderStrip data={data} fg={fg} />
      <View style={S.body}>
        <View style={S.colLeft}>
          {/* Materials schedule */}
          <Band title="Materials" />
          {fg.materials.length === 0 ? (
            <Text style={S.empty}>No materials specified.</Text>
          ) : fg.materials.map((m, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1.2 }]}>{m.role_label}</Text>
              <Text style={[S.tCell, { flex: 2 }]}>{m.material_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{m.where_used || "—"}</Text>
            </View>
          ))}

          {/* Door fronts */}
          <Band title="Door Fronts" />
          {fg.door_fronts.length === 0 ? (
            <Text style={S.empty}>No door fronts specified.</Text>
          ) : fg.door_fronts.map((d, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1 }]}>{d.role_label}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{d.style_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{d.material_name || "—"}</Text>
            </View>
          ))}

          {/* Drawers */}
          <Band title="Drawers" />
          {fg.drawers.length === 0 ? (
            <Text style={S.empty}>No drawers specified.</Text>
          ) : fg.drawers.map((d, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1 }]}>{d.role_label}</Text>
              <Text style={[S.tCell, { flex: 2 }]}>{d.drawer_box_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{d.slides_name || "—"}</Text>
            </View>
          ))}

          {/* Edgebands */}
          <Band title="Edgebands" />
          {fg.edgebands.length === 0 ? (
            <Text style={S.empty}>No edgebands specified.</Text>
          ) : (
            <>
              <View style={[S.tRow, { backgroundColor: "#e8e8e8" }]}>
                <Text style={[S.tCell, { flex: 0.5, fontWeight: "bold" }]}>ID</Text>
                <Text style={[S.tCell, { flex: 0.8, fontWeight: "bold" }]}>Thickness</Text>
                <Text style={[S.tCell, { flex: 1.2, fontWeight: "bold" }]}>Mfr #</Text>
                <Text style={[S.tCell, { flex: 2, fontWeight: "bold" }]}>Description</Text>
                <Text style={[S.tCell, { flex: 2, fontWeight: "bold" }]}>Where Used</Text>
                <Text style={[S.tCell, { flex: 1.5, fontWeight: "bold" }]}>Notes</Text>
              </View>
              {fg.edgebands.map((e, i) => (
                <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
                  <Text style={[S.tCell, { flex: 0.5 }]}>{e.code}</Text>
                  <Text style={[S.tCell, { flex: 0.8 }]}>{e.thickness || "—"}</Text>
                  <Text style={[S.tCell, { flex: 1.2 }]}>{e.supplier || "—"}</Text>
                  <Text style={[S.tCell, { flex: 2 }]}>{e.edgeband_name || "—"}</Text>
                  <Text style={[S.tCell, { flex: 2 }]}>{e.where_used_label || "—"}</Text>
                  <Text style={[S.tCell, { flex: 1.5 }]}>{e.notes || ""}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={S.colRight}>
          {/* Hardware */}
          <Band title="Hardware" />
          {fg.hardware.length === 0 ? (
            <Text style={S.empty}>No hardware specified.</Text>
          ) : fg.hardware.map((h, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1.2 }]}>{h.role_label}</Text>
              <Text style={[S.tCell, { flex: 2 }]}>{h.hardware_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 0.5, textAlign: "right" }]}>{h.qty ?? "—"}</Text>
            </View>
          ))}

          {/* Moldings */}
          <Band title="Moldings" />
          {fg.moldings.length === 0 ? (
            <Text style={S.empty}>No moldings specified.</Text>
          ) : fg.moldings.map((m, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1.4 }]}>{m.type_label}</Text>
              <Text style={[S.tCell, { flex: 1.4 }]}>{m.profile_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 0.6, textAlign: "right" }]}>{m.qty_lf ?? "—"}</Text>
            </View>
          ))}

          {/* Countertops */}
          <Band title="Countertops" />
          {(!fg.countertops || fg.countertops.length === 0) ? (
            <Text style={S.empty}>No countertops specified.</Text>
          ) : fg.countertops.map((c, i) => (
            <View key={i} style={i % 2 === 0 ? S.tRow : S.tRowAlt}>
              <Text style={[S.tCell, { flex: 1.2 }]}>{c.location || "—"}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{c.style_name || "—"}</Text>
              <Text style={[S.tCell, { flex: 1.5 }]}>{c.material_name || "—"}</Text>
            </View>
          ))}
        </View>
      </View>
      <PageFooter data={data} />
    </Page>
  );
}

// ─── Main exported renderer ────────────────────────────────────────────────

export function renderSpecPDF(data: SpecPDFData): React.ReactElement {
  return (
    <Document>
      <CoverPage data={data} />
      {data.finish_groups.map((fg, i) => (
        <FinishGroupPage key={fg.id} data={data} fg={fg} idx={i} />
      ))}
    </Document>
  );
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}

export async function renderSpecPDFBuffer(data: SpecPDFData): Promise<Buffer> {
  return renderToBuffer(renderSpecPDF(data));
}
