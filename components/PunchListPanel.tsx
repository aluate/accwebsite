"use client";

/**
 * PunchListPanel — Full punch list UI for a job.
 *
 * PM / Admin view:
 *   - Add Item form (room from spec or GENERAL, description, type code)
 *   - Optional before-photo upload when creating
 *   - Reopen items, mark won't fix, delete items
 *   - Completion photo optional (they are closing items at a desk)
 *
 * Installer / shop / engineer view:
 *   - Add items, mark done
 *   - Completion photo REQUIRED (they are standing in front of the work)
 *
 * Items are grouped by room. GENERAL items appear at the bottom.
 * Type codes: S = Service only, S+M = Service + manufacture, HP = Hardware procurement, TD = Trade dependency.
 *
 * THREE THINGS WERE BROKEN HERE AND ALL THREE WERE SHAPE MISMATCHES WITH THE API.
 *
 * 1. Nobody could close a punch item. uploadPhoto() read `body.url` from a
 *    response that returns `{ ok, photos: [{ id, url }] }`. There is no top
 *    level `url`, so it always resolved undefined, handleComplete treated that
 *    as a failed upload and returned BEFORE the PATCH. The photo was in
 *    Supabase; the item stayed open; the field saw "Photo upload failed" on a
 *    photo that uploaded fine. Verified live on 2026-09-16: two photos in
 *    storage, item still open.
 *
 * 2. No photo ever rendered. This file read item.before_photo_url /
 *    item.after_photo_url. The API returns a `photos` array of signed URLs and
 *    (legacy) *_photo_path. Those two field names do not exist on the payload,
 *    so the photo row was never even rendered.
 *
 * 3. The upload sent form field "which"; the route reads "label". Every photo
 *    in the table has label = null.
 *
 * And a fourth, which is why items went missing: the status union here was
 * "open" | "done", but the API accepts and stores "scheduled" and "wont_fix"
 * too. Anything in those two states matched neither filter and vanished from
 * the panel completely — no row, no count, no error.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Room = { id: string; name: string; sort_order: number };

type PunchStatus = "open" | "scheduled" | "done" | "wont_fix";

/** One row of punch_item_photos, already signed by the API. */
type PunchPhoto = {
  id: string;
  storage_path: string;
  media_type: string;      // "photo" | "video"
  label: string | null;    // "before" | "after" | null
  sort_order: number;
  url: string | null;      // signed, 1h — null if signing failed
};

type PunchItem = {
  id: string;
  room_id: string | null;
  room_name: string | null;
  general_location: string | null;
  item_description: string;
  type_code: string;
  status: PunchStatus;
  photos: PunchPhoto[];
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
};

/** An item is closed when it will not be worked again. */
function isClosed(s: PunchStatus): boolean {
  return s === "done" || s === "wont_fix";
}

