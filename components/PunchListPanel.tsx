"use client";

/**
 * PunchListPanel — Full punch list UI for a job.
 *
 * PM / Admin view:
 *   - Add Item form (room from spec or GENERAL, description, type code)
 *   - Optional before-photo upload when creating
 *   - Reopen items
 *   - Delete items
 *
 * Installer view:
 *   - Read only for item details
 *   - Mark Done button: uploads after-photo then marks complete
 *
 * Items are grouped by room. GENERAL items appear at the bottom.
 * Type codes: S = Service only, S+M = Service + manufacture, HP = Hardware procurement, TD = Trade dependency.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Room = { id: string; name: string; sort_order: number };

type PunchItem = {
  id: string;
  room_id: string | null;
  room_name: string | null;
  general_location: string | null;
  item_description: string;
  type_code: string;
  status: "open" | "done";
  before_photo_url: string | null;
  after_photo_url: string | null;
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  "S":   "Service only",
  "S+M": "Service + manufacture",
  "HP":  "Hardware procurement",
  "TD":  "Trade dependency",
};

const TYPE_COLORS: Record<string, string> = {
  "S":   "text-green-400 bg-green-900/30 border-green-700/40",
  "S+M": "text-yellow-300 bg-yellow-900/30 border-yellow-700/40",
  "HP":  "text-blue-300 bg-blue-900/30 border-blue-700/40",
  "TD":  "text-orange-300 bg-orange-900/30 border-orange-700/40",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByRoom(items: PunchItem[]): Array<{ label: string; items: PunchItem[] }> {
  const map = new Map<string, { label: string; items: PunchItem[] }>();
  const generalKey = "__general__";

  for (const item of items) {
    const key = item.room_id ?? generalKey;
    const label = item.room_id ? (item.room_name ?? "Unknown Room") : "General";
    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key)!.items.push(item);
  }

  // Sort groups: named rooms first (in order they come from API), GENERAL last
  const groups = [...map.entries()]
    .filter(([k]) => k !== generalKey)
    .map(([, v]) => v);
  if (map.has(generalKey)) groups.push(map.get(generalKey)!);
  return groups;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

async function uploadPhoto(
  itemId: string,
  which: "before" | "after",
  file: File
): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("which", which);
  const res = await fetch(`/api/punch-items/${itemId}/photo`, { method: "POST", body: form });
  if (!res.ok) return null;
  const body = await res.json();
  return body.url ?? null;
}

// ─── PhotoThumbnail ───────────────────────────────────────────────────────────

function PhotoThumbnail({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={label}
        className="w-20 h-20 object-cover rounded border border-white/10 hover:border-[#f08122] transition-colors"
      />
      <p className="text-[10px] text-white/30 mt-0.5 font-condensed uppercase tracking-wider">{label}</p>
    </a>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  isInstaller,
  canEdit,
  onRefresh,
}: {
  item: PunchItem;
  isInstaller: boolean;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isDone = item.status === "done";

  function onAfterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAfterFile(f);
    setAfterPreview(URL.createObjectURL(f));
  }

  async function handleComplete() {
    if (!afterFile) {
      setError("Photo required to mark as done");
      return;
    }
    setError("");
    setCompleting(true);
    try {
      // Upload after photo
      const url = await uploadPhoto(item.id, "after", afterFile);
      if (!url) { setError("Photo upload failed"); setCompleting(false); return; }

      // Mark done
      const res = await fetch(`/api/punch-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) { setError("Could not mark item done"); setCompleting(false); return; }
      onRefresh();
    } catch {
      setError("Something went wrong");
      setCompleting(false);
    }
  }

  async function handleReopen() {
    await fetch(`/api/punch-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });
    onRefresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this punch item?")) return;
    await fetch(`/api/punch-items/${item.id}`, { method: "DELETE" });
    onRefresh();
  }

  const typeCls = TYPE_COLORS[item.type_code] ?? "text-white/40 bg-white/5 border-white/10";

  return (
    <div className={`rounded-xl border p-4 transition-colors ${isDone ? "bg-white/3 border-white/5 opacity-60" : "bg-white/5 border-white/10"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border ${typeCls}`}>
          {item.type_code} — {TYPE_LABELS[item.type_code] ?? item.type_code}
        </span>
        {isDone && (
          <span className="text-[10px] font-condensed uppercase tracking-wider text-green-400">
            ✓ Done
          </span>
        )}
      </div>

      <p className={`text-sm leading-snug ${isDone ? "text-white/40 line-through" : "text-white"}`}>
        {item.item_description}
      </p>

      {/* Location detail for GENERAL items */}
      {item.general_location && (
        <p className="text-xs text-white/40 mt-0.5 italic">{item.general_location}</p>
      )}

      {/* Photos row */}
      {(item.before_photo_url || item.after_photo_url || afterPreview) && (
        <div className="flex gap-3 mt-3">
          {item.before_photo_url && (
            <PhotoThumbnail url={item.before_photo_url} label="Before" />
          )}
          {item.after_photo_url && (
            <PhotoThumbnail url={item.after_photo_url} label="After" />
          )}
          {afterPreview && !item.after_photo_url && (
            <div className="block">
              <img src={afterPreview} alt="After (pending)" className="w-20 h-20 object-cover rounded border border-[#f08122]/50" />
              <p className="text-[10px] text-[#f08122]/60 mt-0.5 font-condensed uppercase tracking-wider">After (pending)</p>
            </div>
          )}
        </div>
      )}

      {/* Footer meta */}
      <p className="text-[10px] text-white/20 mt-2">
        Added {fmtDate(item.created_at)} by {item.created_by}
        {isDone && item.completed_by && ` · Completed by ${item.completed_by}`}
        {isDone && item.completed_at && ` on ${fmtDate(item.completed_at)}`}
      </p>

      {/* Actions */}
      {!isDone && (
        <div className="mt-3 space-y-2">
          {/* Completion flow */}
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg px-3 py-2 transition-colors text-sm text-white/60">
              <span className="text-[#f08122]">📷</span>
              {afterFile ? afterFile.name : "Attach completion photo"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={onAfterFileChange}
              />
            </label>
            <button
              onClick={handleComplete}
              disabled={completing}
              className="shrink-0 px-4 py-2 rounded-lg bg-green-700/60 hover:bg-green-600/70 text-green-200 text-sm font-condensed uppercase tracking-wider transition-colors disabled:opacity-40"
            >
              {completing ? "Saving…" : "Mark Done"}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* PM / admin reopen + delete */}
      {canEdit && isDone && (
        <button
          onClick={handleReopen}
          className="mt-2 text-[10px] text-white/25 hover:text-[#f08122] font-condensed uppercase tracking-wider transition-colors"
        >
          Reopen
        </button>
      )}
      {canEdit && (
        <button
          onClick={handleDelete}
          className="mt-2 ml-4 text-[10px] text-white/15 hover:text-red-400 font-condensed uppercase tracking-wider transition-colors"
        >
          Delete
        </button>
      )}
    </div>
  );
}

