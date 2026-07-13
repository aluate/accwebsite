/**
 * PDF generator for per-finish-group cover sheets (STN Coversheet).
 * Tabloid landscape: 17in x 11in = 1224 x 792 pts.
 */
import React from "react";
import {
  Document, Page, View, Text, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";
import type { FinishGroupView } from "@/lib/pdf-spec";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FinishGroupView };

export type WorkOrderRow = {
  id: string;
  wo_number: string | null;
  category_code: number;
  finish_group_id: string | null;
  description: string;
  status: string;
  notes: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ORANGE  = "#f08122";
const DARK    = "#1a1a1a";
const MUTED   = "#888";
const HAIR    = "#e0e0e0";
const HEAD_BG = "#2d2d2d";
const STRIPE  = "#f5f5f5";

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    paddingTop: 24, paddingBottom: 36,
    paddingLeft: 24, paddingRight: 24,
    fontSize: 7, fontFamily: "Helvetica", color: DARK,
    backgroundColor: "#FFFFFF",
  },

  // ── Header ──
  headerRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 6,
    borderBottomWidth: 1.5, borderBottomColor: ORANGE, paddingBottom: 4,
  },
  headerLeft:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK, flex: 2 },
  headerCenter: { fontSize: 10, fontFamily: "Helvetica-Bold", color: ORANGE, textAlign: "center", flex: 3, letterSpacing: 1.2 },
  headerRight:  { fontSize: 7.5, color: MUTED, textAlign: "right", flex: 2 },

  // ── Section heading ──
  secHead: {
    fontSize: 8, fontFamily: "Helvetica-Bold", color: ORANGE,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginTop: 10, marginBottom: 4,
    borderBottomWidth: 0.5, borderBottomColor: ORANGE, paddingBottom: 2,
  },

  // ── Summary grid ──
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  gridCell: { width: "25%", paddingVertical: 3, paddingHorizontal: 4 },
  gridLabel: { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 1 },
  gridValue: { fontSize: 7.5, color: DARK },

  // ── Table ──
  colHdr:   { flexDirection: "row", backgroundColor: HEAD_BG },
  colHdrTx: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase", letterSpacing: 0.3, padding: 4 },
  row:      { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR },
  rowAlt:   { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: HAIR, backgroundColor: STRIPE },
  cell:     { fontSize: 7, color: DARK, padding: 4, flexWrap: "wrap" },
  cellMu:   { fontSize: 7, color: MUTED, fontStyle: "italic", padding: 4 },

  // ── Footer ──
  footer:    { position: "absolute", bottom: 10, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between" },
  footerTxt: { fontSize: 6, color: "#aaa" },

  // ── Notes box ──
  notesBox:  { borderWidth: 0.5, borderColor: HAIR, borderRadius: 2, padding: 5, marginBottom: 6, marginTop: 2 },
  notesLbl:  { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  notesBody: { fontSize: 7, color: DARK, lineHeight: 1.4 },

  emptyRow: { padding: 6 },
  emptyTx:  { fontSize: 7, color: MUTED, fontStyle: "italic" },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const d = (s: string | number | null | undefined): string =>
  (s === null || s === undefined || String(s).trim() === "") ? "—" : String(s);

function fmtDate(iso?: string): string {
  const dt = iso ? new Date(iso) : new Date();
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtAppliedPanels(v: string | null | undefined): string {
  if (!v || v === "slab") return "Slab";
  if (v === "match_door") return "Match Door";
  return v;
}

const WO_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Complete",
  on_hold: "On Hold",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return <Text style={S.secHead}>{label}</Text>;
}

function EmptyRow({ label }: { label: string }) {
  return (
    <View style={S.emptyRow}>
      <Text style={S.emptyTx}>{label}</Text>
    </View>
  );
}

// ─── Cover Sheet Page ─────────────────────────────────────────────────────────

interface CoversheetPageProps {
  job: { job_number: string | null; site_address: string };
  fg: FinishGroupView;
  workOrders: WorkOrderRow[];
  fgIndex: number;
  generatedAt: string;
  rooms: Array<{ id: string; name: string; notes: string; finishes: Array<{ finish_group_id: string; finish_label: string; zone: string }> }>;
}

function CoversheetPage({ job, fg, workOrders, fgIndex, generatedAt, rooms }: CoversheetPageProps) {
  const jobNum = job.job_number ? String(job.job_number).padStart(5, "0") : "-----";
  const fgLabel = fg.label || `FG ${fgIndex}`;

  // Derive values
  const colorName = fg.finish.stain_name || fg.finish.paint_name || "";
  const carcass   = fg.materials.find(m => m.role === "cab_ext")?.name ?? "";
  const doorStyle = fg.door_fronts.find(d2 => d2.role === "base")?.style_name ?? "";
  const drawerBox = fg.drawers.find(d2 => d2.role === "drawer_box")?.drawer_box_name ?? "";

  // Rooms for this FG
  const fgRooms = rooms.filter(r =>
    r.finishes.some(f => f.finish_group_id === fg.id)
  );

  const summaryFields = [
    { label: "Finish Type",     value: d(fg.finish_type) },
    { label: "Color / Species", value: [d(colorName), d(fg.species)].filter(v => v !== "—").join(" / ") || "—" },
    { label: "Grade",           value: d(fg.grade) },
    { label: "Grain Orientation", value: d(fg.grain_orientation) },
    { label: "Carcass",         value: d(carcass) },
    { label: "Door Style",      value: d(doorStyle) },
    { label: "Drawer Box",      value: d(drawerBox) },
    { label: "Applied Panels",  value: fmtAppliedPanels(fg.applied_panels) },
    { label: "Rollout Box",     value: d(fg.rollout_box_name) },
  ];

  return (
    <Page size={[1224, 792]} style={S.page}>
      {/* Header */}
      <View style={S.headerRow}>
        <Text style={S.headerLeft}>{jobNum}  ·  {fgLabel}</Text>
        <Text style={S.headerCenter}>STN COVERSHEET</Text>
        <Text style={S.headerRight}>{fmtDate(generatedAt)}</Text>
      </View>

      {/* Section 1: FG Summary */}
      <SectionHead label="1. Finish Group Summary" />
      <View style={S.grid}>
        {summaryFields.map((f, i) => (
          <View key={i} style={S.gridCell}>
            <Text style={S.gridLabel}>{f.label}</Text>
            <Text style={S.gridValue}>{f.value}</Text>
          </View>
        ))}
      </View>
      {fg.notes ? (
        <View style={S.notesBox}>
          <Text style={S.notesLbl}>Notes</Text>
          <Text style={S.notesBody}>{fg.notes}</Text>
        </View>
      ) : null}

      {/* Section 2: Work Orders */}
      <SectionHead label="2. Work Orders" />
      {workOrders.length === 0 ? (
        <EmptyRow label="No work orders linked to this finish group." />
      ) : (
        <View style={{ marginBottom: 6 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>WO #</Text>
            <Text style={[S.colHdrTx, { flex: 0.6 }]}>Category</Text>
            <Text style={[S.colHdrTx, { flex: 3 }]}>Description</Text>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>Status</Text>
          </View>
          {workOrders.map((wo, i) => (
            <View key={wo.id} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, { flex: 0.8, fontFamily: "Helvetica-Bold" }]}>{d(wo.wo_number)}</Text>
              <Text style={[S.cell, { flex: 0.6 }]}>{d(wo.category_code)}</Text>
              <Text style={[S.cell, { flex: 3 }]}>{d(wo.description)}</Text>
              <Text style={[S.cell, { flex: 0.8 }]}>{WO_STATUS_LABEL[wo.status] ?? wo.status}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 3: EdgeBand Schedule */}
      <SectionHead label="3. Edgeband Schedule" />
      {fg.edgebands.length === 0 ? (
        <EmptyRow label="No edgebands defined for this finish group." />
      ) : (
        <View style={{ marginBottom: 6 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 0.5 }]}>Code</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Where Used</Text>
            <Text style={[S.colHdrTx, { flex: 2.5 }]}>Product Name</Text>
            <Text style={[S.colHdrTx, { flex: 0.8 }]}>Thickness</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Notes</Text>
          </View>
          {fg.edgebands.map((eb, i) => (
            <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, { flex: 0.5, fontFamily: "Helvetica-Bold", color: ORANGE }]}>{d(eb.code)}</Text>
              <Text style={[S.cell, { flex: 2 }]}>{d(eb.where_used_label)}</Text>
              <Text style={[S.cell, { flex: 2.5 }]}>{d(eb.edgeband_name)}</Text>
              <Text style={[S.cell, { flex: 0.8 }]}>{d(eb.thickness)}</Text>
              <Text style={[S.cellMu, { flex: 1.5 }]}>{d(eb.notes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 4: Moldings */}
      <SectionHead label="4. Moldings" />
      {fg.moldings.length === 0 ? (
        <EmptyRow label="No moldings defined for this finish group." />
      ) : (
        <View style={{ marginBottom: 6 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Type</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Profile</Text>
            <Text style={[S.colHdrTx, { flex: 0.6 }]}>Size (in)</Text>
            <Text style={[S.colHdrTx, { flex: 1.2 }]}>Material</Text>
            <Text style={[S.colHdrTx, { flex: 0.6 }]}>Qty LF</Text>
            <Text style={[S.colHdrTx, { flex: 1.5 }]}>Notes</Text>
          </View>
          {fg.moldings.map((m, i) => (
            <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, { flex: 1.2 }]}>{d(m.type_label || m.molding_type)}</Text>
              <Text style={[S.cell, { flex: 1.5 }]}>{d(m.profile_name)}</Text>
              <Text style={[S.cell, { flex: 0.6 }]}>{m.size_in != null ? String(m.size_in) : "—"}</Text>
              <Text style={[S.cell, { flex: 1.2 }]}>{d(m.material_name)}</Text>
              <Text style={[S.cell, { flex: 0.6 }]}>{m.qty_lf != null ? String(m.qty_lf) : "—"}</Text>
              <Text style={[S.cellMu, { flex: 1.5 }]}>{d(m.notes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 5: Rooms */}
      <SectionHead label="5. Rooms" />
      {fgRooms.length === 0 ? (
        <EmptyRow label="No rooms assigned to this finish group." />
      ) : (
        <View style={{ marginBottom: 6 }}>
          <View style={S.colHdr}>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Room Name</Text>
            <Text style={[S.colHdrTx, { flex: 2 }]}>Zone</Text>
            <Text style={[S.colHdrTx, { flex: 3 }]}>Notes</Text>
          </View>
          {fgRooms.map((room, i) => {
            const fgFinish = room.finishes.find(f => f.finish_group_id === fg.id);
            return (
              <View key={room.id} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                <Text style={[S.cell, { flex: 2, fontFamily: "Helvetica-Bold" }]}>{d(room.name)}</Text>
                <Text style={[S.cell, { flex: 2 }]}>{d(fgFinish?.zone)}</Text>
                <Text style={[S.cellMu, { flex: 3 }]}>{d(room.notes)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Section 6: Countertops */}
      {fg.countertops.length > 0 && (
        <>
          <SectionHead label="6. Countertops" />
          <View style={{ marginBottom: 6 }}>
            <View style={S.colHdr}>
              <Text style={[S.colHdrTx, { flex: 2 }]}>Location / Style</Text>
              <Text style={[S.colHdrTx, { flex: 1.5 }]}>Edge</Text>
              <Text style={[S.colHdrTx, { flex: 1.2 }]}>Material</Text>
              <Text style={[S.colHdrTx, { flex: 0.7 }]}>Qty SF</Text>
              <Text style={[S.colHdrTx, { flex: 2 }]}>Notes</Text>
            </View>
            {fg.countertops.map((ct, i) => (
              <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
                <Text style={[S.cell, { flex: 2 }]}>{d(ct.location || ct.style_name)}</Text>
                <Text style={[S.cell, { flex: 1.5 }]}>{d(ct.edge_name)}</Text>
                <Text style={[S.cell, { flex: 1.2 }]}>{d(ct.material_name)}</Text>
                <Text style={[S.cell, { flex: 0.7 }]}>{ct.buildup_in != null ? String(ct.buildup_in) : "—"}</Text>
                <Text style={[S.cellMu, { flex: 2 }]}>{d(ct.notes)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Footer */}
      <View style={S.footer} fixed>
        <Text style={S.footerTxt}>
          {jobNum}  ·  {fgLabel}  ·  Generated {fmtDate(generatedAt)}
        </Text>
        <Text style={S.footerTxt} render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function renderCoversheetBuffer(
  job: { job_number: string | null; site_address: string },
  fg: FinishGroupView,
  workOrders: WorkOrderRow[],
  fgIndex: number,
  rooms?: Array<{ id: string; name: string; notes: string; finishes: Array<{ finish_group_id: string; finish_label: string; zone: string }> }>
): Promise<Buffer> {
  const generatedAt = new Date().toISOString();
  const doc = (
    <Document>
      <CoversheetPage
        job={job}
        fg={fg}
        workOrders={workOrders}
        fgIndex={fgIndex}
        generatedAt={generatedAt}
        rooms={rooms ?? []}
      />
    </Document>
  );
  return renderToBuffer(doc) as Promise<Buffer>;
}
