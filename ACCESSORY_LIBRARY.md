# Accessory Library — Build Tracker

> **Mode: MAPPING / DESIGN — nothing pushed to prod yet.**
> Update this file at the start and end of every session so we don't step on our own toes.

---

## Session log

| Date | What happened |
|---|---|
| 2026-07-14 | Audit of existing code. Design decisions made. Mockup built. Awaiting Karl sign-off before touching code. |

---

## Design decisions (locked)

| # | Decision | Notes |
|---|---|---|
| 1 | Accessories live **per-room only** | Spec-level freeform section (`specAccs`) removed later — Phase 2 |
| 2 | Flow: **Type → Cabinet Size → Item Name → (auto: SKU + image)** | Conditional: Handed dropdown only if item requires it |
| 3 | Type groupings map to `category` in CSV (see table below) | Display labels shown to PM; internal CSV category used in code |
| 4 | `accessories_reva.csv` is the source of truth | Human-editable in Excel; no hard-coded enums in TS |
| 5 | Images: `image_url` column added to CSV | Relative path `/accessories/{id}.jpg` → hosted in `/public/accessories/`; Karl populates manually or from RAS catalog |
| 6 | Size dropdown values come from `width_options_in` in CSV | Semicolon-delimited; parsed at runtime |

---

## Type groupings

| Display label (PM sees) | CSV `category` value | Example items |
|---|---|---|
| Trash pullout | `trash` | Double 27qt (15"), Double 35qt (18"/21"), Single 35qt (15") |
| Rollout shelf | `rollout` | Single Rollout Tray, Double Stacked, Full-Extension Shelf |
| Corner / lazy susan | `lazy_susan` | Full Round, Kidney (handed), Pie Cut (handed) |
| Door mount | `door_storage` | Spice Rack, Tray Divider |
| Drawer organizer | `drawer` | Peg Drawer, Knife Block, Utensil Divider |
| Pantry | `pantry` | Pantry Pull-Out Frame |
| Specialty | `specialty` | Cookware Org, Filler Pull-Out, Hamper |
| Custom | `other` | Other / Custom — free text notes field |

---

## What needs to be built

### 1. CSV changes (`data/catalogs/accessories_reva.csv`)

Add two columns:

| Column | Type | Notes |
|---|---|---|
| `image_url` | TEXT | e.g. `/accessories/ACC-022.jpg`; blank = show placeholder in UI |
| `type_label` | TEXT | Display label from table above (could derive from `category` in code instead) |

Clean up existing data:
- ACC-012 (Cookware Org) — SKU `RCPO` unverified; needs RAS catalog check
- ACC-015 (Utensil Divider) — SKU `4FSDB` unverified; needs catalog check
- ACC-018 (Filler Pull-Out) — SKU `BCFPO` unverified; needs catalog check
- ACC-004/005/006/021 — RETIRED; prune or keep with `retired: true` column?

### 2. DB migration (`scripts/db-push.mjs`)

Current `room_accessories` schema:
```sql
id TEXT, room_id TEXT, acc_id TEXT, qty INTEGER, notes TEXT
```

Add two columns:
```sql
ALTER TABLE room_accessories ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE room_accessories ADD COLUMN IF NOT EXISTS handed TEXT DEFAULT 'N/A';
```

### 3. Component changes (`components/ResidentialSpecClient.tsx`)

- Room state type: add `size?: string` and `handed?: string` to the accessory item type
- Replace flat `<select>` picker with 3-step picker:
  1. Type `<select>` (from type group list)
  2. Cabinet size `<select>` (filtered from `width_options_in` for chosen type)
  3. Item name `<select>` (filtered by type + size)
  4. Auto-fill display: name, brand, SKU, image preview, warning badge if unverified
  5. Conditional: handed `<select>` if `item.hand` is truthy in CSV
  6. Qty `<input type="number">`
  7. Notes (optional free text)
- Pass `size` and `handed` through `updateAccessory()`

