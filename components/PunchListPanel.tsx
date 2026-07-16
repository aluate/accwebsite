"use client";

/**
 * PunchListPanel — Centralized punch list UI.
 *
 * Anyone with job access can add items: PM, admin, engineer, shop,
 * installer, builder portal, homeowner (future).
 *
 * Statuses: open → scheduled → done | wont_fix
 * Photos:   multiple per item, images + videos
 * Types:    S / S+M / HP / TD (shown to internal users only)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Room = { id: string; name: string; sort_order: number };

type PunchPhoto = {
  id: string;
  punch_item_id: string;
  storage_path: string;
  media_type: string;
  label: string | null;
  sort_order: number;
  url: string | null;
};

type PunchItem = {
  id: string;
  room_id: string | null;
  room_name: string | null;
  general_location: string | null;
  item_description: string;
  type_code: string;
  status: "open" | "scheduled" | "done" | "wont_fix";
  photos: PunchPhoto[];
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  "S":   "Service only",
  "S+M": "Service + manufacture",
  "HP":  "Hardware procurement",
  "TD":  "To Do",
};

const TYPE_COLORS: Record<string, string> = {
  "S":   "text-green-400 bg-green-900/30 border-green-700/40",
  "S+M": "text-yellow-300 bg-yellow-900/30 border-yellow-700/40",
  "HP":  "text-blue-300 bg-blue-900/30 border-blue-700/40",
  "TD":  "text-orange-300 bg-orange-900/30 border-orange-700/40",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open:      { label: "Open",      cls: "text-red-300 bg-red-900/30 border-red-700/40" },
  scheduled: { label: "Scheduled", cls: "text-yellow-300 bg-yellow-900/30 border-yellow-700/40" },
  done:      { label: "Done",      cls: "text-green-400 bg-green-900/30 border-green-700/40" },
  wont_fix:  { label: "Won’t Fix", cls: "text-white/30 bg-white/5 border-white/10" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByRoom(items: PunchItem[]): Array<{ label: string; items: PunchItem[] }> {
  const map = new Map<string, { label: string; items: PunchItem[] }>();
  const generalKey = "__general__";

  for (const item of items) {
    const key = item.room_id ?? generalKey;
    const label = item.room_id ? (item.room_name ?? "Unknown Room") : "General";
    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key)!.items.push(item);
  }

  const groups = [...map.entries()]
    .filter(([k]) => k !== generalKey)
    .map(([, v]) => v);
  if (map.has(generalKey)) groups.push(map.get(generalKey)!);
  return groups;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadMediaFiles(itemId: string, files: File[], label?: string): Promise<void> {
  if (files.length === 0) return;
  const form = new FormData();
  for (const f of files) form.append("file", f);
  if (label) form.append("label", label);
  await fetch(`/api/punch-items/${itemId}/photo`, { method: "POST", body: form });
}

// ─── MediaThumbnail ───────────────────────────────────────────────────────────

function MediaThumbnail({ photo }: { photo: PunchPhoto }) {
  if (!photo.url) return null;
  const isVideo = photo.media_type === "video";
  return (
    <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block relative group">
      {isVideo ? (
        <div className="w-20 h-20 rounded border border-white/10 group-hover:border-[#f08122] bg-black flex items-center justify-center transition-colors">
          <span className="text-2xl opacity-60 group-hover:opacity-100">&#9654;</span>
        </div>
      ) : (
        <img src={photo.url} alt={photo.label ?? ""} className="w-20 h-20 object-cover rounded border border-white/10 group-hover:border-[#f08122] transition-colors" />
      )}
      {photo.label && (
        <p className="text-[9px] text-white/30 mt-0.5 font-condensed uppercase tracking-wider truncate w-20">{photo.label}</p>
      )}
    </a>
  );
}

// ─── FilePicker ───────────────────────────────────────────────────────────────

function FilePicker({ files, onChange, label = "Add photos / videos" }: {
  files: File[];
  onChange: (f: File[]) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    onChange([...files, ...picked]);
    if (ref.current) ref.current.value = "";
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, idx) => {
            const src = URL.createObjectURL(f);
            const isVideo = f.type.startsWith("video/");
            return (
              <div key={idx} className="relative">
                {isVideo
                  ? <div className="w-16 h-16 rounded border border-white/15 bg-black flex items-center justify-center text-lg opacity-70">&#9654;</div>
                  : <img src={src} alt="" className="w-16 h-16 object-cover rounded border border-white/15" />
                }
                <button type="button" onClick={() => remove(idx)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center hover:bg-red-500 leading-none">
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer bg-[#111] border border-white/10 rounded px-3 py-2 text-sm text-white/40 hover:border-white/20 transition-colors w-full">
        <span>&#128206;</span>
        <span>{files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""} — add more` : label}</span>
        <input ref={ref} type="file" accept="image/*,video/*" capture="environment" multiple className="sr-only" onChange={handleChange} />
      </label>
    </div>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({ item, canManage, onRefresh }: {
  item: PunchItem;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isResolved = item.status === "done" || item.status === "wont_fix";
  const statusCfg  = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.open;
  const typeCls    = TYPE_COLORS[item.type_code] ?? "text-white/40 bg-white/5 border-white/10";

  async function patchStatus(status: string) {
    await fetch(`/api/punch-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  async function handleMarkDone() {
    setError(""); setBusy(true);
    try {
      if (pendingFiles.length > 0) await uploadMediaFiles(item.id, pendingFiles, "after");
      const res = await fetch(`/api/punch-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) { setError("Could not mark done"); setBusy(false); return; }
      onRefresh();
    } catch { setError("Something went wrong"); setBusy(false); }
  }

  async function handleSavePhotos() {
    if (pendingFiles.length === 0) return;
    setBusy(true);
    await uploadMediaFiles(item.id, pendingFiles);
    setPendingFiles([]); setBusy(false); onRefresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this punch item?")) return;
    await fetch(`/api/punch-items/${item.id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className={`rounded-xl border p-4 transition-colors ${isResolved ? "bg-white/3 border-white/5 opacity-50" : "bg-white/5 border-white/10"}`}>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border ${statusCfg.cls}`}>{statusCfg.label}</span>
        <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border ${typeCls}`}>{item.type_code} — {TYPE_LABELS[item.type_code] ?? item.type_code}</span>
      </div>

      <p className={`text-sm leading-snug ${isResolved ? "text-white/40 line-through" : "text-white"}`}>{item.item_description}</p>
      {item.general_location && <p className="text-xs text-white/40 italic mt-0.5">{item.general_location}</p>}

      {item.photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {item.photos.map((p) => <MediaThumbnail key={p.id} photo={p} />)}
        </div>
      )}

      <p className="text-[10px] text-white/20 mt-2">
        Added {fmtDate(item.created_at)} by {item.created_by}
        {isResolved && item.completed_by && ` · ${item.status === "done" ? "Completed" : "Closed"} by ${item.completed_by}`}
        {isResolved && item.completed_at && ` on ${fmtDate(item.completed_at)}`}
      </p>

      {!isResolved && (
        <div className="mt-3 space-y-2">
          <FilePicker files={pendingFiles} onChange={setPendingFiles} label="Attach photos / videos" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {pendingFiles.length > 0 && (
              <button onClick={handleSavePhotos} disabled={busy}
                className="px-3 py-1.5 rounded bg-white/10 text-white/70 text-xs font-condensed uppercase tracking-wider hover:bg-white/15 transition-colors disabled:opacity-40">
                {busy ? "Uploading…" : "Save photos"}
              </button>
            )}
            <button onClick={handleMarkDone} disabled={busy}
              className="px-3 py-1.5 rounded bg-green-700/60 hover:bg-green-600/70 text-green-200 text-xs font-condensed uppercase tracking-wider transition-colors disabled:opacity-40">
              {busy ? "Saving…" : "Mark Done"}
            </button>
            {canManage && item.status === "open" && (
              <button onClick={() => patchStatus("scheduled")}
                className="px-3 py-1.5 rounded bg-yellow-900/40 text-yellow-300 text-xs font-condensed uppercase tracking-wider hover:bg-yellow-800/50 transition-colors">
                Schedule
              </button>
            )}
            {canManage && item.status === "scheduled" && (
              <button onClick={() => patchStatus("open")}
                className="px-3 py-1.5 rounded bg-white/5 text-white/40 text-xs font-condensed uppercase tracking-wider hover:bg-white/10 transition-colors">
                Unschedule
              </button>
            )}
            {canManage && (
              <button onClick={() => patchStatus("wont_fix")}
                className="px-3 py-1.5 rounded bg-white/5 text-white/30 text-xs font-condensed uppercase tracking-wider hover:bg-white/10 transition-colors">
                Won&apos;t Fix
              </button>
            )}
          </div>
        </div>
      )}

      {canManage && isResolved && (
        <div className="mt-2 flex gap-3">
          <button onClick={() => patchStatus("open")} className="text-[10px] text-white/25 hover:text-[#f08122] font-condensed uppercase tracking-wider transition-colors">Reopen</button>
          <button onClick={handleDelete} className="text-[10px] text-white/15 hover:text-red-400 font-condensed uppercase tracking-wider transition-colors">Delete</button>
        </div>
      )}
    </div>
  );
}

// ─── AddItemForm ──────────────────────────────────────────────────────────────

function AddItemForm({ jobId, rooms, isInternal, onAdded }: {
  jobId: string;
  rooms: Room[];
  isInternal: boolean;
  onAdded: () => void;
}) {
  const [open, setOpen]                   = useState(false);
  const [roomId, setRoomId]               = useState("__general__");
  const [generalLocation, setGeneralLoc]  = useState("");
  const [description, setDescription]     = useState("");
  const [typeCode, setTypeCode]           = useState("TD");
  const [mediaFiles, setMediaFiles]       = useState<File[]>([]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Description is required"); return; }
    if (roomId === "__general__" && !generalLocation.trim()) { setError("Location detail required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/punch-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId === "__general__" ? null : roomId,
          general_location: roomId === "__general__" ? generalLocation.trim() : undefined,
          item_description: description.trim(),
          type_code: typeCode,
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Failed"); setSaving(false); return; }
      const { id: newId } = await res.json();
      if (mediaFiles.length > 0 && newId) await uploadMediaFiles(newId, mediaFiles, "before");
      setDescription(""); setGeneralLoc(""); setMediaFiles([]); setTypeCode("TD"); setOpen(false);
      onAdded();
    } catch { setError("Something went wrong"); }
    finally { setSaving(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-3 text-white/30 hover:text-[#f08122] hover:border-[#f08122]/30 text-sm font-condensed uppercase tracking-wider transition-colors">
      + Add Punch Item
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e1e1e] border border-white/10 rounded-xl p-4 space-y-3">
      <p className="text-[#f08122] font-condensed uppercase tracking-wider text-xs">New Punch Item</p>

      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Room</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50">
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value="__general__">General / not room-specific</option>
        </select>
      </div>

      {roomId === "__general__" && (
        <div>
          <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Location detail</label>
          <input type="text" value={generalLocation} onChange={(e) => setGeneralLoc(e.target.value)}
            placeholder="e.g. garage ceiling, hallway baseboard…"
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50" />
        </div>
      )}

      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">What needs to happen *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue or task…" rows={3}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50 resize-none" />
      </div>

      {isInternal && (
        <div>
          <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Type</label>
          <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50">
            <option value="S">S — Service only (same trip)</option>
            <option value="S+M">S+M — Service + manufacture (~10 days)</option>
            <option value="HP">HP — Hardware procurement</option>
            <option value="TD">TD — To Do</option>
          </select>
        </div>
      )}

      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Photos / videos (optional)</label>
        <FilePicker files={mediaFiles} onChange={setMediaFiles} />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 py-2 rounded-lg bg-[#f08122] text-black text-sm font-condensed uppercase tracking-wider hover:bg-[#d4701e] transition-colors disabled:opacity-40">
          {saving ? "Saving…" : "Add Item"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:border-white/20 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── PunchListPanel ───────────────────────────────────────────────────────────

export function PunchListPanel({ jobId, role }: {
  jobId: string;
  role: "admin" | "pm" | "engineer" | "shop" | "installer" | "portal" | string;
}) {
  const [items, setItems]     = useState<PunchItem[]>([]);
  const [rooms, setRooms]     = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const isInternal = !["portal", "homeowner"].includes(role);
  const canManage  = ["admin", "pm"].includes(role);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/punch-items`, { cache: "no-store" });
      if (!res.ok) { setError("Failed to load punch list"); return; }
      const body = await res.json();
      setItems(body.items ?? []);
      setRooms(body.rooms ?? []);
    } catch { setError("Failed to load punch list"); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  const activeItems    = items.filter((i) => i.status === "open" || i.status === "scheduled");
  const resolvedItems  = items.filter((i) => i.status === "done" || i.status === "wont_fix");
  const scheduledCount = items.filter((i) => i.status === "scheduled").length;
  const activeGroups   = groupByRoom(activeItems);
  const resolvedGroups = groupByRoom(resolvedItems);

  if (loading) return (
    <div className="py-8 text-center text-white/20 text-sm font-condensed uppercase tracking-wider">Loading…</div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Punch List</p>
        <div className="flex gap-3 text-xs text-white/30 font-condensed uppercase tracking-wider">
          <span>{activeItems.length} active</span>
          {scheduledCount > 0 && <span className="text-yellow-400">{scheduledCount} scheduled</span>}
          <span>·</span>
          <span>{resolvedItems.length} resolved</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <AddItemForm jobId={jobId} rooms={rooms} isInternal={isInternal} onAdded={refresh} />

      {items.length === 0 && (
        <div className="text-center py-8 text-white/15 text-sm">No punch items yet.</div>
      )}

      {activeGroups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-condensed uppercase tracking-[0.2em] text-white/30 m