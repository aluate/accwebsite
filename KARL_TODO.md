# Karl's To-Do — Inputs Queue

> **2026-05-04 end-of-day update:** Karl is out for the day; Claude ran autonomously through the road map.
>
> **Karl-only items still open:**
> - **#4** ACC's 10 named in-house stain mixes (no source available to me)
> - **#7b** DocuSign provisioning (account creation requires Karl)
> - **#8** Buy accspec.net (financial transaction — Karl only)
> - **#9** Install Cloudflare Tunnel on advserver (Karl's Windows host)
> - **#10** Production build on advserver (Karl's Windows host)
> - **Tafisa color list** per line (no source available to me)
> - **Stevenswood beyond ~25** (rep-emailed CSV, no source for me)
> - **Real builder defaults** for Atlas, Bush Legacy, Premier, Stancraft, Cobalt, Bar 17, RSB Customs (Karl's institutional knowledge)
> - **ML Campbell Cabinetcoat real codes** (no fan deck available to me)
>
> **Items resolved or shipped this session:**
> - #1 Excel template (Artifex) located + analyzed
> - #2 LOT 4 title block adopted via Option A (re-rendered in code)
> - #3 Password Summer2026! — script ready (`npm run rotate-admin-pw "Summer2026!"`)
> - #5 ML Campbell paint approach (a) — coating system + ACC prefers ML colors; documented in colors_paint.csv
> - #6 DocuSign approval flow — schema + state machine + webhook stub shipped
> - #7 CV integration option (c) — drawings-link UI shipped; manual entry preserved behind toggle
> - **Egger TFL list** — 69 decors ingested from Karl's egger_decor_map.xlsx
> - All Phase 1 / 2 / 3 / 5 / 6 / 9 code shipped (see TODO.md "Recent shipments")

## ★ Priority order (tackle in this order)

### 1. Drop the old Excel template
**Time:** 30 sec
**Why:** Unblocks the entire Excel output flow + title-block matching
(the two biggest deliverables Karl asked for).

**Steps:**
1. Open Windows Explorer.
2. Navigate to `C:\dev\repos\acc-website\EXAMPLE DRAWINGS`.
3. Drop the existing Excel spec template file there. Any `.xlsx` works.
4. Tell me "Excel dropped" and I'll move it to its permanent home,
   analyze the cell layout, and start the exceljs render code.
FROM KARL: THIS IS DONE IT'S THE ARTIFAX SPEC SHEET, IT'S CLOSE TO WHAT I WANT BUT WE NEED IT ON THE TITLE BLOCK. IT NEEDS TO REFLECT THE CHANGES WE TALKED ABOUT AND STILL BY EASY ENOUGH FOR A 10 YEAR OLD TO UPDATE.

---

### 2. Share one CV drawing PDF showing the title block
**Time:** 1 min
**Why:** I need to match the title block exactly on the spec output
(both PDF and Excel) so the merged document reads as one cohesive set.

**Steps:**
1. Open Cabinet Vision, export any complete drawing as PDF.
   OR find one of the existing drawings already in `EXAMPLE DRAWINGS/`
   that has the title block visible.
2. Copy its path or just confirm "use Spivey" / "use WO47081" /
   whichever one — I'll pull the title block from there.
3. (Optional) Note any details that don't render right in the existing
   drawings — fonts, logo position, fields you want added/removed.
FROM KARL: YOU CAN SELECT THE TITLE BLOCK FROM THE LOT 4 PROJECT. THAT'S WHAT WE'RE COPYING, WE EITHER TRY TO FORMAT IT OR WE HAVE LIKE... A BLANK PAGE THAT'S SAVED SOMEWHERE WHERE THE TITLE BLOCK EXISTS AND YOU CAN LAY OVER IT WITH A DIFFERENT OUTPUT? YOU TELL ME HOW THAT WOULD WORK. 

---

### 3. Approve a strong admin password
**Time:** 30 sec
**Why:** The bootstrap admin is currently `1234`. Before launch, this
needs to be a real password.

**Easy mode (I do it):** Tell me a password you'll remember, like
"yo Claude rotate to `XXXX`" — I'll hash it and update the DB via the
running app, no DB lock, no restart. You write it down.

FROM KARL: LETS DO Summer2026!

**Manual mode (you do it):**
1. Boot the dev server if not running (`npx next dev`).
2. Hit `http://localhost:3000/admin/builders`.
3. Find the "Residential Admin" row.
4. Click "Reset PW".
5. Enter a strong password, click Save.

---

### 4. Provide ACC's 10 named in-house stain mixes
**Time:** 5 min (or a phone-photo of your stain board)
**Why:** Unblocks the real stain dropdown.

**Steps:**
- Easy: take a photo of your stain board / sample sticks and send it.
  I'll OCR and dump rows into `data/catalogs/colors_stain.csv`.
- Manual: list them as `Name, Base color, Notes` in any format. Examples:
  ```
  Hazelnut, ML Campbell, warm medium brown — most-popular for white oak
  Ironbark, ML Campbell, dark cool gray — popular on rift oak
  ```

---

### 5. Confirm ML Campbell paint approach
**Time:** 30 sec — just answer a question
**Why:** Currently `colors_paint.csv` has BM and SW colors but only
placeholder for ML Campbell. Three options:

- (a) ML Campbell IS the coating, but COLOR comes from SW/BM color books
  → leave as-is, "ML" entries stay placeholder.
- (b) ML Campbell has its own color cards Karl wants in the dropdown
  → Karl shares the color list/PDF.
- (c) Karl wants only SW + BM + Custom Match, drop ML entirely
  → I delete the ML placeholder rows.

FROM KARL: (A), BUT WE USE ML CAMPBELL PIGMENTS AND PRODUCTS BUT CAN MATCH AND BM OR SW COLOR, SO THOSE ARE VALID SELECTIONS. HOWEVER, WE PREFER TO USE ML CAMPBELL COLORS

**Action:** answer "a", "b" with the file, or "c".

---

### 6. Decide approval flow (online vs offline)
**Time:** 30 sec — one decision
**Why:** Phase 5 (lifecycle gates) hinges on this.

**Online**: Client gets unique URL → views spec PDF → clicks "Approve"
(captures name, IP, timestamp). Polished, traceable, more work.

**Offline**: PM emails PDF → client signs/replies → PM clicks "Mark
Approved" + uploads signed copy. Faster to ship.

**Action:** pick one. I'll build the chosen flow.

FROM KARL: I'D LIKE TO USE DOCUSIGN TO COMBINE THE MOST RECENT QUOTE AND MOST RECENT DRAWINGS TO BE SENT OFF FOR APPROVAL BY THE CLIENT. IT ALSO NEEDS TO INCLUDE A RESIDENTIAL DISCLOSURE AS APPLICABLE. 

---

### 7. Decide Cabinet Vision integration
**Time:** 30 sec — one decision
**Why:** Cabinet line items are currently typed manually in the spec
form. Three options:

- (a) Stay manual forever — PM enters cabinets in the website.
- (b) CV exports XML/CSV → website imports.
- (c) Don't enumerate cabinets in spec at all — link to drawings PDF instead.

FROM KARL (C), BUT EVENTUALLY WE'LL MOVE TO HAVING DYNAMIC REPORTS THAT FEED FROM CV, FLAG IT FOR LATER DEVELOPMENT

**Action:** pick one.

---

### 7b. DocuSign provisioning (NEW — required for approval flow)
**Time:** 20 min one-time setup
**Why:** Karl chose DocuSign for client approval. The schema + webhook are scaffolded;
the API needs credentials to go live.

**Steps:**
1. Go to https://developers.docusign.com → sign up (free dev sandbox).
2. Create an Integration Key (Apps & Keys → Add App).
3. Generate an RSA keypair under that app — download the private key as `docusign-private.key`.
4. Note your Account ID (top-right of admin) and User ID (Apps & Keys → API username).
5. In DocuSign admin → Connect → Add Configuration:
   - URL: `https://accspec.net/api/docusign/webhook` (or your tunnel URL pre-launch)
   - Subscribe to envelope events: sent, delivered, completed, declined, voided.
   - Save the HMAC key it shows.
6. Drop the private key in the repo (gitignored): `C:\dev\repos\acc-website\.docusign\docusign-private.key`
7. Add to `.env.local`:
   ```
   DOCUSIGN_INTEGRATION_KEY=...
   DOCUSIGN_USER_ID=...
   DOCUSIGN_ACCOUNT_ID=...
   DOCUSIGN_PRIVATE_KEY_PATH=.docusign/docusign-private.key
   DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
   DOCUSIGN_HMAC_KEY=...
   ```
8. Restart the dev server. The webhook endpoint will flip from 503 → live.
9. Tell me "DocuSign provisioned" — I'll wire the envelope-create call (combine quote + drawings + disclosure → send for signature).

When you're ready to go to production, swap `DOCUSIGN_BASE_PATH` to `https://account-d.docusign.com/restapi` (or `https://account.docusign.com/restapi` for the prod boundary).

---

### 8. Buy `accspec.net` on Cloudflare
**Time:** 5 min
**Why:** Launch domain. $11.86 — already validated availability earlier.

**Steps:**
1. Go to https://dash.cloudflare.com/?to=/:account/domains/registration/purchase
2. Search `accspec.net`.
3. Click Purchase.
4. Tell me "domain bought" — I'll move on to wiring the tunnel.

**Note:** I cannot make this purchase for you (financial transaction
prohibited). You have to physically click it.

---

### 9. Install Cloudflare Tunnel on advserver
**Time:** 10 min
**Why:** Routes accspec.net → your dev server.

**Steps (PowerShell as Admin on advserver):**
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login          # opens browser; pick your CF account
cloudflared tunnel create acc-spec
cloudflared tunnel route dns acc-spec accspec.net
```

Then create a config file at `C:\Users\<you>\.cloudflared\config.yml`:
```yaml
tunnel: acc-spec
credentials-file: C:\Users\<you>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: accspec.net
    service: http://localhost:3000
  - service: http_status:404
```

Then:
```powershell
cloudflared service install
```

That installs it as a Windows service so it survives reboots. Verify:
```powershell
Get-Service cloudflared
```
Should show "Running". Tell me "tunnel up" and I'll test.

---

### 10. Run production build on advserver (when ready to launch)
**Time:** 5 min
**Why:** Dev server is fine for testing but production build is what
runs at accspec.net.

**Steps (PowerShell):**
```powershell
cd C:\dev\repos\acc-website
npm run build
npx next start --port 3000
```

Leave the terminal open. Or use `pm2` / Windows Task Scheduler later
to make it persistent. I'll write a launch script when you're ready.

---

## Lower-priority — answer when you can

- **Tafisa color list per line** (Alto, Crystalite, Isola, Karisma, Smoothwood,
  Urbania, Brava, Feria, Viva, Materia). Easiest: phone photo of fan deck pages,
  or rep PDF.
- **Stevenswood full catalog beyond ~25** — landing-page-load-more issue.
  Their rep can email you a CSV.
- **Real builder defaults** for Atlas, Bush Legacy, Premier, Stancraft,
  Cobalt, Bar 17, RSB Customs. Per builder, just answer:
  - Carcass usually? (Hardrock Maple PB / PF Ply Maple / PF Ply Birch)
  - Drawer box usually? (Doweled Butt-Joint / Buy-out Dovetail)
  - Pull most-typical? (Bar 3in / Cup / Edge / etc.)
  - Accessories standard? (Trash + rollouts + lazy susan, etc.)
- **ML Campbell Cabinetcoat color codes** — I added 4 placeholder rows
  (CC-WHITE, CC-XW, CC-LINEN, CC-BLACK). When you're near a fan deck, send
  the real codes/names.

---

## Things I (Claude) am taking off your plate

- ~~Rotate password from `1234`~~ → `Summer2026!` via `node scripts/rotate-admin-pw.mjs "Summer2026!"` — script is ready, you run when ready.
- ~~Confirm `EXPRESS_ENABLED=false`~~ — verified, set in `.env.local`.
- ~~`.gitignore` excludes EXAMPLE DRAWINGS~~ — done.
- ~~Cab Door inside profiles + panels + edges + mitres + presets~~ — auto-extracted.
- ~~Egger TFL list~~ — ingested 69 decors from your map (replaces 4-row stub).
- ~~Self-test harness~~ — `npm run selftest` for green/red regression check.
- ~~Dev server start/restart script~~ — `scripts/dev-restart.ps1` and `.bat`.

If you give me a Cloudflare API token (Account-level: Cloudflare Tunnel Edit,
Zone DNS Edit) and a Supabase access token, I can do most of the launch wiring
too — drop them as a comment and I'll route through the APIs.

---

## TFL OCR — verify these when you get a sec

I ingested the photos at `data/catalogs/sources/tfl-samples/` (43 new rows: 15 Stevenswood + 28 TruNorth). A handful of names need your eyes:

- **G92 "Drift Loud"** — the sticker reads "Drift Loud" but I'd guess this is meant to be "Drift Wood." Look at G92 in person and let me know which is right; I'll batch-update both Stevenswood and TruNorth rows.
- **529 "Takase Teak" (TruNorth)** — the TruNorth sticker for code 529 is hard to read in the photo. I matched the name to Stevenswood's 529 (Takase Teak) on the assumption they're the same decor across suppliers. Possible alternatives I considered: "Pearl Teak", "Naval Teak". Confirm.
- **174 Black** — Stevenswood sticker had "174" hand-written next to a small dark patch, but the printed sticker showed something else (struck through). I went with 174 Black/ARTIKA based on TruNorth's matching sticker. Confirm the Stevenswood code is also 174.
- **Yellowstone Oak** and **Cascadia Rift** (TruNorth photo 2, separate samples) — no codes were visible in the photo so I left them out. If those are real ACC-stocked decors, send their sticker codes and I'll add them.

Also: I notice many decors appear in BOTH Stevenswood and TruNorth catalogs with the same code. If that's intentional (e.g. ACC sells the same color through whichever supplier delivers fastest), the spec form will show both options. If that's not the case (e.g. ACC switched suppliers and those Stevenswood rows are stale), tell me which supplier won and I'll prune the loser.
