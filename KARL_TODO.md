# Karl's To-Do — Inputs Queue

> **Updated 2026-05-09.** Archived item E (in-house e-sig — shipped as Phase 2.3, 2026-05-09).

---

## ★ Open items — still need Karl

### A. ACC's 10 named in-house stain mixes
**Unblocks:** real stain dropdown in the spec form.
- Easy: photo of your stain board / sample sticks → I'll OCR and dump rows into `data/catalogs/colors_stain.csv`.
- Manual: list as `Name, Base color, Notes` in any format.

---

### B. ML Campbell Cabinetcoat color codes
I added 4 placeholder rows (CC-WHITE, CC-XW, CC-LINEN, CC-BLACK). When you're near a fan deck, send the real codes/names.

---

### C. Real builder defaults
Per builder: Atlas, Bush Legacy, Premier, Stancraft, Cobalt, Bar 17, RSB Customs. Just answer:
- Carcass usually? (Hardrock Maple PB / PF Ply Maple / PF Ply Birch)
- Drawer box usually? (Doweled Butt-Joint / Buy-out Dovetail)
- Pull most-typical? (Bar 3in / Cup / Edge / etc.)
- Accessories standard? (Trash + rollouts + lazy susan, etc.)

---

### D. Tafisa color list per line
(Alto, Crystalite, Isola, Karisma, Smoothwood, Urbania, Brava, Feria, Viva, Materia)
Easiest: phone photo of fan deck pages, or ask the rep for a PDF.

---

### ~~E. In-house e-signature~~ ✅ SHIPPED 2026-05-09
Token URL → public signoff page → HTML5 canvas signature → signer name / IP / timestamp stored in `client_signoffs` table → PM email on completion. Live at `/signoff/[token]`. "Send for Signoff" button on every job page.

---

### F. Residential SOP file — Z drive folder structure
For the Z drive import spec, I need to see the residential SOP that documents the folder/file tree for each job. You mentioned it should exist somewhere — can you drop it in `EXAMPLE DRAWINGS/` or paste the path? I'll read it and fold the structure into the Z drive spec.

---

## Z Drive Spec — answers received 2026-05-08, ready for spec session

> Tell me "Z drive spec session" when you want to lock this down.

**Q1 — Folder structure:** One folder per job, same file tree for every job. Structure documented in the residential SOP (see item F above — need to locate the file).

**Q2 — Job identifier:** Mapping table required. Jobs start without an ID. They get a job ID when transferred from project pack to shop pack. Multiple work orders per job:
- Main casework split by finish group (each finish group = its own WO)
- Samples request = separate WO
- Change orders = separate WO
- All WOs roll up under the same parent job

**Q3 — Job metadata location:** Currently scattered. Karl wants a single form — fillable PDF or formatted Excel — that covers all job metadata. Must be designed with Innergy compatibility in mind (eventual migration target). This form is a build item; the Z drive import spec will reference it.

**Q4 — Sync frequency:** Real-time (as jobs come in). Architecture: a "Sync Job" button in the app that checks for new data, pulls updates, and archives stale items. The sync agent on advserver (Option A from the spec) handles the automated side; the button is the manual trigger for field users.

**Q5 — Write-back:** Bidirectional required.
- App → Z drive: spec PDFs, PM/installer notes, site photos
- Z drive → App: engineer drawings, CV exports, TradeSoft data
- Field users (PM, installer) update in app → engineers pull from app
- Engineers finish drawings → PM grabs from app in field

---

## TFL OCR — verify these when you get a sec

I ingested photos at `data/catalogs/sources/tfl-samples/` (43 new rows: 15 Stevenswood + 28 TruNorth). A handful need your eyes:

- **G92 "Drift Loud"** — sticker reads "Drift Loud" but probably "Drift Wood." Look at G92 in person and confirm; I'll batch-update both Stevenswood and TruNorth rows.
- **529 "Takase Teak" (TruNorth)** — hard to read in photo. Matched to Stevenswood's 529 on assumption they're the same decor. Alternatives considered: "Pearl Teak", "Naval Teak." Confirm.
- **174 Black** — Stevenswood sticker had "174" hand-written, printed sticker struck through. Went with 174 Black/ARTIKA based on TruNorth match. Confirm Stevenswood code is also 174.
- **Yellowstone Oak** and **Cascadia Rift** (TruNorth photo 2) — no codes visible, left out. If these are real ACC-stocked decors, send sticker codes and I'll add them.
- **Supplier overlap:** Many decors appear in BOTH Stevenswood and TruNorth with the same code. If ACC sources from whichever delivers fastest, keep both. If you've switched suppliers and one set is stale, tell me which supplier won and I'll prune.

---

## Things Claude has taken off your plate

- ~~Excel template~~ — Artifex spec sheet located + analyzed
- ~~LOT 4 title block~~ — adopted via Option A (re-rendered in code)
- ~~Admin password~~ — rotated to `Summer2026!` via `node scripts/rotate-admin-pw.mjs "Summer2026!"`
- ~~ML Campbell paint approach~~ — ML Campbell is the coating; BM/SW colors valid; ML preferred. Documented in `colors_paint.csv`.
- ~~Approval flow decision~~ — switching from DocuSign to in-house e-sig (see item E). Schema + state machine already scaffolded.
- ~~Cabinet Vision integration~~ — option (c): link to drawings PDF, no CV enumeration. CV dynamic reports flagged for later development.
- ~~Egger TFL list~~ — 69 decors ingested from Karl's `egger_decor_map.xlsx`.
- ~~Stevenswood full catalog~~ — resolved via sample box photo submission. ✅
- ~~Buy accspec.net~~ — using `advancedcabinets.org` instead. Vercel deployment live. ✅
- ~~Cloudflare Tunnel on advserver~~ — not needed. App runs on Vercel. ✅
- ~~Local production build~~ — not needed. Vercel handles all production builds. ✅
- ~~DocuSign provisioning~~ — archived. Replacing with in-house e-sig (see item E). ✅
- ~~`EXPRESS_ENABLED=false`~~ — verified, set in `.env.local`.
- ~~`.gitignore` excludes EXAMPLE DRAWINGS~~ — done.
- ~~Cab Door inside profiles + panels + edges + mitres + presets~~ — auto-extracted.
- ~~Self-test harness~~ — `npm run selftest` for green/red regression check.
- ~~Dev server start/restart script~~ — `scripts/dev-restart.ps1` and `.bat`.
- ~~2 admin accounts~~ — `node scripts/seed-admin-accounts.mjs` → creates `residential@advancedcabinets.net` and `joshl@advancedcabinets.net` (both role: admin, temp password: `Acc2026!`). Run once on your machine.