### 4. Save API (`app/api/specs/[id]/rooms` or wherever room_accessories is written)

- Find the INSERT/UPDATE for `room_accessories`
- Add `size` and `handed` fields to the write path

### 5. Spec PDF output

- Accessories section currently shows: `{name} · qty {qty}`
- Update to: `{name} · {size}" cab · {handed if applicable} · qty {qty}`

---

## Open questions — need Karl to answer before building

| # | Question | Status |
|---|---|---|
| Q1 | Image strategy — host in `/public/accessories/`, Supabase Storage, or just link to RAS website URLs? | **OPEN** |
| Q2 | WARNING SKUs (ACC-012, ACC-015, ACC-018) — verify with RAS catalog or remove those items for now? | **OPEN** |
| Q3 | RETIRED rows (ACC-004/005/006/021) — prune entirely or keep with a `retired` flag column? | **OPEN** |
| Q4 | For Corner/Lazy Susan, "size" = corner opening diameter. Label changes to "Opening size" for that type? | **OPEN** |
| Q5 | Do you want per-room accessory defaults? (e.g., "Kitchen" auto-suggests Trash + 2 Rollouts as a starting point) | **OPEN** |

---

## What's already built vs. what needs building

| Item | Status |
|---|---|
| `accessories_reva.csv` base catalog (25 items) | ✅ Exists — needs `image_url` column |
| Per-room accessory flat dropdown (basic) | ✅ Exists — no size/handed, no image, no SKU display |
| Type → Size → Item 3-step picker | ❌ Not built |
| Image preview | ❌ Not built; no images yet |
| SKU auto-fill display | ❌ Not built |
| Handed dropdown (conditional) | ❌ Not built |
| `room_accessories.size` column | ❌ Not migrated |
| `room_accessories.handed` column | ❌ Not migrated |
| Spec-level accessories removal | ❌ Deferred (Phase 2) |
| PDF output updated for size/handed | ❌ Not built |

---

## Files touched when we build

- `data/catalogs/accessories_reva.csv` — add columns, clean data
- `scripts/db-push.mjs` — add 2 ALTER TABLE statements
- `components/ResidentialSpecClient.tsx` — replace accessory UI block
- `app/api/specs/[id]/rooms/route.ts` (or equivalent) — add size/handed to write
- PDF renderer — update accessories line format


---

## Session 2 — 2026-07-14 (continued)

### Decisions made this session

| # | Decision |
|---|---|
| 6 | Images: `image_url` column added to CSV as `/accessories/{id}.webp`. Files don't exist yet — UI shows placeholder. Scrape script planned (see below). |
| 7 | Prices: `price_slp` (list price) + `price_date` columns added. Populated for trash items (confirmed) and new items found on RAS site. |
| 8 | Retired rows pruned from CSV — see pruned log below. |
| 9 | ACC-012 (RCPO) corrected → `ACC-026` — Two-Tier Cookware Organizer, series `5CW2`. RCPO does not exist on RAS site. |
| 10 | ACC-018 (BCFPO) corrected → `ACC-027` — Base Cabinet Filler Pull-Out, series `432-BF`. BCFPO does not exist on RAS site. IDs kept sequential; old IDs retired. |
| 11 | Two new corner categories added: `blind_corner` (base) and `lazy_susan_wall` (upper/wall). |
| 12 | Blind corner ≠ lazy susan. Split into separate type groups in picker. |
| 13 | ACC-015 (4FSDB utensil divider) — NOT confirmed on RAS site during this session. Left in CSV with warning note. Needs manual RAS catalog check. |
| 14 | Builder defaults for accessories (e.g., kitchen always starts with a trash pullout) = set at BUILDER level, not global. Note: update builder defaults section to include accessories by room type when we tackle builder_profiles. Same mechanism as appliance defaults. |

### Type groupings — UPDATED