const STATUS_CHIP: Record<PunchStatus, { label: string; cls: string } | null> = {
  open: null,
  scheduled: { label: "Scheduled", cls: "text-blue-300 bg-blue-900/30" },
  done: { label: "\u2713 Done", cls: "text-green-400 bg-green-900/20" },
  wont_fix: { label: "Won\u2019t fix", cls: "text-white/40 bg-white/10" },
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

type UploadResult = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * The form field is "label" — the route reads form.get("label"). It used to
 * send "which", which is why every photo in punch_item_photos has label null.
 *
 * The response is { ok, photos: [{ id, url }] }. Reading body.url gets
 * undefined on a completely successful upload, which is what made "Mark Done"
 * impossible. Returning a tagged result rather than a bare string|null means a
 * caller can no longer confuse "uploaded, no URL back" with "upload failed".
 */
async function uploadPhoto(
  itemId: string,
  label: "before" | "after",
  file: File
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  try {
    const res = await fetch(`/api/punch-items/${itemId}/photo`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? `Upload failed (${res.status})` };
    return { ok: true, url: body.photos?.[0]?.url ?? null };
  } catch {
    return { ok: false, error: "Upload failed — check your connection" };
  }
}

// ─── PhotoThumbnail ───────────────────────────────────────────────────────────

function PhotoThumbnail({ photo }: { photo: PunchPhoto }) {
  // A signed URL expires after an hour. If signing failed the API sends null,
  // and a thumbnail with src={null} is a broken-image icon with no explanation.
  if (!photo.url) {
    return (
      <div className="w-20 h-20 rounded border border-white/10 flex items-center justify-center text-[9px] text-white/25 text-center px-1">
        photo unavailable
      </div>
    );
  }
  const caption = photo.label ?? (photo.media_type === "video" ? "Video" : "Photo");
  return (
    <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
      {photo.media_type === "video" ? (
        <div className="w-20 h-20 rounded border border-white/10 flex items-center justify-center bg-black/40 text-2xl hover:border-[#f08122] transition-colors">
          &#9654;
        </div>
      ) : (
        <img
          src={photo.url}
          alt={caption}
          className="w-20 h-20 object-cover rounded border border-white/10 hover:border-[#f08122] transition-colors"
        />
      )}
      <p className="text-[10px] text-white/30 mt-0.5 font-condensed uppercase tracking-wider">{caption}</p>
    </a>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  photoRequired,
  canEdit,
  onRefresh,
}: {
  item: PunchItem;
  /** Field roles must leave evidence; PM/admin closing at a desk need not. */
  photoRequired: boolean;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isDone = isClosed(item.status);

  function onAfterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAfterFile(f);
    setAfterPreview(URL.createObjectURL(f));
  }

  /** PATCH the status and surface whatever the server actually said. */
  async function setStatus(status: PunchStatus): Promise<boolean> {
    const res = await fetch(`/api/punch-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) return true;
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? `Could not update item (${res.status})`);
    return false;
  }

  async function handleComplete() {
    if (photoRequired && !afterFile) {
      setError("Photo required to mark as done");
      return;
    }
    setError("");
    setCompleting(true);
    try {
      // Upload the completion photo FIRST, so a done item never exists without
      // its evidence. A failed upload stops here — but only a genuinely failed
      // one now, which is the bug this whole panel was stuck on.
      if (afterFile) {
        const up = await uploadPhoto(item.id, "after", afterFile);
        if (!up.ok) { setError(up.error); setCompleting(false); return; }
      }
      if (!(await setStatus("done"))) { setCompleting(false); return; }
      onRefresh();
    } catch {
      setError("Something went wrong");
      setCompleting(false);
    }
  }

  async function handleReopen() {
    setError("");
    if (await setStatus("open")) onRefresh();
  }

  async function handleWontFix() {
    if (!window.confirm("Close this item as won\u2019t fix? It stays on the record.")) return;
    setError("");
    if (await setStatus("wont_fix")) onRefresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this punch item?")) return;
    setError("");
    const res = await fetch(`/api/punch-items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Could not delete item (${res.status})`);
      return;
    }
    onRefresh();
  }

  const typeCls = TYPE_COLORS[item.type_code] ?? "text-white/40 bg-white/5 border-white/10";

  return (
    <div className={`rounded-xl border p-4 transition-colors ${isDone ? "bg-white/3 border-white/5 opacity-60" : "bg-white/5 border-white/10"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border ${typeCls}`}>
          {item.type_code} — {TYPE_LABELS[item.type_code] ?? item.type_code}
        </span>
        {STATUS_CHIP[item.status] && (
          <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_CHIP[item.status]!.cls}`}>
            {STATUS_CHIP[item.status]!.label}
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

      {/* Photos row — every photo the API returned, plus the not-yet-sent one */}
      {(item.photos.length > 0 || afterPreview) && (
        <div className="flex gap-3 mt-3 flex-wrap">
          {item.photos.map((photo) => (
            <PhotoThumbnail key={photo.id} photo={photo} />
          ))}
          {afterPreview && (
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
        {isDone && item.completed_by && ` · ${item.status === "wont_fix" ? "Closed" : "Completed"} by ${item.completed_by}`}
        {isDone && item.completed_at && ` on ${fmtDate(item.completed_at)}`}
      </p>

      {/* Actions */}
      {!isDone && (
        <div className="mt-3 space-y-2">
          {/* Completion flow */}
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg px-3 py-2 transition-colors text-sm text-white/60">
              <span className="text-[#f08122]">📷</span>
              {afterFile ? afterFile.name : photoRequired ? "Attach completion photo (required)" : "Attach completion photo (optional)"}
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

      {/* PM / admin: reopen, close as won't fix, delete */}
      <div className="flex items-center gap-4 mt-2">
        {canEdit && isDone && (
          <button
            onClick={handleReopen}
            className="text-[10px] text-white/25 hover:text-[#f08122] font-condensed uppercase tracking-wider transition-colors"
          >
            Reopen
          </button>
        )}
        {canEdit && !isDone && (
          <button
            onClick={handleWontFix}
            className="text-[10px] text-white/25 hover:text-white/50 font-condensed uppercase tracking-wider transition-colors"
          >
            Won&apos;t fix
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleDelete}
            className="text-[10px] text-white/15 hover:text-red-400 font-condensed uppercase tracking-wider transition-colors"
          >
            Delete
          </button>
        )}
      </div>
      {isDone && error && <p className="text-red-400 text-xs mt-2">{error}</p>}
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

      // Upload before photo if attached. The item is already created at this
      // point, so a photo failure must not read as "the item failed" — say
      // exactly what happened and leave the item alone.
      if (beforeFile && newItemId) {
        const up = await uploadPhoto(newItemId, "before", beforeFile);
        if (!up.ok) {
          setError(`Item added, but the photo did not upload: ${up.error}`);
          setBeforeFile(null);
          onAdded();
          setSaving(false);
          return;
        }
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
  role: "admin" | "karl" | "pm" | "engineer" | "shop" | "installer";
}) {
  const [items, setItems] = useState<PunchItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // canManage mirrors lib/punch-auth.ts exactly. If these two ever disagree the
  // UI offers a button the server refuses, which is how this panel got here.
  const canManage = role === "admin" || role === "karl" || role === "pm";
  // Everyone else is a field role: they close items in front of the work, so a
  // completion photo is required of them and optional for the desk.
  const photoRequired = !canManage;
  const canAdd = true; // every internal role can create punch items

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

  // "scheduled" and "wont_fix" are real statuses the API stores. Filtering on
  // only open/done made items in those two states invisible — not greyed out,
  // not counted, GONE. Scheduled work is still open work; won't-fix is closed.
  const openItems = items.filter((i) => !isClosed(i.status));
  const doneItems = items.filter((i) => isClosed(i.status));
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
          <span>{doneItems.length} closed</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Add item (all roles) */}
      {canAdd && (
        <AddItemForm jobId={jobId} rooms={rooms} onAdded={refresh} />
      )}

      {/* No items state */}
      {items.length === 0 && (
        <div className="text-center py-8 text-white/15 text-sm">
          No punch items yet.
          {" Add the first one above."}
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
                    photoRequired={photoRequired}
                    canEdit={canManage}
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
            {doneItems.length} closed item{doneItems.length !== 1 ? "s" : ""}
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
                      photoRequired={photoRequired}
                      canEdit={canManage}
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
