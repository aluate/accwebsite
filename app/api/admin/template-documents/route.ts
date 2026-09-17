export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/template-documents  — list all slots with current file info
 */

import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";
export async function GET() {
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  // The dead check that used to sit here wanted the legacy
  // acc_admin_session cookie - the shared-password admin login retired in
  // 2026-05. app/admin/login/page.tsx now redirects to /login
  // unconditionally, so nothing can mint that cookie any more and the
  // check could never pass. Every request to this route 401d, for
  // everyone, including Karl. guardApi above is the real check.
  const docs = await sql`
    SELECT id, doc_type, label, description, filename, file_size, mime_type,
           uploaded_by, uploaded_at, is_active,
           storage_path IS NOT NULL AS has_file
    FROM template_documents
    ORDER BY label ASC
  `;

  return NextResponse.json({ docs });
}