| Display label | CSV `category` | Notes |
|---|---|---|
| Trash pullout | `trash` | |
| Rollout shelf | `rollout` | |
| Corner / lazy susan (base) | `lazy_susan` | 28–36" diameter base corner cabinets |
| Blind corner optimizer (base) | `blind_corner` | Pull-out/swing systems for blind corner base cabs. Size = face frame opening width. |
| Corner lazy susan (wall) | `lazy_susan_wall` | 18–24" diameter wall corner cabinets — NEW |
| Door mount | `door_storage` | |
| Drawer organizer | `drawer` | |
| Pantry | `pantry` | |
| Specialty | `specialty` | Cookware org, filler pull-out, hamper |
| Custom | `other` | |

### What changed in the CSV this session

**Pruned (removed entirely):**
| ID | Name | Why pruned |
|---|---|---|
| ACC-004 | Pull-Out Trash (Single 35qt) — 4WCSC-1 | Placeholder series code, never matched a real RAS SKU |
| ACC-005 | Pull-Out Trash (Double 35qt+8qt) — 4WCSC-2 | Same — placeholder |
| ACC-006 | Pull-Out Trash (Double 50qt) — 4WCBLS-2 | Same — placeholder |
| ACC-021 | Pull-Out Trash Top Mount Double — 4WCTM | Top mount hardware binds on frameless/euro boxes; no face frame to anchor. Was previous default. |

