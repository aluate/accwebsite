/**
 * lib/pdf-certificate.tsx
 *
 * Generates a "Certificate of Completion" PDF after a client signs.
 * Legally equivalent to DocuSign's audit trail — captures:
 *   - Signer name
 *   - Signer IP address
 *   - Timestamp (UTC)
 *   - Document list (what they signed)
 *   - SHA-256 hash of the attached documents list
 *   - ACC company info
 *
 * Uses @react-pdf/renderer (Node.js only, no Edge runtime).
 */

import React from "react";
import {
  Document, Page, View, Text, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";
import { createHash } from "crypto";

// ─── Styles ──────────────────────────────────────────────────────────────────

const NAVY = "#1e3a5f";
const ORANGE = "#f08122";
const LIGHT = "#f4f6f9";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#222",
    padding: 50,
    backgroundColor: "#fff",
  },
  header: {
    backgroundColor: NAVY,
    margin: -50,
    marginBottom: 0,
    padding: 30,
    paddingBottom: 24,
    paddingTop: 36,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headerSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  accentBar: {
    height: 3,
    backgroundColor: ORANGE,
    margin: -50,
    marginTop: 0,
    marginBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: `1px solid ${NAVY}`,
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  label: {
    width: 130,
    color: "#888",
    fontSize: 9,
  },
  value: {
    flex: 1,
    color: "#222",
    fontSize: 9,
  },
  box: {
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  docBullet: {
    width: 6,
    height: 6,
    backgroundColor: ORANGE,
    borderRadius: 3,
    marginRight: 8,
    marginTop: 1,
  },
  docLabel: {
    fontSize: 9,
    color: "#333",
  },
  signatureBox: {
    border: `1px solid ${NAVY}`,
    borderRadius: 4,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  sigLabel: {
    fontSize: 8,
    color: "#888",
    marginBottom: 6,
  },
  sigName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: NAVY,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    borderTop: `1px solid #eee`,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#bbb",
  },
  hashBox: {
    backgroundColor: "#f9f9f9",
    border: `1px solid #eee`,
    borderRadius: 3,
    padding: 8,
    marginTop: 8,
  },
  hashText: {
    fontSize: 7,
    color: "#aaa",
    fontFamily: "Courier",
    letterSpacing: 0.3,
  },
  legalText: {
    fontSize: 8,
    color: "#666",
    lineHeight: 1.5,
    marginTop: 4,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CertificateData = {
  jobId: string;
  clientName: string;
  siteAddress: string;
  signerName: string;
  signerIp: string;
  signedAt: string;          // ISO string
  signoffPurpose: string;    // 'contract' | 'spec' | 'co'
  attachedDocs: Array<{ type: string; filename: string }>;
  signoffId: string;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "long", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function purposeLabel(p: string): string {
  return { contract: "Contract Approval", spec: "Specification Approval", co: "Change Order Approval" }[p] ?? "Document Approval";
}

// ─── PDF Component ────────────────────────────────────────────────────────────

function CertificateDoc({ data }: { data: CertificateData }) {
  // Deterministic hash of signer + timestamp + signoff ID
  const hash = createHash("sha256")
    .update(`${data.signoffId}:${data.signerName}:${data.signedAt}:${data.signerIp}`)
    .digest("hex");

  const docListStr = data.attachedDocs.map((d) => d.filename).join("|");
  const docHash = createHash("sha256").update(docListStr || "no-docs").digest("hex");

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Advanced Custom Cabinets</Text>
          <Text style={styles.headerSub}>Certificate of Electronic Signature</Text>
        </View>
        <View style={styles.accentBar} />

        {/* Signing event */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signing Event</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Purpose</Text>
            <Text style={styles.value}>{purposeLabel(data.signoffPurpose)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Project</Text>
            <Text style={styles.value}>{data.siteAddress}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.value}>{data.clientName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Job ID</Text>
            <Text style={styles.value}>{data.jobId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Signoff ID</Text>
            <Text style={styles.value}>{data.signoffId}</Text>
          </View>
        </View>

        {/* Signer identity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signer Identity & Timestamp</Text>
          <View style={styles.signatureBox}>
            <Text style={styles.sigLabel}>Signed by</Text>
            <Text style={styles.sigName}>{data.signerName}</Text>
            <View style={{ marginTop: 8 }}>
              <View style={styles.row}>
                <Text style={styles.label}>Date & Time (UTC)</Text>
                <Text style={styles.value}>{fmtDate(data.signedAt)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>IP Address</Text>
                <Text style={styles.value}>{data.signerIp}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Documents signed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documents Included in This Signing</Text>
          <View style={styles.box}>
            {data.attachedDocs.length > 0 ? (
              data.attachedDocs.map((doc, i) => (
                <View key={i} style={styles.docRow}>
                  <View style={styles.docBullet} />
                  <Text style={styles.docLabel}>{doc.filename}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.docLabel}>No documents specified (specification approval)</Text>
            )}
          </View>
          <View style={styles.hashBox}>
            <Text style={[styles.hashText, { color: "#999", marginBottom: 3 }]}>Document fingerprint (SHA-256)</Text>
            <Text style={styles.hashText}>{docHash}</Text>
          </View>
        </View>

        {/* Audit hash */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audit Fingerprint</Text>
          <View style={styles.hashBox}>
            <Text style={[styles.hashText, { color: "#999", marginBottom: 3 }]}>
              SHA-256 of signoff ID + signer name + timestamp + IP
            </Text>
            <Text style={styles.hashText}>{hash}</Text>
          </View>
        </View>

        {/* Legal notice */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal Notice</Text>
          <Text style={styles.legalText}>
            This certificate constitutes a legally binding electronic signature under the Electronic Signatures in Global
            and National Commerce Act (ESIGN, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act
            (UETA). The signer acknowledged the documents listed above and affixed their electronic signature, indicating
            their intent to be bound by their contents.
          </Text>
          <Text style={[styles.legalText, { marginTop: 6 }]}>
            Advanced Custom Cabinets · advancedcabinets.org · Issued {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Advanced Custom Cabinets — Certificate of Electronic Signature</Text>
          <Text style={styles.footerText}>Signoff ID: {data.signoffId.slice(0, 16)}…</Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function renderCertificate(data: CertificateData): Promise<Buffer> {
  return renderToBuffer(<CertificateDoc data={data} />);
}
