"use client";

/**
 * /admin/documents — Template Document Library
 *
 * Upload/replace/remove the boilerplate files that get auto-attached
 * to emails: warranty, residential disclosure, payment terms, etc.
 */

import { useState, useEffect, useCallback, useRef } from "react";

type TemplateDoc = {
  doc_type: string;
  label: string;
  description: string | null;
  filename: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  has_file: boolean;
};

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DocSlot({ doc, onRefresh }: { doc: TemplateDoc; onRefresh: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/template-documents/${doc.doc_type}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Upload failed");
        return;
      }
      onRefresh();
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${doc.label}"? It will no longer be auto-attached until you upload a new version.`)) return;
    setRemoving(true);
    try {
      await fetch(`/api/admin/template-documents/${doc.doc_type}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setRemoving(false);
    }
  }

  async function download() {
    const res = await fetch(`/api/admin/template-documents/${doc.doc_type}`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url) window.open(url, "_blank");
  }

  return (
    <div className={`bg-[#1a1b1c] border rounded-xl px-5 py-4 transition-colors ${
      doc.has_file ? "border-white/10" : "border-dashed border-white/20"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-base font-medium ${doc.has_file ? "text-white" : "text-white/50"}`}>
              {doc.label}
            </span>
            {doc.has_file ? (
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-green-900/40 text-green-400">
                Uploaded
              </span>
            ) : (
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-yellow-900/40 text-yellow-500">
                Missing
              </span>
            )}
          </div>
          {doc.description && (
            <p className="text-white/30 text-xs mb-2">{doc.description}</p>
          )}
          {doc.has_file && doc.filename && (
            <p className="text-white/40 text-xs truncate">
              {doc.filename}
              {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ""}
              {doc.uploaded_at ? ` · ${fmtDate(doc.uploaded_at)}` : ""}
            </p>
          )}
          {err && <p className="text-red-400 text-xs mt-1">{err}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {doc.has_file && (
            <>
              <button
                onClick={download}
                className="text-xs text-white/40 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"
              >
                View
              </button>
              <button
                onClick={remove}
                disabled={removing}
                className="text-xs text-red-400/60 hover:text-red-400 px-2 py-1 rounded border border-red-900/30 hover:border-red-700/40 transition-colors"
              >
                {removing ? "…" : "Remove"}
              </button>
            </>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              doc.has_file
                ? "text-white/60 bg-white/5 hover:bg-white/10 border border-white/10"
                : "text-white bg-[#f08122] hover:bg-[#e07012]"
            }`}
          >
            {uploading ? "Uploading…" : doc.has_file ? "Replace" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<TemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/template-documents");
      if (res.ok) {
        const data = await res.json();
        setDocs(data.docs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploaded = docs.filter((d) => d.has_file).length;

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-6 py-10 max-w-3xl mx-auto">
      <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-2">Admin</div>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122] mb-1">
        Document Library
      </h1>
      <p className="text-white/40 text-sm mb-2">
        Boilerplate files auto-attached to client emails. Upload once, reuse everywhere.
      </p>
      {!loading && (
        <p className="text-white/25 text-xs mb-8">
          {uploaded}/{docs.length} slots filled
        </p>
      )}

      {loading ? (
        <p className="text-white/30 text-sm py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <DocSlot key={doc.doc_type} doc={doc} onRefresh={load} />
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-white/10 pt-6">
        <p className="text-white/25 text-xs">
          Files are stored securely and served via signed URLs. PDFs and Word docs supported.
          Replacing a file updates it everywhere immediately — no cache to clear.
        </p>
      </div>
    </div>
  );
}
