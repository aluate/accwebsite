/**
 * lib/paste-jobs.ts — turn a block pasted out of a spreadsheet into job rows.
 *
 * Karl loads and corrects the pipeline from a spreadsheet, a screen at a time. The
 * Add Job form is one job per modal, which is the wrong shape for that: twenty jobs
 * is twenty modals, and the numbers he is reconciling are already sitting in columns.
 *
 * This is the parsing half, kept away from React so it can be tested directly —
 * the errors live in parsing, not in the table that displays it.
 *
 * THE RULE THIS FILE FOLLOWS.
 *
 * A cell that cannot be read is an error on that row, never a zero and never a
 * silently dropped field. The estimator audit's finding was that silent-failure is
 * the house style — `?? 0`, `r.ok ? … : []` — and that a missing labor rate quietly
 * billed 46 hours a house at $0. A bulk import is the same hazard multiplied: paste
 * thirty rows, look at the summary, and never notice that eight delivery dates were
 * unreadable. So an unreadable cell blocks its row and says why, and a row that is
 * blocked is not created.
 *
 * A blank cell is not an error. Blank means "leave it unset" — that is how a paste
 * of just job numbers and builders is supposed to behave.
 */

export type PasteKey =
  | "job_number"
  | "builder_company"
  | "client_name"
  | "site_address"
  | "city"
  | "pm"
  | "delivery_date"
  | "install_start_date"
  | "install_type"
  | "box_count"
  | "shop_hrs"
  | "install_hrs"
  | "estimated_value";

export type PasteColumn = {
  key: PasteKey;
  /** What the column is called in the app, and on the paste screen. */
  label: string;
  /** Header spellings accepted from a pasted header row, lower-cased. */
  aliases: string[];
  kind: "text" | "date" | "number" | "money" | "install_type";
};

/**
 * The default column order, used when the paste has no header row. It is the
 * order the paste screen shows, so a spreadsheet built to match it just works.
 */
export const PASTE_COLUMNS: PasteColumn[] = [
  { key: "job_number",        label: "Job #",         kind: "text",         aliases: ["job #", "job#", "job number", "job no", "tradesoft job #", "tradesoft", "job"] },
  { key: "builder_company",   label: "Builder",       kind: "text",         aliases: ["builder", "builder company", "company", "contractor", "gc"] },
  { key: "client_name",       label: "Client",        kind: "text",         aliases: ["client", "client name", "customer", "name", "job name"] },
  { key: "site_address",      label: "Address",       kind: "text",         aliases: ["address", "site address", "site", "street", "job address"] },
  { key: "city",              label: "City",          kind: "text",         aliases: ["city", "town"] },
  { key: "pm",                label: "PM",            kind: "text",         aliases: ["pm", "project manager", "manager"] },
  { key: "delivery_date",     label: "Delivery",      kind: "date",         aliases: ["delivery", "delivery date", "deliver", "ship", "ship date"] },
  { key: "install_start_date",label: "Install Start", kind: "date",         aliases: ["install start", "install", "install date", "inst start", "start"] },
  { key: "install_type",      label: "Install Type",  kind: "install_type", aliases: ["install type", "inst type", "installer", "type"] },
  { key: "box_count",         label: "Boxes",         kind: "number",       aliases: ["boxes", "box count", "box", "bxs"] },
  { key: "shop_hrs",          label: "Shop Hrs",      kind: "number",       aliases: ["shop hrs", "shop hours", "shop", "shop h"] },
  { key: "install_hrs",       label: "Install Hrs",   kind: "number",       aliases: ["install hrs", "install hours", "inst hrs", "inst h"] },
  { key: "estimated_value",   label: "Est Value",     kind: "money",        aliases: ["est value", "value", "estimated value", "amount", "$", "price", "quoted"] },
];

const BY_KEY = Object.fromEntries(PASTE_COLUMNS.map((c) => [c.key, c])) as Record<PasteKey, PasteColumn>;

