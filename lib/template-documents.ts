/**
 * lib/template-documents.ts
 *
 * Server-side helpers for fetching template documents from Supabase storage.
 * Used by send-bid, send-contract, and email routes to attach boilerplate docs.
 */

import { sql } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "job-files";

export type TemplateDoc = {
  doc_type: string;
  label: string;
  storage_path: string | null;
  filename: string | null;
  mime_type: string | null;
};

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetch a template document record by type.
 * Returns null if the slot has no file uploaded yet.
 */
export async function getTemplateDoc(docType: string): Promise<TemplateDoc | null> {
  const [doc] = await sql<TemplateDoc[]>`
    SELECT doc_type, label, storage_path, filename, mime_type
    FROM template_documents
    WHERE doc_type = ${docType} AND is_active = 1
  `.catch(() => []);

  if (!doc?.storage_path) return null;
  return doc;
}

/**
 * Download a template document as a Buffer for email attachment.
 * Returns null if not found or download fails.
 */
export async function downloadTemplateDoc(
  docType: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const doc = await getTemplateDoc(docType);
  if (!doc?.storage_path) return null;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    buffer,
    filename: doc.filename ?? `${docType}.pdf`,
    mimeType: doc.mime_type ?? "application/pdf",
  };
}

/**
 * Get a short-lived signed URL for a template document.
 */
export async function getTemplateDocUrl(docType: string): Promise<string | null> {
  const doc = await getTemplateDoc(docType);
  if (!doc?.storage_path) return null;

  const supabase = supabaseAdmin();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600);
  return data?.signedUrl ?? null;
}
