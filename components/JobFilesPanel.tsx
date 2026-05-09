"use client";

import { useEffect, useState, useCallback } from "react";

type FileEntry = {
  id: string;
  filename: string;
  size: number;
  uploaded_at: string;
  url: string;
};
type FilesByKind = Record<string, FileEntry[]>;

// Z drive mirror — exact 17-folder structure (numbered for sort order)
const FOLDERS = [
  { key: "00_field_dims",     label: "00 Field Dimensions",    desc: "As-measured field notes, laser readings" },
  { key: "01_plan",           label: "01 Plan",                desc: "Architectural floor plans, elevations" },
  { key: "02_quote",          label: "02 Quote",               desc: "Estimates, proposals, pricing sheets" },
  { key: "03_job_specs",      label: "03 Job Specs",           desc: "Approved spec PDFs, revision history" },
  { key: "04_appliances",     label: "04 Appliances",          desc: "Cut sheets, install templates, specs" },
  { key: "05_drawings",       label: "05 Drawings",            desc: "CV exports — PM stage and WO#" },
  { key: "05a_redlines",      label: "05a Redlines",           desc: "Redline markups, revision notes" },
  { key: "06_as_builts",      label: "06 As Builts",           desc: "Final as-built drawings" },
  { key: "07_correspondence", label: "07 Correspondence",      desc: "Emails, letters, change orders" },
  { key: "08_project_mgmt",   label: "08 Project Management",  desc: "Schedules, meeting notes, punch logs" },
  { key: "09_site_photos",    label: "09 Job Site Pictures",   desc: "Walk-through photos, site conditions" },
  { key: "10_billing",        label: "10 Billing",             desc: "Invoices, POs, payment records" },
  { key: "11_punch_list",     label: "11 Punch List",          desc: "Outstanding items, sign-off sheets" },
  { key: "12_cost_quality",   label: "12 Cost of Quality",     desc: "Warranty claims, defect tracking" },
  { key: "13_installation",   label: "13 Installation",        desc: "Install schedule, site access, crew notes" },
  { key: "14_prod_docs",      label: "14 Production Documents", desc: "Shop drawings, work orders, cut lists" },
  { key: "15_contract",       label: "15 Contract",            desc: "Signed contract, addenda, T&Cs" },
] as const;

type FolderKey = (typeof FOLDERS)[number]["key"];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobFilesPanel({ jobId, isAdmin = false }: { jobId: string; isAdmin?: boolean }) {
  const [files, setFiles]       = useState<FilesByKind>({});
  const [activeKey, setActiveKey] = useState<FolderKey>("01_plan");
  const [uploading, setUploading] = useState(false);
  const [err, setErr]           = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/files`, { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setFiles(body.files ?? {});
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDelete(fileId: string, filename: string) {
    if (!isAdmin) return;
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setErr("");
    setDeleting(fileId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/files?file_id=${encodeURIComponent(fileId)}`, { method: "DELETE" });
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
      fd.append("kind", activeKey);
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

  const activeFolder = FOLDERS.find((f) => f.key === activeKey)!;
  const activeFiles  = files[activeKey] ?? [];
  const totalFiles   = Object.values(files).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Files</p>
        <p className="text-white/20 text-[10px] font-condensed uppercase tracking-widest">{totalFiles} file{totalFiles !== 1 ? "s" : ""} total</p>
      </div>
      <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-4">
        Z-drive mirror — 17 folders. Files attach to this job and persist across spec versions.
      </p>

      {/* Folder tabs — scrollable row */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {FOLDERS.map((f) => {
          const count = (files[f.key] ?? []).length;
          const isActive = f.key === activeKey;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveKey(f.key)}
              className={[
                "shrink-0 font-condensed uppercase tracking-widest text-[10px] px-2.5 py-1.5 rounded transition-colors whitespace-nowrap",
                isActive
                  ? "bg-[#f08122] text-white"
                  : "bg-[#1a1a1a] text-white/40 hover:text-white/70 hover:bg-[#252525]",
              ].join(" ")}
            >
              {f.label.split(" ").slice(0, 2).join(" ")}
              {count > 0 && (
                <span className={["ml-1 rounded-full px-1 text-[9px]", isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/50"].join(" ")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active folder upload zone */}
      <div className="bg-[#1a1a1a] border border-dashed border-white/15 rounded p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-white/60 font-condensed uppercase tracking-widest text-xs">{activeFolder.label}</p>
          <p className="text-white/20 text-[10px] font-condensed uppercase tracking-widest hidden sm:block">{activeFolder.desc}</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Upload to this folder</label>
            <input
              type="file"
              onChange={onUpload}
              disabled={uploading}
              accept={activeKey === "09_site_photos" ? "image/*,video/*" : undefined}
              className="block w-full text-xs text-white/70 file:bg-[#f08122] file:hover:bg-[#d9711e] file:text-white file:font-condensed file:uppercase file:tracking-widest file:text-xs file:py-1.5 file:px-3 file:rounded file:border-0 file:cursor-pointer"
            />
          </div>
          {activeKey === "09_site_photos" && (
            <label className="shrink-0 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded cursor-pointer transition-colors">
              Take photo
              <input type="file" accept="image/*" capture="environment" onChange={onUpload} disabled={uploading} className="hidden" />
            </label>
          )}
        </div>
        {uploading && <p className="text-[#f08122] text-xs mt-2 font-condensed uppercase tracking-widest">Uploading...</p>}
        {err     && <p className="text-red-400 text-xs mt-2">{err}</p>}
      </div>

      {/* File list for active folder */}
      {activeFiles.length === 0 ? (
        <p className="text-white/15 text-xs font-condensed uppercase tracking-widest italic pl-1">— empty —</p>
      ) : (
        <div className="space-y-1">
          {activeFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] rounded px-3 py-2 transition-colors"
            >
              <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2">
                {/\.(jpe?g|png|webp|gif)$/i.test(f.filename) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt="" className="w-10 h-10 object-cover rounded border border-white/10 shrink-0" loading="lazy" />
                )}
                <span className="text-white/70 text-xs truncate flex-1">{f.filename}</span>
                <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest shrink-0 ml-3">
                  {fmtSize(f.size)} · {new Date(f.uploaded_at).toLocaleDateString()}
                </span>
              </a>
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(f.id, f.filename); }}
                  disabled={deleting === f.id}
                  title="Delete file (admin only)"
                  className="ml-3 text-red-400/40 hover:text-red-400 text-[10px] font-condensed uppercase tracking-widest shrink-0 disabled:opacity-30"
                >
                  {deleting === f.id ? "..." : "Delete"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