/** Install type as the app stores it, from what a person would type in a sheet. */
const INSTALL_TYPE_WORDS: Record<string, string> = {
  "acc": "acc", "acc crew": "acc", "crew": "acc", "in house": "acc", "in-house": "acc", "us": "acc",
  "sub": "sub", "subcontractor": "sub", "subbed": "sub", "sub out": "sub",
  "delivery only": "delivery_only", "delivery": "delivery_only", "delivery_only": "delivery_only",
  "drop": "delivery_only", "drop off": "delivery_only", "supply only": "delivery_only",
};

export type CellResult = {
  raw: string;
  /** Parsed value, ready to post. `null` means the cell was blank. */
  value: string | number | null;
  error?: string;
};

export type PasteRow = {
  /** 1-based line number in what was pasted, for pointing at the offending row. */
  line: number;
  cells: Partial<Record<PasteKey, CellResult>>;
  /** Blocking problems. A row with any of these is not created. */
  errors: string[];
};

export type PasteParse = {
  columns: PasteKey[];
  rows: PasteRow[];
  headerDetected: boolean;
  /** Problems with the paste as a whole, not with one row. */
  errors: string[];
};

/* ── cell parsers ─────────────────────────────────────────────────────────── */

/**
 * A date, as a spreadsheet writes it. Accepts 2026-11-03, 11/3/2026 and 11/3/26,
 * and returns the app's storage format. Everything else is an error — guessing
 * between 3/11 and 11/3 would put a delivery eight months out with no sign of it.
 */
export function parseDate(raw: string): CellResult {
  const s = raw.trim();
  if (!s) return { raw, value: null };

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return finishDate(raw, Number(y), Number(m), Number(d));
  }
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (slash) {
    const [, mm, dd, yy] = slash;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return finishDate(raw, year, Number(mm), Number(dd));
  }
  return { raw, value: null, error: `"${s}" is not a date I can read — use 2026-11-03 or 11/3/2026` };
}

function finishDate(raw: string, y: number, m: number, d: number): CellResult {
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { raw, value: null, error: `"${raw.trim()}" is not a real date` };
  }
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Reject a day that does not exist in that month (2026-02-30) rather than
  // letting Postgres take it or JS roll it forward into March.
  const probe = new Date(`${iso}T12:00:00Z`);
  if (probe.getUTCMonth() + 1 !== m || probe.getUTCDate() !== d) {
    return { raw, value: null, error: `"${raw.trim()}" is not a real date` };
  }
  return { raw, value: iso };
}

/** A number, with the $ and thousands separators a sheet leaves behind. */
export function parseNumber(raw: string, label: string): CellResult {
  const s = raw.trim();
  if (!s) return { raw, value: null };
  const cleaned = s.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) {
    return { raw, value: null, error: `${label}: "${s}" is not a number` };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { raw, value: null, error: `${label}: "${s}" is not a number` };
  if (n < 0) return { raw, value: null, error: `${label}: "${s}" is negative` };
  return { raw, value: n };
}

export function parseInstallType(raw: string): CellResult {
  const s = raw.trim();
  if (!s) return { raw, value: null };
  const hit = INSTALL_TYPE_WORDS[s.toLowerCase()];
  if (!hit) {
    return { raw, value: null, error: `install type: "${s}" is not one of ACC crew, Sub, Delivery only` };
  }
  return { raw, value: hit };
}

/* ── the paste itself ─────────────────────────────────────────────────────── */

