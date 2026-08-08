export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/template-documents  — list all slots with current file info
 */

import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAdmin } from "@/lib/admin-auth";

export async function GET() {
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ok = await getAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docs = await sql`
    SELECT id, doc_type, label, description, filename, file_size, mime_type,
           uploaded_by, uploaded_at, is_active,
           storage_path IS NOT NULL AS has_file
    FROM template_documents
    ORDER BY label ASC
  `;

  return NextResponse.json({ docs });
}
