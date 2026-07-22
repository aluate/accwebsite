/**
 * lib/engineering-email.ts
 *
 * Builds the rich HTML + plain-text engineering release email.
 * Called from advance/route.ts when a job transitions to "engineering" status.
 */

import { sql } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import { EVENT_TYPE_LABELS } from "@/lib/schedule-types";

type JobRow = {
  id: string;
  job_number?: string | null;
  client_name: string;
  site_address?: string | null;
  city?: string | null;
  pm?: string | null;
  install_type?: string | null;
  delivery_date?: string | null;
};

const STORAGE_BUCKET = "job-files";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CATEGORY_LABELS: Record<number, string> = {
  1: "Casework",
  2: "Countertops",
  3: "Moldings / Trim",
  4: "Other",
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://accwebsite-cd58.vercel.app";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return d; }
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function buildEngineeringEmail(
  job: JobRow,
  internalId: string,
  note?: string
): Promise<{ subject: string; text: string; html: string; attachments: Array<{ filename: string; content: Buffer }> }> {
  const jobRef = `Job ${job.job_number ?? job.id} — ${job.client_name}`;
  const jobAddress = [job.site_address, job.city].filter(Boolean).join(", ") || "—";
  const subject = `${jobRef} — Released to Engineering`;
  const portalUrl = `${BASE_URL}/jobs/${internalId}`;

  // ── Spec data ──────────────────────────────────────────────────────────
  const [spec] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM residential_specs
    WHERE job_id = ${internalId}
    ORDER BY created_at DESC LIMIT 1
  `;

  type FGRow = { id: string; label: string; finish_type: string; species: string | null; color_name: string | null };
  type RoomRow = { id: string; name: string; finish_group_id: string | null };

  let finishGroups: FGRow[] = [];
  let rooms: RoomRow[] = [];

  if (spec) {
    [finishGroups, rooms] = await Promise.all([
      sql<FGRow[]>`
        SELECT id, label, finish_type, species, color_name
        FROM finish_groups WHERE spec_id = ${spec.id} ORDER BY sort_order
      `,
      sql<RoomRow[]>`
        SELECT id, name, finish_group_id
        FROM rooms WHERE spec_id = ${spec.id} ORDER BY sort_order
      `,
    ]);
  }

  // ── Work orders ────────────────────────────────────────────────────────
  const workOrders = await sql<{
    wo_number: string | null; description: string;
    category_code: number; status: string;
  }[]>`
    SELECT wo_number, description, category_code, status
    FROM work_orders WHERE job_id = ${internalId}
    ORDER BY sort_order, wo_number
  `;

  // ── Schedule milestones ────────────────────────────────────────────────
  const milestones = await sql<{
    event_type: string; date_start: string | null; date_end: string | null;
  }[]>`
    SELECT event_type, date_start, date_end
    FROM job_events WHERE job_id = ${internalId} AND date_start IS NOT NULL
    ORDER BY date_start
  `;

  // ── Files ──────────────────────────────────────────────────────────────
  const files = await sql<{ kind: string; filename: string; storage_path: string }[]>`
    SELECT kind, filename, storage_path FROM job_files
    WHERE job_id = ${internalId}
    AND kind IN ('05_drawings', '03_job_specs', '14_wo_pdfs', '14_prod_docs')
    ORDER BY uploaded_at DESC
  `;
  const drawingFiles  = files.filter((f) => ["05_drawings", "16_eng_drawings"].includes(f.kind));
  const shopPackFiles = files.filter((f) => ["14_wo_pdfs", "14_prod_docs"].includes(f.kind));

  // Download drawing files for email attachments
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  for (const f of drawingFiles) {
    try {
      const { data, error } = await getSupabaseAdmin().storage
        .from(STORAGE_BUCKET)
        .download(f.storage_path);
      if (!error && data) {
        attachments.push({ filename: f.filename, content: Buffer.from(await data.arrayBuffer()) });
      }
    } catch {
      // non-fatal: skip files that fail to download
    }
  }

  // ── Group WOs by category ──────────────────────────────────────────────
  const woByCat = new Map<number, typeof workOrders>();
  for (const wo of workOrders) {
    const cat = wo.category_code ?? 1;
    if (!woByCat.has(cat)) woByCat.set(cat, []);
    woByCat.get(cat)!.push(wo);
  }

  // ── Plain text ─────────────────────────────────────────────────────────
  const lines: string[] = [
    `${jobRef} has been released to Engineering.`,
    "=".repeat(50),
    `Address:   ${jobAddress}`,
    `PM:        ${job.pm ?? "—"}`,
    `Installer: ${job.install_type ?? "—"}`,
    `Delivery:  ${fmtDate(job.delivery_date)}`,
  ];
  if (note) lines.push("", `Note: ${note}`);
  if (finishGroups.length > 0) {
    lines.push("", "-- FINISH GROUPS --");
    for (const fg of finishGroups) {
      const fgRooms = rooms.filter((r) => r.finish_group_id === fg.id).map((r) => r.name);
      const sub = [fg.finish_type, fg.species, fg.color_name].filter(Boolean).join(" / ");
      lines.push(`  ${fg.label} (${sub})`, `    Rooms: ${fgRooms.join(", ") || "—"}`);
    }
  }
  if (workOrders.length > 0) {
    lines.push("", "-- WORK ORDERS --");
    for (const [cat, wos] of woByCat) {
      lines.push(`  ${CATEGORY_LABELS[cat] ?? `Cat ${cat}`}`);
      for (const wo of wos) {
        lines.push(`    WO${wo.wo_number ?? "??"}  ${wo.description}`);
      }
    }
  }
  if (milestones.length > 0) {
    lines.push("", "-- SCHEDULE MILESTONES --");
    for (const m of milestones) {
      const lbl = (EVENT_TYPE_LABELS as Record<string, string>)[m.event_type] ?? m.event_type;
      const end = m.date_end ? ` - ${fmtDate(m.date_end)}` : "";
      lines.push(`  ${lbl}: ${fmtDate(m.date_start)}${end}`);
    }
  }
  if (drawingFiles.length > 0) {
    lines.push("", "-- DRAWINGS --");
    for (const f of drawingFiles) lines.push(`  ${f.filename}`);
  }
  if (shopPackFiles.length > 0) {
    lines.push("", "-- SHOP PACK --");
    for (const f of shopPackFiles) lines.push(`  ${f.filename}`);
  }
  lines.push("", `Portal: ${portalUrl}`);
  const text = lines.join("\n");

  // ── HTML ───────────────────────────────────────────────────────────────
  const c  = `style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;"`;
  const ch = `style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;font-weight:600;text-align:left;"`;

  // Spec section
  let specHtml = "";
  if (finishGroups.length > 0) {
    const rows = finishGroups.map((fg) => {
      const fgRooms = rooms.filter((r) => r.finish_group_id === fg.id).map((r) => h(r.name));
      const sub = [fg.finish_type, fg.species, fg.color_name].filter(Boolean).map(h).join(" &middot; ");
      return `<tr><td ${c}><strong>${h(fg.label)}</strong><br><span style="color:#666;font-size:12px;">${sub}</span></td><td ${c}>${fgRooms.join(", ") || "—"}</td></tr>`;
    }).join("");
    specHtml = `<h3 style="margin:20px 0 6px;color:#1e3a5f;">Finish Groups</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
<thead><tr><th ${ch} style="width:42%;">Finish Group</th><th ${ch}>Rooms / Areas</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  }

  // WO section
  let woHtml = "";
  if (workOrders.length > 0) {
    let rows = "";
    for (const [cat, wos] of woByCat) {
      rows += `<tr><td colspan="3" style="padding:5px 10px;background:#eef2ff;font-weight:700;border:1px solid #ddd;">${CATEGORY_LABELS[cat] ?? `Cat ${cat}`}</td></tr>`;
      for (const wo of wos) {
        rows += `<tr><td ${c} style="width:80px;">WO${h(wo.wo_number ?? "??")}</td><td ${c}>${h(wo.description) || "—"}</td><td ${c} style="width:80px;color:#666;">${h(wo.status)}</td></tr>`;
      }
    }
    woHtml = `<h3 style="margin:20px 0 6px;color:#1e3a5f;">Work Orders</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
<thead><tr><th ${ch}>WO#</th><th ${ch}>Description</th><th ${ch}>Status</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  }

  // Milestones section
  let msHtml = "";
  if (milestones.length > 0) {
    const rows = milestones.map((m) => {
      const lbl = (EVENT_TYPE_LABELS as Record<string, string>)[m.event_type] ?? m.event_type;
      const end = m.date_end ? ` &ndash; ${fmtDate(m.date_end)}` : "";
      return `<tr><td ${c}>${h(lbl)}</td><td ${c}>${fmtDate(m.date_start)}${end}</td></tr>`;
    }).join("");
    msHtml = `<h3 style="margin:20px 0 6px;color:#1e3a5f;">Schedule Milestones</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
<thead><tr><th ${ch}>Event</th><th ${ch}>Date</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  }

  // Files section
  let filesHtml = "";
  if (drawingFiles.length > 0 || shopPackFiles.length > 0) {
    filesHtml = `<h3 style="margin:20px 0 6px;color:#1e3a5f;">Files</h3><ul style="margin:0;padding-left:18px;font-size:13px;">`;
    for (const f of drawingFiles)  filesHtml += `<li>${h(f.filename)} <span style="color:#888;">(drawing)</span></li>`;
    for (const f of shopPackFiles) filesHtml += `<li>${h(f.filename)} <span style="color:#888;">(shop pack)</span></li>`;
    filesHtml += `</ul>`;
  }

  const noteHtml = note
    ? `<div style="background:#fffbea;border-left:4px solid #f59e0b;padding:10px 14px;margin:14px 0;font-size:13px;">${h(note)}</div>`
    : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:680px;margin:0 auto;padding:16px;">
<div style="background:#1e3a5f;color:#fff;padding:14px 18px;border-radius:4px 4px 0 0;">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.7;">Advanced Custom Cabinets</div>
<div style="font-size:19px;font-weight:700;margin-top:4px;">Released to Engineering</div>
<div style="font-size:13px;opacity:.85;margin-top:2px;">${h(jobRef)}</div>
</div>
<div style="border:1px solid #ddd;border-top:none;padding:18px;border-radius:0 0 4px 4px;">
<table style="font-size:13px;border-collapse:collapse;width:100%;">
<tr><td style="padding:3px 12px 3px 0;color:#666;width:100px;">Address</td><td style="padding:3px 0;"><strong>${h(jobAddress)}</strong></td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666;">PM</td><td style="padding:3px 0;">${h(job.pm ?? "—")}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666;">Installer</td><td style="padding:3px 0;">${h(job.install_type ?? "—")}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#666;">Delivery</td><td style="padding:3px 0;"><strong>${fmtDate(job.delivery_date)}</strong></td></tr>
</table>
${noteHtml}${specHtml}${woHtml}${msHtml}${filesHtml}
<div style="margin-top:20px;padding-top:14px;border-top:1px solid #eee;">
<a href="${portalUrl}" style="background:#1e3a5f;color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;display:inline-block;">Open Job Portal &rarr;</a>
</div>
</div>
</body></html>`;

  return { subject, text, html, attachments };
}