/** Excel and Sheets paste tab-separated. A hand-typed list is usually commas. */
function splitCells(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") return line.split("\t");
  // Minimal CSV: quoted fields may contain commas and doubled quotes.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function matchHeader(cell: string): PasteKey | null {
  const s = cell.trim().toLowerCase().replace(/[.:#]+$/, "").trim();
  if (!s) return null;
  for (const col of PASTE_COLUMNS) {
    if (col.aliases.includes(s) || col.label.toLowerCase() === s) return col.key;
  }
  return null;
}

export type ParseOptions = {
  /** Job numbers already in the system, so a clash is caught before the save. */
  existingJobNumbers?: string[];
  /** Column order to assume when the paste carries no header row. */
  assumeColumns?: PasteKey[];
};

export function parsePastedJobs(text: string, opts: ParseOptions = {}): PasteParse {
  const errors: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [], headerDetected: false, errors: ["Nothing pasted."] };

  const delimiter: "\t" | "," = lines[0].includes("\t") ? "\t" : ",";

  // A header row is one where most non-empty cells name a column we know. Two
  // matches is not enough — "Client" and "City" appear as data in a sheet of
  // addresses often enough to matter.
  const firstCells = splitCells(lines[0], delimiter).map((c) => c.trim());
  const matched = firstCells.map(matchHeader);
  const nonEmpty = firstCells.filter(Boolean).length;
  const hits = matched.filter(Boolean).length;
  const headerDetected = nonEmpty > 0 && hits >= Math.max(2, Math.ceil(nonEmpty * 0.6));

  const columns: PasteKey[] = headerDetected
    ? matched.map((m, i) => m ?? (`__ignore_${i}` as PasteKey))
    : (opts.assumeColumns ?? PASTE_COLUMNS.map((c) => c.key));

  const bodyLines = headerDetected ? lines.slice(1) : lines;
  if (bodyLines.length === 0) errors.push("The paste has a header row and nothing under it.");

  const existing = new Set((opts.existingJobNumbers ?? []).map((n) => String(n).trim()).filter(Boolean));
  const seen = new Map<string, number>();

  const rows: PasteRow[] = bodyLines.map((line, idx) => {
    const lineNo = idx + 1 + (headerDetected ? 1 : 0);
    const raws = splitCells(line, delimiter);
    const cells: Partial<Record<PasteKey, CellResult>> = {};
    const rowErrors: string[] = [];

    if (raws.length > columns.length) {
      rowErrors.push(`${raws.length} columns pasted, ${columns.length} expected — check for a stray tab or comma`);
    }

    columns.forEach((key, i) => {
      if (String(key).startsWith("__ignore_")) return;
      const col = BY_KEY[key];
      if (!col) return;
      const raw = raws[i] ?? "";
      let res: CellResult;
      switch (col.kind) {
        case "date":         res = parseDate(raw); break;
        case "number":       res = parseNumber(raw, col.label); break;
        case "money":        res = parseNumber(raw, col.label); break;
        case "install_type": res = parseInstallType(raw); break;
        default:             res = { raw, value: raw.trim() || null };
      }
      if (res.error) rowErrors.push(res.error);
      cells[key] = res;
    });

    // A job needs something to be called. Client name is the usual answer; a spec
    // home has only an address, and that is fine — nothing is not.
    const client = (cells.client_name?.value as string) ?? "";
    const address = (cells.site_address?.value as string) ?? "";
    if (!client && !address) rowErrors.push("no client name and no address — the job would have nothing to identify it");

    const jobNo = (cells.job_number?.value as string) ?? "";
    if (jobNo) {
      if (existing.has(jobNo)) rowErrors.push(`job #${jobNo} already exists`);
      const dupLine = seen.get(jobNo);
      if (dupLine) rowErrors.push(`job #${jobNo} is also on line ${dupLine} of this paste`);
      else seen.set(jobNo, lineNo);
    }

    return { line: lineNo, cells, errors: rowErrors };
  });

  return { columns: columns.filter((k) => !String(k).startsWith("__ignore_")), rows, headerDetected, errors };
}

/** The POST body for a row, in the same shape the Add Job form sends. */
export function rowToJobBody(row: PasteRow): Record<string, unknown> {
  const v = (k: PasteKey) => row.cells[k]?.value ?? null;
  const body: Record<string, unknown> = {
    client_name: (v("client_name") as string) ?? "",
    site_address: (v("site_address") as string) ?? "",
    city: (v("city") as string) ?? "",
    pm: v("pm"),
    status: "intake",
    builder_company: (v("builder_company") as string) ?? "",
    install_type: v("install_type"),
    delivery_date: v("delivery_date"),
    install_start_date: v("install_start_date"),
  };
  const jobNo = v("job_number");
  if (jobNo) body.job_number = String(jobNo);
  for (const k of ["box_count", "shop_hrs", "install_hrs", "estimated_value"] as PasteKey[]) {
    const n = v(k);
    if (n !== null) body[k] = n;
  }
  return body;
}

export const rowIsValid = (row: PasteRow) => row.errors.length === 0;
