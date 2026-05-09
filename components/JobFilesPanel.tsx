"use client";

import { useEffect, useState, useCallback } from "react";

type FileEntry = {
  filename: string;
  size: number;
  uploaded_at: string;
  url: string;
};
type FilesByKind = Record<string, FileEntry[]>;

const KINDS = [
  { key: "plans",      label: "Architectural Plans", desc: "Floor plans, elevations, section drawings" },
  { key: "appliances", label: "Appliance Specs",     desc: "Cut sheets, install templates" },
  { key: "site",       label: "Site Photos / Video", desc: "Walk-through, measurements, conditions" },
  { key: "drawings",   label: "Cabinet Drawings",    desc: "CV exports — PM stage and engineered (WO#)" },
] as const;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobFilesPanel({ jobId, isAdmin = false, defaultKind = "plans" }: { jobId: string; isAdmin?: boolean; defaultKind?: string }) {
  const [files, setFiles] = useState<FilesByKind>({});
  const [kind, setKind] = useState<string>(defaultKind);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/files`, { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setFiles(body.files ?? {});
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDelete(fileKind: string, filename: string) {
    if (!isAdmin) return;
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setErr("");
    setDeleting(filename);
    try {
      const qs = `kind=${encodeURIComponent(fileKind)}&file=${encodeURIComponent(filename)}`;
      const res = await fetch(`/api/jobs/${jobId}/files?${qs}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Delete failed");
      } else {
        await refresh();
      }
    } catch {
      setErr("Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Upload failed");
      } else {
        await refresh();
      }
    } catch {
      setErr("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Files</p>
      <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-4">
        Plans, appliance specs, site photos, drawings. Files attach to this job and persist across spec versions.
      </p>

      <div className="bg-[#1a1a1a] border border-dashed border-white/15 rounded p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]"
            >
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Add file</label>
            {kind === "site" ? (
              <div className="flex gap-2">
                {/* Camera — straight to rear camera */}
                <label className="flex-1 flex items-center justify-center gap-1.5 bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded cursor-pointer transition-colors">
                  📷 Camera
                  <input type="file" accept="image/*" capture="environment" onChange={onUpload} disabled={uploading} className="hidden" />
                </label>
                {/* Gallery — pick saved photo/video from library */}
                <label className="flex-1 flex items-center justify-center gap-1.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded cursor-pointer transition-colors">
                  🖼 Gallery
                  <input type="file" accept="image/*,video/*" onChange={onUpload} disabled={uploading} className="hidden" />
                </label>
              </div>
            ) : (
              <input
                type="file"
                onChange={onUpload}
                disabled={uploading}
                className="block w-full text-xs text-white/70 file:bg-[#f08122] file:hover:bg-[#d9711e] file:text-white file:font-condensed file:uppercase file:tracking-widest file:text-xs file:py-1.5 file:px-3 file:rounded file:border-0 file:cursor-pointer"
              />
            )}
          </div>
        </div>
        {uploading && <p className="text-[#f08122] text-xs mt-2 font-condensed uppercase tracking-widest">Uploading...</p>}
        {err && <p className="text-red-400 text-xs mt-2 font-condensed uppercase tracking-widest">{err}</p>}
      </div>

      <div className="space-y-5">
        {KINDS.map((k) => {
          const list = files[k.key] ?? [];
          return (
            <div key={k.key}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-white/60 font-condensed uppercase tracking-widest text-xs">
                  {k.label}
                  <span className="text-white/20 ml-2">({list.length})</span>
                </p>
                <p className="text-white/20 text-[10px] font-condensed uppercase tracking-widest hidden sm:block">{k.desc}</p>
              </div>
              {list.length === 0 ? (
                <p className="text-white/15 text-xs font-condensed uppercase tracking-widest italic pl-1">- none yet -</p>
              ) : (
                <div className="space-y-1">
                  {list.map((f) => (
                    <div
                      key={f.filename}
                      className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] rounded px-3 py-2 transition-colors group"
                    >
                      <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {/\.(jpe?g|png|webp|gif)$/i.test(f.filename) && (
                          <img
                            src={f.url}
                            alt=""
                            className="w-12 h-12 object-cover rounded border border-white/10 shrink-0"
                            loading="lazy"
                          />
                        )}
                        <span className="text-white/70 text-xs truncate flex-1">{f.filename}</span>
                        <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest shrink-0 ml-3">
                          {fmtSize(f.size)} · {new Date(f.uploaded_at).toLocaleDateString()}
                        </span>
                      </a>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(k.key, f.filename); }}
                          disabled={deleting === f.filename}
                          title="Delete file (admin only)"
                          className="ml-3 text-red-400/40 hover:text-red-400 text-[10px] font-condensed uppercase tracking-widest shrink-0 disabled:opacity-30"
                        >
                          {deleting === f.filename ? "..." : "Delete"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