**Corrected:**
| Old ID | Old series | New ID | New series | What changed |
|---|---|---|---|---|
| ACC-012 | RCPO (doesn't exist) | ACC-026 | 5CW2 | Corrected to real Two-Tier Cookware Organizer. New ID because the product category and dimensions changed. |
| ACC-018 | BCFPO (doesn't exist) | ACC-027 | 432-BF | Corrected to real Base Cabinet Filler Pull-Out. Note: new construction only, won't retrofit. |

**Added:**
| ID | Name | Series | Why |
|---|---|---|---|
| ACC-028 | Blind Corner Optimizer — The Cloud | 5371 | Karl called out missing blind corner pull-outs |
| ACC-029 | Blind Corner Optimizer — Girasolo w/ soft-close | 4WLS87 | Second blind corner option (wood shelves, soft-close pivot) |
| ACC-030 | Lazy Susan — full circle polymer (wall) | 3072 | Karl called out missing upper/wall corner options |
| ACC-031 | Lazy Susan — D-shape wood (wall) | 4WLS272 | Second wall corner option |

**Still unverified (on RAS site):**
- ACC-015: series `4FSDB` (Utensil Divider Kit) — not found during this session; left in with warning

### Planned: image + price scraper

Script to write: `scripts/scrape-reva-accessories.mjs`

Logic:
1. Read `accessories_reva.csv`
2. For each row where `category != 'other'`, search `rev-a-shelf.com` for the series code
3. Pull: product image URL (highest-res), current list price range
4. Download image to `/public/accessories/{id}.webp`
5. Write `price_slp` and `price_date` back to CSV

URL pattern: `https://rev-a-shelf.com/catalogsearch/result/?q={series}`
Image CDN: RAS uses Magento CDN — images are at `https://www.rev-a-shelf.com/media/catalog/product/...`

**Blocker:** RAS site uses Magento with JS rendering — need Chrome (Claude in Chrome) or a headless browser to get real product page content. Plan: use Claude in Chrome session to hit each product category page, extract img src + price, write to CSV. One-time run; re-run when prices need refresh.

### Updated: what's built vs. what needs building

| Item | Status |
|---|---|
| `accessories_reva.csv` — base catalog, corrected | ✅ Done this session |
| `accessories_reva.csv` — `image_url`, `price_slp`, `price_date` columns | ✅ Columns exist; images/prices sparse |
| `accessories_reva.csv` — blind corner + wall corner items | ✅ Added this session |
| `accessories_reva.csv` — ACC-015 (4FSDB) verified | ❌ Still needs RAS catalog check |
| `scripts/scrape-reva-accessories.mjs` (image + price scraper) | ❌ Not built |
| `/public/accessories/` folder with actual images | ❌ Not started |
| Per-room 3-step picker UI (Type → Size → Item) | ❌ Not built |
| `room_accessories.size` + `.handed` DB columns | ❌ Not migrated |
| Builder defaults — accessories by room type | ❌ Future work; tied to builder_profiles |
| Spec-level accessories removal | ❌ Deferred |

---

## Session 3 — 2026-07-14 (continued same day)

### What shipped this session

| Item | Status |
|---|---|
| Admin active/inactive toggle (`/admin/accessories`) | ✅ Built — `AccessoryCatalogAdmin.tsx`, `app/admin/(protected)/accessories/page.tsx` |
| API route `GET/PATCH /api/admin/accessories` | ✅ Built — reads JSON catalog, merges DB active states, upserts toggle |
| `catalog_active_states` table in `db-push.mjs` | ✅ Added — generic pattern reusable for any catalog |
| `room_accessories.size` + `.handed` columns in `db-push.mjs` | ✅ Added (ALTER TABLE IF NOT EXISTS) |
| Filter inactive accessories in spec page | ✅ Built — spec page queries `catalog_active_states`, strips inactive before passing to client |
| Scrape: JSON-LD approach confirmed viable | ✅ Tested in Chrome — `rev-a-shelf.com/{series}-series` pages expose `ProductGroup` JSON-LD with all variants, SKUs, and prices after 2.5s JS render wait |
| `scripts/scrape-reva-accessories.mjs` | ✅ Written — Playwright-based; reads CSV, scrapes by series URL, downloads images to `/public/accessories/`, writes prices + dates back to CSV |
| Updated `RevaAccessory` type in `lib/catalogs.ts` | ✅ Includes `image_url`, `price_slp`, `price_date`, `hand` |
| `/admin` index link for accessories | ✅ Added |

### What still needs building

| Item | Notes |
|---|---|
| **3-step picker UI** (`ResidentialSpecClient.tsx`) | Type → Size → Item; conditional Handed; SKU display; image preview; free-entry escape hatch. Primary remaining UI task. |
| **Accessories summary table** | Two locations: (1) full spec PDF — all rooms; (2) WO-specific single-spec page — filtered to finish group. Format: type, name, size, SKU, qty, handed. |
| **Save API** — `size` + `handed` fields | Find room_accessories INSERT/UPDATE, add these two fields to write path. |
| **PDF renderer** — update accessories line | Currently shows `{name} · qty {qty}`; update to `{name} · {size}" · {handed if applicable} · qty {qty}`. |
| **Run `node scripts/db-push.mjs`** in prod | Adds `catalog_active_states`, `room_accessories.size`, `room_accessories.handed`. Karl runs this. |
| **Run scrape script** to populate images + prices | `npx playwright install chromium` first (first-time only), then `node scripts/scrape-reva-accessories.mjs`. |
| **ACC-015 (4FSDB) verification** | Utensil divider — series not found on RAS site. Check before spec-ing on a real job. |
| Builder defaults for accessories by room type | Future — tied to builder_profiles; note when we get there. |
| Spec-level accessories removal (`specAccs`) | Phase 2 — not blocking. |

### Session 3 open questions

| # | Question |
|---|---|
| Q1 | Half-moon blind corner options (6842/6881/4WLS882) — add as additional items, or are Cloud + Girasolo enough for now? |

### How to run the scrape (first time)

```bash
cd acc-website
npx playwright install chromium    # downloads ~150MB; one-time
node scripts/scrape-reva-accessories.mjs --dry-run    # preview what will change
node scripts/scrape-reva-accessories.mjs               # write prices + download images
node scripts/sync-catalogs.mjs                         # regenerate JSON from updated CSV
```

To re-run for specific items only:
```bash
node scripts/scrape-reva-accessories.mjs --ids=ACC-001,ACC-007,ACC-010
```
