"use client";

/**
 * PasteJobsModal — load or correct a screenful of jobs from a spreadsheet.
 *
 * Karl works the pipeline out of a sheet. One job per modal is the wrong shape
 * for that, so this takes the columns he already has, shows exactly what it read
 * out of them, and creates them in one pass.
 *
 * The parsing lives in lib/paste-jobs.ts and is tested there. This component's
 * only real job is to make the refused rows impossible to miss: a row that could
 * not be read is shown in place, with the reason, and is not created. Nothing is
 * quietly turned into a zero or a blank date, which is the failure a bulk import
 * would otherwise hide inside a cheerful "30 jobs created".
 *
 * Rows are posted one at a time to the same endpoint the Add Job form uses,
 * rather than through a bulk route of their own. One save path is the point: a
 * field that survives here survives there.
 */

import { useMemo, useState } from "react";
import {
  PASTE_COLUMNS,
  parsePastedJobs,
  rowToJobBody,
  rowIsValid,
  type PasteKey,
  type PasteRow,
} from "@/lib/paste-jobs";

type RowOutcome = { line: number; ok: boolean; message: string };

const EXAMPLE = [
  "26401\tAtlas\tKenny Debaene\t5712 Davenport St\tHayden\t\t11/3/2026\t11/17/2026\tACC\t65\t320\t80",
  "26404\tBush Legacy\t\t111 Red Fir Rd\tRathdrum\t\t12/1/2026\t\tSub\t40\t210\t60",
].join("\n");

export default function PasteJobsModal({
  existingJobNumbers,
  onClose,
  onDone,
}: {
  existingJobNumbers: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcomes, setOutcomes] = useState<RowOutcome[]>([]);

  const parsed = useMemo(
    () => (text.trim() ? parsePastedJobs(text, { existingJobNumbers }) : null),
    [text, existingJobNumbers],
  );

  const ready = parsed ? parsed.rows.filter(rowIsValid) : [];
  const blocked = parsed ? parsed.rows.filter((r) => !rowIsValid(r)) : [];
  const shownColumns: PasteKey[] = parsed?.columns.length ? parsed.columns : PASTE_COLUMNS.map((c) => c.key);

  async function createAll() {
    if (!parsed || ready.length === 0) return;
    setSaving(true);
    const results: RowOutcome[] = [];
    /*
      Sequential on purpose. Job ids come from a single counter row, and firing
      twenty creates at once turns that into a contention problem for no gain —
      twenty jobs is under a second either way.
    */
    for (const row of ready) {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rowToJobBody(row)),
        });
        if (res.ok) {
          const body = await res.json();
          results.push({ line: row.line, ok: true, message: body.job_number ? `created ${body.job_number}` : "created" });
        } else {
          const body = await res.json().catch(() => ({}));
          results.push({ line: row.line, ok: false, message: body.error ?? `save failed (${res.status})` });
        }
      } catch {
        results.push({ line: row.line, ok: false, message: "network error" });
      }
      setOutcomes([...results]);
    }
    setSaving(false);
    if (results.some((r) => r.ok)) onDone();
  }

  const created = outcomes.filter((o) => o.ok).length;
  const failedRows = outcomes.filter((o) => !o.ok);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-10 px-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#1a1b1c] border border-white/15 rounded-2xl w-full max-w-6xl p-6 shadow-2xl mb-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl uppercase tracking-wide text-[#f08122]">Paste jobs from a spreadsheet</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg">✕</button>
        </div>

        <p className="text-white/40 text-xs mb-2">
          Copy the rows out of Excel or Sheets and paste them below. Keep your header row and the columns can be in
          any order; without one, this order is assumed:
        </p>
        <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-3">
          {PASTE_COLUMNS.map((c) => c.label).join(" · ")}
        </p>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setOutcomes([]); }}
          spellCheck={false}
          rows={6}
          placeholder={EXAMPLE}
          className="w-full bg-black/40 border border-white/15 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#f08122]/60 placeholder-white/15"
        />

        {parsed && (
          <>
            <div className="flex items-center gap-4 mt-4 mb-2 text-xs font-condensed uppercase tracking-widest">
              <span className="text-emerald-400">{ready.length} ready</span>
              {blocked.length > 0 && <span className="text-red-400">{blocked.length} blocked</span>}
              <span className="text-white/30">
                {parsed.headerDetected ? "header row read" : "no header row — assuming the order above"}
              </span>
            </div>

            {parsed.errors.map((e, i) => (
              <p key={i} className="text-red-400 text-xs mb-2">{e}</p>
            ))}

            <div className="overflow-x-auto border border-white/10 rounded max-h-[45vh]">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#232425]">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-condensed uppercase tracking-widest text-white/40">Row</th>
                    {shownColumns.map((k) => (
                      <th key={k} className="text-left px-2 py-1.5 font-condensed uppercase tracking-widest text-white/40 whitespace-nowrap">
                        {PASTE_COLUMNS.find((c) => c.key === k)?.label ?? k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => (
                    <RowView key={row.line} row={row} columns={shownColumns} outcome={outcomes.find((o) => o.line === row.line)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {outcomes.length > 0 && (
          <p className="mt-3 text-xs">
            <span className="text-emerald-400">{created} created.</span>{" "}
            {failedRows.length > 0 && <span className="text-red-400">{failedRows.length} failed — see the rows above.</span>}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={createAll}
            disabled={saving || ready.length === 0}
            className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-40 text-white text-xs font-condensed uppercase tracking-widest rounded-lg px-4 py-2.5 transition-colors"
          >
            {saving ? "Creating…" : ready.length ? `Create ${ready.length} job${ready.length === 1 ? "" : "s"}` : "Nothing to create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-white/10 text-white/40 text-xs font-condensed uppercase tracking-widest rounded-lg hover:text-white/70 transition-colors"
          >
            {created > 0 ? "Done" : "Cancel"}
          </button>
          {blocked.length > 0 && (
            <span className="self-center text-white/30 text-[11px]">
              Blocked rows are left alone — fix them in your sheet and paste again.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RowView({ row, columns, outcome }: { row: PasteRow; columns: PasteKey[]; outcome?: RowOutcome }) {
  const bad = !rowIsValid(row);
  return (
    <>
      <tr className={bad ? "bg-red-500/10" : outcome?.ok ? "bg-emerald-500/10" : ""}>
        <td className="px-2 py-1 text-white/30 tabular-nums align-top">{row.line}</td>
        {columns.map((k) => {
          const cell = row.cells[k];
          const cellBad = !!cell?.error;
          return (
            <td key={k} className={`px-2 py-1 align-top whitespace-nowrap ${cellBad ? "text-red-400" : "text-white/80"}`}>
              {cell?.value !== null && cell?.value !== undefined
                ? String(cell.value)
                : cell?.raw?.trim()
                  ? <span className="text-red-400">{cell.raw.trim()}</span>
                  : <span className="text-white/15">—</span>}
            </td>
          );
        })}
      </tr>
      {(bad || outcome) && (
        <tr className={bad ? "bg-red-500/10" : outcome?.ok ? "bg-emerald-500/10" : ""}>
          <td />
          <td colSpan={columns.length} className="px-2 pb-1.5 text-[10px]">
            {row.errors.map((e, i) => (
              <div key={i} className="text-red-400">↳ {e}</div>
            ))}
            {outcome && (
              <div className={outcome.ok ? "text-emerald-400" : "text-red-400"}>↳ {outcome.message}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
