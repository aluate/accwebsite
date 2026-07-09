import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { calculateTrim } from "@/lib/trim-calc";
import type { TrimStyle, SpecLevel } from "@/lib/trim-calc";
import type { DoorItem } from "@/components/DoorSpecClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type FinishGroup = {
  id: string; label: string; finish_type: string;
  color_name: string; door_style_id: string; box_material: string;
};

type Cabinet = {
  family_code: string; display_name: string;
  width_in: number | null; height_in: number | null; depth_in: number | null;
  qty: number; hinge_side: string; rollout_trays_qty: number;
  trash_kit: string; applied_panels: boolean; special_instructions: string;
};

type Room = {
  name: string; finish_group_id: string; cabinets: Cabinet[];
};

type TrimInput = {
  door_height: string; trim_style: TrimStyle; spec_level: SpecLevel;
  drywall_int_jambs: boolean; full_drywall_wrap: boolean;
  base_lf: number; crown_lf: number; shoe_lf: number;
  chair_rail_lf: number; stair_nosing_lf: number; wainscoting_cap_lf: number;
  case_openings: number; window_openings: number;
  pocket_doors: number; barn_or_wrapped: number; sliders: number;
};

export type OrderData = {
  job_id: string;
  submitted_at: string;
  builder_name: string;
  builder_company: string | null;
  builder_email: string | null;
  client_name: string;
  site_address: string;
  city: string;
  delivery_date: string;
  project_notes: string;
  include_cabinets: boolean;
  include_trim: boolean;
  include_doors: boolean;
  finish_groups: FinishGroup[];
  rooms: Room[];
  trim: TrimInput | null;
  door_items: DoorItem[];
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:       { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: "#222" },
  // Header
  headerRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: "#f08122" },
  co:         { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: "#111" },
  jobId:      { fontSize: 8, color: "#888" },
  // Info grid
  infoRow:    { flexDirection: "row", gap: 20, marginBottom: 16 },
  infoBox:    { flex: 1, backgroundColor: "#f7f7f5", padding: 8, borderRadius: 2 },
  infoLabel:  { fontSize: 7, color: "#aaa", fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 3, textTransform: "uppercase" },
  infoVal:    { fontSize: 9, color: "#222" },
  // Section
  sectionHdr: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: "#f08122", textTransform: "uppercase", marginTop: 16, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0" },
  // Room
  roomHdr:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#444", marginTop: 8, marginBottom: 3 },
  // Table
  tableHead:  { flexDirection: "row", backgroundColor: "#f0f0ee", paddingHorizontal: 6, paddingVertical: 3, marginBottom: 1 },
  tableRow:   { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 2.5, borderBottomWidth: 0.3, borderBottomColor: "#e8e8e8" },
  tCell:      { fontSize: 8, color: "#333" },
  tCellMid:   { fontSize: 8, color: "#666" },
  tHead:      { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  // Footer
  footer:     { position: "absolute", bottom: 28, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  footerTxt:  { fontSize: 7, color: "#ccc" },
  // Totals
  totalRow:   { flexDirection: "row", justifyContent: "flex-end", marginTop: 6, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "#ddd" },
  totalLabel: { fontSize: 8, color: "#888", marginRight: 8 },
  totalVal:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#f08122" },
  // Notes
  notes:      { fontSize: 8, color: "#555", fontStyle: "italic", marginTop: 4 },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={S.infoBox}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={S.infoVal}>{children as string}</Text>
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  return <Text style={S.sectionHdr}>{children}</Text>;
}

function CabinetsSection({ finish_groups, rooms }: { finish_groups: FinishGroup[]; rooms: Room[] }) {
  const fgMap = Object.fromEntries(finish_groups.map((fg) => [fg.id, fg]));
  return (
    <View>
      <SectionHeader>Cabinets</SectionHeader>
      {rooms.map((room, ri) => {
        const fg = fgMap[room.finish_group_id];
        return (
          <View key={ri}>
            <Text style={S.roomHdr}>
              {room.name}
              {fg ? `  —  ${fg.finish_type.toUpperCase()} / ${fg.color_name} / ${fg.label}` : ""}
            </Text>
            {room.cabinets.length > 0 ? (
              <View>
                <View style={S.tableHead}>
                  <Text style={[S.tHead, { width: 30 }]}>Qty</Text>
                  <Text style={[S.tHead, { width: 80 }]}>Code</Text>
                  <Text style={[S.tHead, { flex: 1 }]}>Description</Text>
                  <Text style={[S.tHead, { width: 80 }]}>Size (W×H×D)</Text>
                  <Text style={[S.tHead, { width: 60 }]}>Options</Text>
                </View>
                {room.cabinets.map((cab, ci) => {
                  const sizeStr = [cab.width_in, cab.height_in, cab.depth_in]
                    .map((v) => (v != null ? `${v}"` : "—"))
                    .join(" × ");
                  const opts = [
                    cab.hinge_side ? `${cab.hinge_side.toUpperCase()} hinge` : "",
                    cab.rollout_trays_qty ? `${cab.rollout_trays_qty} rollout${cab.rollout_trays_qty > 1 ? "s" : ""}` : "",
                    cab.trash_kit && cab.trash_kit !== "None" ? cab.trash_kit : "",
                    cab.applied_panels ? "panels" : "",
                  ].filter(Boolean).join(", ");
                  return (
                    <View key={ci} style={S.tableRow}>
                      <Text style={[S.tCell, { width: 30 }]}>{cab.qty}</Text>
                      <Text style={[S.tCellMid, { width: 80 }]}>{cab.family_code}</Text>
                      <Text style={[S.tCell, { flex: 1 }]}>{cab.display_name}</Text>
                      <Text style={[S.tCellMid, { width: 80 }]}>{sizeStr}</Text>
                      <Text style={[S.tCellMid, { width: 60 }]}>{opts || "—"}</Text>
                    </View>
                  );
                })}
                {room.cabinets.some((c) => c.special_instructions) && (
                  <Text style={S.notes}>
                    Notes: {room.cabinets.filter((c) => c.special_instructions).map((c) => `${c.family_code}: ${c.special_instructions}`).join(" | ")}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[S.tCellMid, { marginLeft: 6 }]}>No cabinets added.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function TrimSection({ trim }: { trim: TrimInput }) {
  const result = calculateTrim(trim);
  return (
    <View>
      <SectionHeader>Trim Supply</SectionHeader>
      <Text style={[S.tCellMid, { marginBottom: 4 }]}>
        {["craftsman", "craftsman_plus", "mitered"].includes(trim.trim_style)
          ? trim.trim_style.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : trim.trim_style}{" "}
        / {trim.spec_level.charAt(0).toUpperCase() + trim.spec_level.slice(1)} / {trim.door_height} doors
      </Text>
      <View style={S.tableHead}>
        <Text style={[S.tHead, { flex: 1 }]}>Category</Text>
        <Text style={[S.tHead, { width: 50, textAlign: "right" }]}>LF</Text>
        <Text style={[S.tHead, { width: 60, textAlign: "right" }]}>Profile</Text>
        <Text style={[S.tHead, { width: 60, textAlign: "right" }]}>BF Order</Text>
      </View>
      {result.rows.map((row, i) => (
        <View key={i} style={S.tableRow}>
          <Text style={[S.tCell, { flex: 1 }]}>{row.label}</Text>
          <Text style={[S.tCellMid, { width: 50, textAlign: "right" }]}>{row.lf.toFixed(1)}</Text>
          <Text style={[S.tCellMid, { width: 60, textAlign: "right" }]}>{row.width_in}" × {row.thickness_in}"</Text>
          <Text style={[S.tCell, { width: 60, textAlign: "right" }]}>{row.bf_ordered.toFixed(1)}</Text>
        </View>
      ))}
      <View style={S.totalRow}>
        <Text style={S.totalLabel}>Total LF</Text>
        <Text style={[S.totalVal, { color: "#333", marginRight: 20 }]}>{result.total_lf.toFixed(1)}</Text>
        <Text style={S.totalLabel}>Total BF to Order</Text>
        <Text style={S.totalVal}>{result.total_bf.toFixed(1)}</Text>
      </View>
    </View>
  );
}

function DoorsSection({ items }: { items: DoorItem[] }) {
  const total = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  return (
    <View>
      <SectionHeader>Doors</SectionHeader>
      <View style={S.tableHead}>
        <Text style={[S.tHead, { width: 30 }]}>Qty</Text>
        <Text style={[S.tHead, { width: 100 }]}>Type</Text>
        <Text style={[S.tHead, { width: 60 }]}>Size</Text>
        <Text style={[S.tHead, { width: 50 }]}>Core</Text>
        <Text style={[S.tHead, { width: 70 }]}>Species</Text>
        <Text style={[S.tHead, { width: 35 }]}>Swing</Text>
        <Text style={[S.tHead, { width: 55 }]}>Hardware</Text>
        <Text style={[S.tHead, { flex: 1, textAlign: "right" }]}>Unit $</Text>
        <Text style={[S.tHead, { width: 55, textAlign: "right" }]}>Line $</Text>
      </View>
      {items.map((it, i) => (
        <View key={i} style={S.tableRow}>
          <Text style={[S.tCell, { width: 30 }]}>{it.qty}</Text>
          <Text style={[S.tCellMid, { width: 100 }]}>{it.door_type.replace(/_/g, " ")}</Text>
          <Text style={[S.tCellMid, { width: 60 }]}>{it.size_nom}</Text>
          <Text style={[S.tCellMid, { width: 50 }]}>{it.core}</Text>
          <Text style={[S.tCellMid, { width: 70 }]}>{it.species.replace(/_/g, " ")}</Text>
          <Text style={[S.tCellMid, { width: 35 }]}>{it.swing === "none" ? "—" : it.swing.toUpperCase()}</Text>
          <Text style={[S.tCellMid, { width: 55 }]}>{it.hardware}</Text>
          <Text style={[S.tCellMid, { flex: 1, textAlign: "right" }]}>${it.unit_price.toFixed(2)}</Text>
          <Text style={[S.tCell, { width: 55, textAlign: "right" }]}>${(it.qty * it.unit_price).toFixed(2)}</Text>
        </View>
      ))}
      <View style={S.totalRow}>
        <Text style={S.totalLabel}>Door Estimate</Text>
        <Text style={S.totalVal}>${total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────

function OrderDocument({ data }: { data: OrderData }) {
  const dateStr = new Date(data.submitted_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <Document title={`${data.job_id} — Order Summary`}>
      <Page size="LETTER" style={S.page}>
        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.co}>ADVANCED CUSTOM CABINETS</Text>
            <Text style={[S.jobId, { marginTop: 2 }]}>CDA, IDAHO  ·  EXPRESS ORDER SUMMARY</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[S.jobId, { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#f08122" }]}>
              {data.job_id}
            </Text>
            <Text style={S.jobId}>{dateStr}</Text>
          </View>
        </View>

        {/* Info grid */}
        <View style={S.infoRow}>
          <InfoBox label="Client">
            {data.client_name}
            {"\n"}{data.site_address}{data.city ? `, ${data.city}` : ""}
          </InfoBox>
          <InfoBox label="Submitted By">
            {data.builder_name}
            {data.builder_company ? `\n${data.builder_company}` : ""}
            {data.builder_email ? `\n${data.builder_email}` : ""}
          </InfoBox>
          <InfoBox label="Delivery">
            {data.delivery_date || "TBD"}
          </InfoBox>
        </View>

        {data.project_notes ? (
          <Text style={[S.notes, { marginBottom: 8 }]}>Notes: {data.project_notes}</Text>
        ) : null}

        {/* Module sections */}
        {data.include_cabinets && (
          <CabinetsSection finish_groups={data.finish_groups} rooms={data.rooms} />
        )}
        {data.include_trim && data.trim && (
          <TrimSection trim={data.trim} />
        )}
        {data.include_doors && data.door_items.length > 0 && (
          <DoorsSection items={data.door_items} />
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerTxt}>Advanced Custom Cabinets — CDA, Idaho</Text>
          <Text style={S.footerTxt} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function renderOrderPDF(data: OrderData): Promise<Buffer> {
  return renderToBuffer(<OrderDocument data={data} />);
}
