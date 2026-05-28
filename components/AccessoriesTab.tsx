"use client";

import { useState, useCallback } from "react";

// -- Types ------------------------------------------------------------------

export type PullRow = {
  id: string;
  make: string;
  model: string;
  size: string;
  room: string;
  notes: string;
  qty: number;
};

export type AccessoryRow = {
  id: string;
  part_number: string;
  description: string;
  qty: number;
  handed: "N/A" | "Left" | "Right";
  room: string;
  notes: string;
};

export type AccessoriesData = {
  pulls: PullRow[];
  accessories: AccessoryRow[];
};

type Props = {
  specId: string;
  initialData: AccessoriesData;
};

// -- Helpers ----------------------------------------------------------------

function uid() { return Math.random().toString(36).slice(2, 10); }

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

function blankPull(): PullRow {
  return { id: uid(), make: "", model: "", size: "", room: "", notes: "", qty: 1 };
}

function blankAccessory(): AccessoryRow {
  return { id: uid(), part_number: "", description: "", qty: 1, handed: "N/A", room: "", notes: "" };
}

// -- Component --------------------------------------------------------------

export function AccessoriesTab({ specId, initialData }: Props) {
  const [pulls, setPulls] = useState<PullRow[]>(initialData.pulls);
  const [accessories, setAccessories] = useState<AccessoryRow[]>(initialData.accessories);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // -- Pulls handlers -------------------------------------------------------
  function addPull() {
    setPulls((p) => [...p, blankPull()]);
    setSaveState("idle");
  }
  function updatePull(id: string, patch: Partial<PullRow>) {
    setPulls((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
    setSaveState("idle");
  }
  function removePull(id: string) {
    setPulls((p) => p.filter((r) => r.id !== id));
    setSaveState("idle");
  }

  // -- Accessories handlers -------------------------------------------------
  function addAccessory() {
    setAccessories((a) => [...a, blankAccessory()]);
    setSaveState("idle");
  }
  function updateAccessory(id: string, patch: Partial<AccessoryRow>) {
    setAccessories((a) => a.map((r) => r.id === id ? { ...r, ...patch } : r));
    setSaveState("idle");
  }
  function removeAccessory(id: string) {
    setAccessories((a) => a.filter((r) => r.id !== id));
    setSaveState("idle");
  }

  // -- Save -----------------------------------------------------------------
  const save = useCallback(async () => {
    setSaveState("saving");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/specs/${specId}/accessories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pulls, accessories }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg((body as { error?: string }).error ?? `Save failed (${res.status})`);
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setErrorMsg("Network error -- try again");
      setSaveState("error");
    }
  }, [specId, pulls, accessories]);

  const saveLabel =
    saveState === "saving" ? "Saving..." :
    saveState === "saved"  ? "Saved" :
    saveState === "error"  ? "Error -- retry" : "Save Accessories";

  return (
    <div className="space-y-10">

      {/* -- PULLS --------------------------------------------------------- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm">Pulls</p>
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-0.5">
              List each pull variation -- different sizes, rooms, or models
            </p>
          </div>
        </div>

        {pulls.length === 0 ? (
          <p className="text-white/20 text-xs font-condensed uppercase tracking-widest italic py-3">
            No pulls added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_1fr_2fr_80px_36px] gap-2 px-1">
              <span className={LABEL}>Make</span>
              <span className={LABEL}>Model</span>
              <span className={LABEL}>Size</span>
              <span className={LABEL}>Room</span>
              <span className={LABEL}>Notes</span>
              <span className={LABEL}>Qty</span>
              <span />
            </div>

            {pulls.map((row) => (
              <div key={row.id} className="bg-[#2a2a2a] rounded p-3">
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_2fr_80px_36px] gap-2 items-end">
                  <div>
                    <label className={LABEL + " sm:hidden"}>Make</label>
                    <input
                      value={row.make}
                      onChange={(e) => updatePull(row.id, { make: e.target.value })}
                      placeholder="Richelieu"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Model</label>
                    <input
                      value={row.model}
                      onChange={(e) => updatePull(row.id, { model: e.target.value })}
                      placeholder="BP81296195"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Size</label>
                    <input
                      value={row.size}
                      onChange={(e) => updatePull(row.id, { size: e.target.value })}
                      placeholder="5 in / 128mm"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Room</label>
                    <input
                      value={row.room}
                      onChange={(e) => updatePull(row.id, { room: e.target.value })}
                      placeholder="Kitchen"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Notes</label>
                    <input
                      value={row.notes}
                      onChange={(e) => updatePull(row.id, { notes: e.target.value })}
                      placeholder="Appliance pull on fridge panel..."
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) => updatePull(row.id, { qty: parseInt(e.target.value) || 1 })}
                      className={INPUT + " text-center"}
                    />
                  </div>
                  <div className="flex items-end justify-center">
                    <button
                      onClick={() => removePull(row.id)}
                      className="text-white/20 hover:text-red-400 transition-colors text-sm pb-2"
                      title="Remove pull"
                    >
                      x
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addPull}
          className="mt-3 border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-2 px-5 transition-colors w-full"
        >
          + Add Pull
        </button>
      </section>

      {/* -- REVASHELF / ACCESSORIES --------------------------------------- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm">RevAShelf / Accessories</p>
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-0.5">
              Trash pullouts, docking drawers, rollouts, and other hardware accessories
            </p>
          </div>
        </div>

        {accessories.length === 0 ? (
          <p className="text-white/20 text-xs font-condensed uppercase tracking-widest italic py-3">
            No accessories added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_2fr_80px_100px_1fr_1.5fr_36px] gap-2 px-1">
              <span className={LABEL}>Part #</span>
              <span className={LABEL}>Description</span>
              <span className={LABEL}>Qty</span>
              <span className={LABEL}>Left / Right</span>
              <span className={LABEL}>Room</span>
              <span className={LABEL}>Notes</span>
              <span />
            </div>

            {accessories.map((row) => (
              <div key={row.id} className="bg-[#2a2a2a] rounded p-3">
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_2fr_80px_100px_1fr_1.5fr_36px] gap-2 items-end">
                  <div>
                    <label className={LABEL + " sm:hidden"}>Part #</label>
                    <input
                      value={row.part_number}
                      onChange={(e) => updateAccessory(row.id, { part_number: e.target.value })}
                      placeholder="RS-KD-24-2"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Description</label>
                    <input
                      value={row.description}
                      onChange={(e) => updateAccessory(row.id, { description: e.target.value })}
                      placeholder="24in 2-tier kitchen drawer"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) => updateAccessory(row.id, { qty: parseInt(e.target.value) || 1 })}
                      className={INPUT + " text-center"}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Left / Right</label>
                    <select
                      value={row.handed}
                      onChange={(e) => updateAccessory(row.id, { handed: e.target.value as AccessoryRow["handed"] })}
                      className={SELECT}
                    >
                      <option value="N/A">N/A</option>
                      <option value="Left">Left</option>
                      <option value="Right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Room</label>
                    <input
                      value={row.room}
                      onChange={(e) => updateAccessory(row.id, { room: e.target.value })}
                      placeholder="Kitchen"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL + " sm:hidden"}>Notes</label>
                    <input
                      value={row.notes}
                      onChange={(e) => updateAccessory(row.id, { notes: e.target.value })}
                      placeholder="Optional notes..."
                      className={INPUT}
                    />
                  </div>
                  <div className="flex items-end justify-center">
                    <button
                      onClick={() => removeAccessory(row.id)}
                      className="text-white/20 hover:text-red-400 transition-colors text-sm pb-2"
                      title="Remove accessory"
                    >
                      x
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addAccessory}
          className="mt-3 border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-2 px-5 transition-colors w-full"
        >
          + Add Item
        </button>
      </section>

      {/* -- Save button --------------------------------------------------- */}
      <div className="flex items-center gap-4 pt-4 border-t border-white/10">
        <button
          onClick={save}
          disabled={saveState === "saving"}
          className={`font-condensed uppercase tracking-widest text-xs py-2.5 px-6 rounded transition-colors ${
            saveState === "saving"
              ? "bg-white/5 text-white/20 cursor-not-allowed"
              : saveState === "saved"
              ? "bg-green-800/40 text-green-300 border border-green-700/40"
              : saveState === "error"
              ? "bg-red-900/30 text-red-300 border border-red-700/40"
              : "bg-[#f08122] hover:bg-[#d9711e] text-white"
          }`}
        >
          {saveLabel}
        </button>
        {errorMsg && (
          <span className="text-red-400 text-xs font-condensed uppercase tracking-widest">{errorMsg}</span>
        )}
        {saveState === "saved" && (
          <span className="text-green-400 text-xs font-condensed uppercase tracking-widest">
            Accessories saved
          </span>
        )}
      </div>
    </div>
  );
}