// ─── AddItemForm ──────────────────────────────────────────────────────────────

function AddItemForm({
  jobId,
  rooms,
  onAdded,
}: {
  jobId: string;
  rooms: Room[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState<string>("__general__");
  const [generalLocation, setGeneralLocation] = useState("");
  const [description, setDescription] = useState("");
  const [typeCode, setTypeCode] = useState("S");
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Description is required"); return; }
    if (roomId === "__general__" && !generalLocation.trim()) {
      setError("Location detail is required for General items");
      return;
    }

    setSaving(true);
    try {
      // Create item
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

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create item");
        setSaving(false);
        return;
      }

      const { id: newItemId } = await res.json();

      // Upload before photo if attached
      if (beforeFile && newItemId) {
        await uploadPhoto(newItemId, "before", beforeFile);
      }

      // Reset form
      setDescription("");
      setGeneralLocation("");
      setBeforeFile(null);
      setTypeCode("S");
      setOpen(false);
      onAdded();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-3 text-white/30 hover:text-[#f08122] hover:border-[#f08122]/30 text-sm font-condensed uppercase tracking-wider transition-colors"
      >
        + Add Punch Item
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e1e1e] border border-white/10 rounded-xl p-4 space-y-3">
      <p className="text-[#f08122] font-condensed uppercase tracking-wider text-xs mb-1">New Punch Item</p>

      {/* Room */}
      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Room</label>
        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
          <option value="__general__">General (not room-specific)</option>
        </select>
      </div>

      {/* General location (only when GENERAL selected) */}
      {roomId === "__general__" && (
        <div>
          <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">
            Location / Context
          </label>
          <input
            type="text"
            value={generalLocation}
            onChange={(e) => setGeneralLocation(e.target.value)}
            placeholder="e.g. STN-1 fascia caps"
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50"
          />
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the punch item…"
          rows={2}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50 resize-none"
        />
      </div>

      {/* Type code */}
      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">Type</label>
        <select
          value={typeCode}
          onChange={(e) => setTypeCode(e.target.value)}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
        >
          <option value="S">S — Service only (same trip)</option>
          <option value="S+M">S+M — Service + manufacture (~10 days)</option>
          <option value="HP">HP — Hardware procurement</option>
          <option value="TD">TD — Trade dependency (not ACC&apos;s clock)</option>
        </select>
      </div>

      {/* Before photo */}
      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">
          Before Photo (optional)
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-[#111] border border-white/10 rounded px-3 py-2 text-sm text-white/40 hover:border-white/20 transition-colors">
          <span>📷</span>
          {beforeFile ? beforeFile.name : "Attach photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-lg bg-[#f08122] text-black text-sm font-condensed uppercase tracking-wider hover:bg-[#d4701e] transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add Item"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:border-white/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── PunchListPanel ───────────────────────────────────────────────────────────

export function PunchListPanel({
  jobId,
  role,
}: {
  jobId: string;
  role: "admin" | "pm" | "engineer" | "shop" | "installer";
}) {
  const [items, setItems] = useState<PunchItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isInstaller = role === "installer";
  const canEdit = role === "admin" || role === "pm";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/punch-items`, { cache: "no-store" });
      if (!res.ok) { setError("Failed to load punch list"); return; }
      const body = await res.json();
      setItems(body.items ?? []);
      setRooms(body.rooms ?? []);
    } catch {
      setError("Failed to load punch list");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openItems = items.filter((i) => i.status === "open");
  const doneItems = items.filter((i) => i.status === "done");
  const groups = groupByRoom(openItems);
  const doneGroups = groupByRoom(doneItems);

  if (loading) {
    return (
      <div className="py-8 text-center text-white/20 text-sm font-condensed uppercase tracking-wider">
        Loading punch list…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
          Punch List
        </p>
        <div className="flex gap-3 text-xs text-white/30 font-condensed uppercase tracking-wider">
          <span>{openItems.length} open</span>
          <span>·</span>
          <span>{doneItems.length} done</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Add item (PM/admin only) */}
      {canEdit && (
        <AddItemForm jobId={jobId} rooms={rooms} onAdded={refresh} />
      )}

      {/* No items state */}
      {items.length === 0 && (
        <div className="text-center py-8 text-white/15 text-sm">
          No punch items yet.
          {canEdit && " Add the first one above."}
        </div>
      )}

      {/* Open items by room */}
      {groups.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-condensed uppercase tracking-[0.2em] text-white/30 mb-2 px-1">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isInstaller={isInstaller}
                    canEdit={canEdit}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed items — collapsed by default */}
      {doneItems.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[10px] font-condensed uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors list-none flex items-center gap-2">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            {doneItems.length} completed item{doneItems.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 space-y-5">
            {doneGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-condensed uppercase tracking-[0.2em] text-white/20 mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isInstaller={isInstaller}
                      canEdit={canEdit}
                      onRefresh={refresh}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
