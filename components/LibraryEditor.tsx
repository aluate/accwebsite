"use client";

import { useState, useCallback } from "react";

// Per-library expandable card. Defaults closed (just shows summary). When
// expanded, fetches the CSV from /api/admin/libraries/[name], parses to a
// row × col table, lets the admin add/edit/delete rows + columns, and on
// Save sends the updated CSV back. The server validates header match,
// writes to disk, and re-runs sync-catalogs.

type Props = { name: string; initialRows: number; initialBytes: number; initialModified: string };

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l, i) => l.length > 0 || i === 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; continue; }
        q = !q;
        continue;
      }
      if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function toCSV(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    lines.push(r.map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}

export function LibraryEditor({ name, initialRows, initialBytes, initialModified }: Props) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows]       = useState<string[][]>([]);
  const [err, setErr]         = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [filter, setFilter]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/admin/libraries/${name}`, { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b.error ?? `Load failed (${res.status})`);
        return;
      }
      const text = await res.text();
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    } catch {
      setErr("Load failed");
    } finally {
      setLoading(false);
    }
  }, [name]);

  async function save() {
    setBusy(true); setErr(""); setSavedNote("");
    try {
      const csv = toCSV(headers, rows);
      const res = await fetch(`/api/admin/libraries/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b.error ?? `Save failed (${res.status})`);
        return;
      }
      const b = await res.json();
      setSavedNote(`Saved ${b.rows} row(s) at ${new Date().toLocaleTimeString()}`);
    } catch {
      setErr("Save failed");
    } finally {
      setBusy(false);
    }
  }

  function updateCell(rIdx: number, cIdx: number, value: string) {
    const next = rows.map((r) => r.slice());
    next[rIdx][cIdx] = value;
    setRows(next);
  }

  function addRow() {
    setRows([...rows, headers.map(() => "")]);
  }

  async function removeRow(idx: number) {
    const rowId = rows[idx]?.[headers.indexOf("id")] || rows[idx]?.[0];
    if (rowId) {
      // Check blast radius before delete — admin-only, FK-aware.
      try {
        const res = await fetch(`/api/admin/libraries/${name}?blast=${encodeURIComponent(rowId)}`, { cache: "no-store" });
        if (res.ok) {
          const radius = await res.json() as { count: number; breakdown: Array<{ table: string; column: string; count: number }> };
          if (radius.count > 0) {
            const detail = radius.breakdown.filter((b) => b.count > 0).map((b) => `${b.count} in ${b.table}.${b.column}`).join(", ");
            const ok = window.confirm(`This row is referenced by ${radius.count} active record(s):\n  ${detail}\n\nDeleting will leave dangling references and may break specs. Continue?`);
            if (!ok) return;
          }
        }
      } catch {
        // If the blast check itself fails, just continue — don't block deletion.
      }
    }
    setRows(rows.filter((_, i) => i !== idx));
  }

  const filtered = filter
    ? rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.some((c) => c.toLowerCase().includes(filter.toLowerCase())))
    : rows.map((r, idx) => ({ r, idx }));

  return (
    <div className="bg-[#2d2d2d] rounded">
      <button
        type="button"
        onClick={async () => { setOpen((v) => !v); if (!open && headers.length === 0) await load(); }}
        className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-[#353535] rounded transition-colors"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-white font-medium">{name}</span>
          <span className="text-white/30 text-xs font-condensed uppercase tracking-widest">{initialRows} rows</span>
          <span className="text-white/20 text-[10px] font-condensed uppercase tracking-widest">{fmtBytes(initialBytes)}</span>
        </div>
        <span className="text-white/30 text-xs font-condensed uppercase tracking-widest">
          {open ? "▼" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/5 p-5">
          {loading && <p className="text-white/40 text-xs font-condensed uppercase tracking-widest">Loading…</p>}
          {!loading && headers.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter rows…"
                  className="bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f08122] flex-1 min-w-[160px]"
                />
                <a
                  href={`/api/admin/libraries/${name}?download=1`}
                  className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] border border-white/15 rounded px-3 py-1.5"
                  download
                >
                  Download CSV
                </a>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] border border-white/15 rounded px-3 py-1.5"
                >
                  + Add row
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-1.5 px-3 rounded disabled:opacity-50"
                >
                  Save
                </button>
                {savedNote && <span className="text-green-400/80 text-[10px] font-condensed uppercase tracking-widest">{savedNote}</span>}
                {err && <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest">{err}</span>}
              </div>

              <div className="overflow-x-auto">
                <table className="text-xs text-white/80 w-full">
                  <thead>
                    <tr className="text-[10px] text-white/40 font-condensed uppercase tracking-widest">
                      {headers.map((h) => <th key={h} className="px-2 py-1 text-left whitespace-nowrap">{h}</th>)}
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ r, idx }) => (
                      <tr key={idx} className="border-t border-white/5">
                        {r.map((cell, cIdx) => (
                          <td key={cIdx} className="px-2 py-1">
                            <input
                              value={cell}
                              onChange={(e) => updateCell(idx, cIdx, e.target.value)}
                              className="bg-transparent w-full min-w-[120px] focus:outline-none focus:bg-[#1a1a1a] focus:border focus:border-[#f08122] rounded px-1 py-0.5"
                            />
                          </td>
                        ))}
                        <td className="px-1">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="text-white/15 hover:text-red-400 text-[10px]"
                            title="Delete row"
                          >x</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="text-white/30 italic mt-3">No rows match filter.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
