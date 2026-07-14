import sql from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import type { SpecPDFData, FinishGroupView, RoomView, AccessoryRollupRow, MoldingRollupRow, SpecPullRow, SpecAccessoryRow, SpecHardwareRow, FGPullRow, RoomTrimEntry, ApplianceEntry } from "@/lib/pdf-spec";

type SpecRow = { id: string; job_id: string; name: string; status: string; lifecycle_state: string | null };
type JobRow = { id: string; client_name: string; client_email: string | null; builder_name: string | null; builder_company: string | null; pm: string | null; site_address: string; city: string | null; delivery_date: string | null; notes: string | null; notes_install: string | null; notes_finishing: string | null; notes_shop: string | null; notes_client: string | null };
type FGRow = { id: string; label: string; finish_type: string; notes: string | null; species: string | null; grade: string | null; grain_orientation: string | null; color_id: string | null; color_name: string | null; color_hex: string | null; door_style_id: string | null; pull_id: string | null; carcass_id: string | null; drawer_box_id: string | null; rollout_box_id: string | null; edgeband_id: string | null; applied_panels: string | null; sort_order: number };
type RoomRow = { id: string; name: string; finish_group_id: string | null; notes: string | null };
type RoomFinishRow = { room_id: string; finish_group_id: string; zone: string | null };
type AccRow = { room_id: string; acc_id: string; qty: number };
type MaterialRow = { id: string; finish_group_id: string; role: string; material_id: string | null; where_used: string | null; notes: string | null };
type DoorFrontRow = { id: string; finish_group_id: string; role: string; slot_label: string | null; style_id: string | null; material_id: string | null; oe_id: string | null; ie_id: string | null; panel_id: string | null; grain: string | null; vendor: string | null; notes: string | null; sort_order: number };
type DrawerRow = { id: string; finish_group_id: string; role: string; slot_label: string | null; drawer_box_id: string | null; slides_id: string | null; notes: string | null; sort_order: number };
type EdgebandRow = { id: string; finish_group_id: string; code: string; edgeband_id: string | null; where_used: string | null; notes: string | null; sort_order: number };
type HardwareRow = { id: string; finish_group_id: string; role: string; slot_label: string | null; hardware_id: string | null; qty: number | null; location: string | null; vendor: string | null; notes: string | null; sort_order: number };
type CountertopRow = { id: string; finish_group_id: string; location: string | null; style_id: string | null; edge_id: string | null; splash_style: string | null; splash_edge_id: string | null; material_id: string | null; buildup_in: number | null; core_substrate: string | null; brackets: string | null; notes: string | null; sort_order: number };
type MoldingRow = { id: string; finish_group_id: string; molding_type: string; molding_profile_id: string | null; qty_lf: number | null; notes: string | null; sort_order: number; size_in: number | null; material_id: string | null };
type MoldingRoomRow = { molding_id: string; room_id: string };
type RawPullRow = { id: string; make: string|null; model: string|null; size: string|null; room: string|null; notes: string|null; qty: number };
type DBFGPullRow = { id: string; finish_group_id: string; description: string; part_no: string|null; finish_color: string|null; where_used: string|null; qty: number; sort_order: number };
type DBRoomTrimRow = { id: string; room_id: string; trim_type: string; size_desc: string|null; material: string|null; qty_lf: number; notes: string|null; sort_order: number };
type DBApplianceRow = { id: string; spec_id: string; appliance_type: string; manufacturer: string|null; model_no: string|null; room_id: string|null; notes: string|null; cutout_w: number|null; cutout_h: number|null; cutout_d: number|null; sort_order: number };
type RawAccRow  = { id: string; type: string|null; part_number: string|null; description: string|null; qty: number; handed: string; room: string|null; size: string|null; notes: string|null };
type DBHardwareRow = { id: string; spec_id: string; type: string; part_no: string|null; room: string|null; qty: number; notes: string|null; sort_order: number };

const MATERIAL_ROLE_LABEL: Record<string, string> = { cab_ext:"Cabinet Exterior", cab_int:"Cabinet Interior", cab_ext2:"Cab Exterior 2", cab_int2:"Cab Interior 2" };
const DOOR_FRONT_ROLE_LABEL: Record<string, string> = { base:"Base Doors", upper:"Upper Doors", applied_ends:"Applied Ends", slab_df:"Slab DF", "5pc_df":"5 PC DF" };
const DRAWER_ROLE_LABEL: Record<string, string> = { drawer_box:"Drawer Box", rollout:"Rollout" };
const HW_ROLE_LABEL: Record<string, string> = { hinges:"Hinges", drawer_slides:"Drawer Slides", rollout_slides:"Rollout Slides", closet_rod:"Closet Rod", trash_pullout:"Trash Pullout", base_pullout:"Base Pullout", blind_corner:"Blind Corner", shelf_clips:"Shelf Clips", door_pulls:"Door Pulls", drawer_pulls:"Drawer Pulls", misc:"Misc." };
const MOLDING_TYPE_LABEL: Record<string, string> = { toe_skin:"Toe Skin", filler_1:"Filler 1", filler_2:"Filler 2", crown_1:"Crown 1", crown_2:"Crown 2", crown_nailer:"Crown Nailer", light_rail:"Light Rail", shelf_cleating:"Shelf Cleating", base_shoe:"Base Shoe", scribe:"Scribe Molding", base:"Base" };
const EDGEBAND_WHERE_USED_LABEL: Record<string, string> = { applied_ends_doors_dwr_fronts:"Applied Ends / Doors & Drawer Fronts", cabinet_body_parts:"Cabinet Body Parts", adjustable_shelves:"Adjustable Shelves", bottom_upper_fe:"Bottom of Upper F.E.", bottom_upper_unfe:"Bottom of Upper Un-F.E.", drawer_box_sides:"Drawer Box Sides", drawer_box_front_back:"Drawer Box Front/Back", misc:"Misc — see notes" };

export class SpecDataError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function loadSpecPDFData(specId: string): Promise<SpecPDFData> {
  const specRows = await sql<SpecRow[]>`SELECT * FROM residential_specs WHERE id = ${specId}`;
  const spec = specRows[0]; if (!spec) throw new SpecDataError("Spec not found", 404);
  const jobRows = await sql<JobRow[]>`SELECT * FROM jobs WHERE id = ${spec.job_id}`;
  const job = jobRows[0]; if (!job) throw new SpecDataError("Job not found", 404);

  const fgs = await sql<FGRow[]>`
    SELECT fg.*, pc.hex_value AS color_hex
    FROM finish_groups fg
    LEFT JOIN paint_colors pc ON pc.code = fg.color_id
    WHERE fg.spec_id = ${specId}
    ORDER BY fg.sort_order
  `;
  const fgIds = fgs.map((g) => g.id);
  const rooms = await sql<RoomRow[]>`SELECT * FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order`;
  const roomIds = (rooms as RoomRow[]).map((r) => r.id);

  const materials   = fgIds.length ? await sql<MaterialRow[]>  `SELECT * FROM finish_group_materials   WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, role`      : [] as MaterialRow[];
  const doorFronts  = fgIds.length ? await sql<DoorFrontRow[]> `SELECT * FROM finish_group_door_fronts WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as DoorFrontRow[];
  const drawers     = fgIds.length ? await sql<DrawerRow[]>    `SELECT * FROM finish_group_drawers     WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as DrawerRow[];
  const edgebands   = fgIds.length ? await sql<EdgebandRow[]>  `SELECT * FROM finish_group_edgebands   WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as EdgebandRow[];
  const hardware    = fgIds.length ? await sql<HardwareRow[]>  `SELECT * FROM finish_group_hardware    WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as HardwareRow[];
  const countertops = fgIds.length ? await sql<CountertopRow[]>`SELECT * FROM finish_group_countertops WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as CountertopRow[];
  const moldings    = fgIds.length ? await sql<MoldingRow[]>   `SELECT * FROM finish_moldings          WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : [] as MoldingRow[];
  const mIds = moldings.map((m) => m.id);
  const moldingRooms = mIds.length ? await sql<MoldingRoomRow[]>`SELECT * FROM finish_molding_rooms WHERE molding_id IN ${sql(mIds)}` : [] as MoldingRoomRow[];
  const rfs  = roomIds.length ? await sql<RoomFinishRow[]>`SELECT * FROM room_finishes    WHERE room_id IN ${sql(roomIds)}` : [] as RoomFinishRow[];
  const accs = roomIds.length ? await sql<AccRow[]>        `SELECT * FROM room_accessories WHERE room_id IN ${sql(roomIds)}` : [] as AccRow[];

  const carcassIdx=new Map(catalogs.carcassMaterials().map(c=>[c.id,c.name]));
  const drawerBoxIdx=new Map(catalogs.drawerBoxes().map(d=>[d.id,d.name]));
  const edgebandIdx=new Map(catalogs.edgebands().map(e=>[e.id,{name:e.product_name,supplier:e.supplier,thickness:e.thickness_mm??""}]));
  const doorStyleIdx=new Map(catalogs.doorStyles().map(d=>[d.id,d.name]));
  const accIdx=new Map(catalogs.revaAccessories().map(a=>[a.id,{name:a.name,brand:a.brand}]));
  const moldingProfIdx=new Map(catalogs.moldingProfiles().map(p=>[p.id,p.name]));
  const moldingMatIdx=new Map(catalogs.moldingMaterials().map(m=>[m.id,m.name]));
  const sheenIdx=new Map(catalogs.sheens().map(s=>[s.id,s.name]));
  const drawerSlideIdx=new Map(catalogs.drawerSlides().map(s=>[s.id,s.name]));
  const glazeIdx=new Map(catalogs.glazes().map(g=>[g.id,g.name]));
  const topcoatIdx=new Map(catalogs.topcoats().map(t=>[t.id,t.name]));
  const doorMatIdx=new Map(catalogs.doorMaterials().map(m=>[m.id,m.name]));
  const cabdoorEdgeIdx=new Map(catalogs.cabDoorEdgeDetails().map(e=>[e.id,e.name]));
  const cabdoorInsideIdx=new Map(catalogs.cabDoorInsideProfiles().map(i=>[i.id,i.id]));
  const cabdoorPanelIdx=new Map(catalogs.cabDoorPanels().map(p=>[p.id,p.id]));
  const paintIdx=new Map(catalogs.paintColors().map(p=>[p.id,p.name]));
  const stainIdx=new Map(catalogs.stainColors().map(s=>[s.id,s.name]));
  const ctopStyleIdx=new Map(catalogs.countertopStyles().map(s=>[s.id,s.name]));
  const ctopEdgeIdx=new Map(catalogs.countertopEdges().map(e=>[e.id,e.name]));
  const ctopMatIdx=new Map(catalogs.countertopMaterials().map(m=>[m.id,m.name]));
  const roomNameIdx=new Map(rooms.map(r=>[r.id,r.name]));

  function hardwareName(role:string,id:string|null):string{if(!id)return"";const cat=catalogs.hardwareByRole(role);const row=cat.find(r=>r.id===id);return row?String(row.name??""):"";}
  function hardwareBrand(role:string,id:string|null):string{if(!id)return"";const cat=catalogs.hardwareByRole(role);const row=cat.find(r=>r.id===id);return row?String(row.brand??""):"";}

  // Build edgeband code map from finish_group_edgebands table rows (preferred — carries where_used).
  // Fall back to flat finish_groups.edgeband_id for FGs with no table rows.
  const ebCodeMap = new Map<string, string>(); // edgeband_id → code
  let ebCounter = 0;
  // Seed from table rows first (preserves insertion order per spec)
  for (const eb of edgebands) {
    if (eb.edgeband_id && !ebCodeMap.has(eb.edgeband_id)) {
      ebCodeMap.set(eb.edgeband_id, `EB${++ebCounter}`);
    }
  }
  // Then seed any flat-column IDs not yet covered
  for (const g of fgs) {
    if (g.edgeband_id && !ebCodeMap.has(g.edgeband_id)) {
      ebCodeMap.set(g.edgeband_id, `EB${++ebCounter}`);
    }
  }
  // Group finish_group_edgebands rows by FG id
  const ebRowsByFG = new Map<string, EdgebandRow[]>();
  for (const eb of edgebands) {
    const arr = ebRowsByFG.get(eb.finish_group_id) ?? [];
    arr.push(eb);
    ebRowsByFG.set(eb.finish_group_id, arr);
  }

  const fgViews: FinishGroupView[] = fgs.map((g) => {
    // Color display: use stored color_name directly (handles both catalog and custom)
    const colorName = g.color_name ?? "";
    const isStain = g.finish_type === "stain";
    const carcassName = g.carcass_id ? (carcassIdx.get(g.carcass_id) ?? g.carcass_id) : "";
    const doorName = g.door_style_id ? (doorStyleIdx.get(g.door_style_id) ?? g.door_style_id) : "";
    const drawerBoxName = g.drawer_box_id ? (drawerBoxIdx.get(g.drawer_box_id) ?? g.drawer_box_id) : "";
    const rolloutBoxName = g.rollout_box_id ? (drawerBoxIdx.get(g.rollout_box_id) ?? g.rollout_box_id) : "";

    // Build edgebands from table rows (with where_used_label). Fall back to flat column if no rows.
    const tableEbs = ebRowsByFG.get(g.id) ?? [];
    let ebEntries: FinishGroupView["edgebands"];
    if (tableEbs.length > 0) {
      ebEntries = tableEbs.map((eb) => {
        const id = eb.edgeband_id ?? "";
        const code = eb.code; // letter code (D/E/V/U/I/B/C/X) — use directly
        // Resolve edgeband product name from sentinel or custom free-entry fields
        let edgebandName = "";
        let supplier = "";
        let thickness = "";
        if (id === "paint_to_match") {
          edgebandName = "Paint to Match";
        } else if (id === "stain_to_match") {
          edgebandName = "Stain to Match";
        } else if (!id) {
          // Custom free entry: where_used = ### (product number), notes = product name
          const parts = [eb.where_used, eb.notes].filter(Boolean);
          edgebandName = parts.join("  ");
        } else {
          // Legacy catalog ID lookup
          const data = edgebandIdx.get(id);
          edgebandName = data?.name ?? id;
          supplier = data?.supplier ?? "";
          thickness = data?.thickness ?? "";
        }
        const whereUsedLabel = eb.where_used && id !== "paint_to_match" && id !== "stain_to_match" && !id
          ? eb.where_used // for custom: show the ### in the Where Used column
          : (EDGEBAND_WHERE_USED_LABEL[eb.where_used ?? ""] ?? "");
        return { code, edgeband_name: edgebandName, supplier, thickness, where_used_label: "", notes: eb.notes ?? "" };
      });
    } else {
      // Legacy/fallback: flat column only
      const ebData = g.edgeband_id ? edgebandIdx.get(g.edgeband_id) : undefined;
      const ebCode = g.edgeband_id ? (ebCodeMap.get(g.edgeband_id) ?? "") : "";
      ebEntries = ebCode ? [{ code: ebCode, edgeband_name: ebData?.name ?? "", supplier: ebData?.supplier ?? "", thickness: ebData?.thickness ?? "", where_used_label: "", notes: "" }] : [];
    }

    return {
      id: g.id, label: g.label, finish_type: g.finish_type, color_hex: g.color_hex ?? null, notes: g.notes ?? "", species: g.species ?? "", grade: g.grade ?? "", grain_orientation: g.grain_orientation ?? "",
      applied_panels: g.applied_panels ?? null, rollout_box_name: rolloutBoxName,
      finish: {
        stain_name: isStain ? colorName : "",
        paint_name: !isStain ? colorName : "",
        glaze_name: "", topcoat_name: "", sheen_name: "",
      },
      // Populate sub-arrays from flat columns for PDF compat
      materials: carcassName ? [{ role: "cab_ext", role_label: "Carcass", name: carcassName, where_used: "", notes: "" }] : [],
      door_fronts: doorName ? [{ role: "base", role_label: "Base Doors", slot_label: "", style_name: doorName, material_name: "", oe_name: "", ie_name: "", panel_name: "", grain: "", vendor: "", notes: "" }] : [],
      drawers: drawerBoxName ? [{ role: "drawer_box", role_label: "Drawer Box", slot_label: "", drawer_box_name: drawerBoxName, slides_name: "", notes: "" }] : [],
      edgebands: ebEntries,
      hardware: [], countertops: [], moldings: [],
    };
  });

  const fgLabelIdx=new Map(fgViews.map(v=>[v.id,v.label]));
  const roomViews: RoomView[] = rooms.map((r) => {
    const finishes=rfs.filter(f=>f.room_id===r.id).map(f=>({finish_group_id:f.finish_group_id,finish_label:fgLabelIdx.get(f.finish_group_id)??f.finish_group_id,zone:f.zone??""}));
    const seeded=finishes.length===0&&r.finish_group_id?[{finish_group_id:r.finish_group_id,finish_label:fgLabelIdx.get(r.finish_group_id)??r.finish_group_id,zone:""}]:finishes;
    return{id:r.id,name:r.name,notes:r.notes??"",finishes:seeded,accessories:accs.filter(a=>a.room_id===r.id).map(a=>({...(accIdx.get(a.acc_id)??{name:a.acc_id,brand:""}),qty:a.qty}))};
  });

  const accRollupMap=new Map<string,AccessoryRollupRow>();
  for(const r of roomViews)for(const a of r.accessories){const key=`${a.brand}|${a.name}`;const cur=accRollupMap.get(key)??{name:a.name,brand:a.brand,total_qty:0,rooms:[]};cur.total_qty+=a.qty;if(!cur.rooms.includes(r.name))cur.rooms.push(r.name);accRollupMap.set(key,cur);}
  const accessories_rollup=Array.from(accRollupMap.values()).sort((a,b)=>a.name.localeCompare(b.name));

  const mldRollupMap=new Map<string,MoldingRollupRow>();
  for(const fg of fgViews)for(const m of fg.moldings){if(!m.profile_name&&!m.qty_lf&&!m.material_name)continue;const key=`${m.molding_type}|${m.profile_name}|${m.size_in??""}|${m.material_name}`;const cur=mldRollupMap.get(key)??{type_label:m.type_label,profile_name:m.profile_name,size_in:m.size_in,material_name:m.material_name,total_lf:0,finishes:[]};if(typeof m.qty_lf==="number")cur.total_lf+=m.qty_lf;if(!cur.finishes.includes(fg.label))cur.finishes.push(fg.label);mldRollupMap.set(key,cur);}
  const moldings_rollup=Array.from(mldRollupMap.values()).sort((a,b)=>a.type_label.localeCompare(b.type_label)||a.profile_name.localeCompare(b.profile_name));

  // Load spec-level pulls, accessories, hardware (tables may not exist yet on first deploy)
  let spec_pulls: SpecPullRow[] = [];
  let spec_accessories: SpecAccessoryRow[] = [];
  let spec_hardware_list: SpecHardwareRow[] = [];
  let fg_pulls_list: DBFGPullRow[] = [];
  let room_trim_list: DBRoomTrimRow[] = [];
  let db_appliances: DBApplianceRow[] = [];

  try {
    const [pullsRows, accRows, hwRows, fgPullsRows, trimRows, appRows] = await Promise.all([
      sql<RawPullRow[]>`SELECT * FROM spec_pulls WHERE spec_id = ${specId} ORDER BY sort_order`,
      sql<RawAccRow[]>`SELECT * FROM spec_accessories WHERE spec_id = ${specId} ORDER BY sort_order`,
      sql<DBHardwareRow[]>`SELECT * FROM spec_hardware WHERE spec_id = ${specId} ORDER BY sort_order`,
      fgIds.length ? sql<DBFGPullRow[]>`SELECT * FROM finish_group_pulls WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` : Promise.resolve([] as DBFGPullRow[]),
      roomIds.length ? sql<DBRoomTrimRow[]>`SELECT * FROM room_trim WHERE room_id IN ${sql(roomIds)} ORDER BY room_id, sort_order` : Promise.resolve([] as DBRoomTrimRow[]),
      sql<DBApplianceRow[]>`SELECT * FROM spec_appliances WHERE spec_id = ${specId} ORDER BY sort_order`,
    ]);
    spec_pulls = pullsRows.map((r) => ({ id:r.id, make:r.make??"", model:r.model??"", size:r.size??"", room:r.room??"", notes:r.notes??"", qty:r.qty }));
    spec_accessories = accRows.map((r) => ({ id:r.id, type:r.type??"", part_number:r.part_number??"", description:r.description??"", qty:r.qty, handed:r.handed??"N/A", room:r.room??"", size:r.size??"", notes:r.notes??"" }));
    spec_hardware_list = hwRows.map((r) => ({ id:r.id, type:r.type, part_no:r.part_no??"", room:r.room??"", qty:r.qty, notes:r.notes??"" }));
    // Prepend ACC standard hardware defaults. Suppress a default if the spec already has a row
    // of that type (except Closet Rod, which always appears so the PM can fill in details).
    const HW_DEFAULTS: SpecHardwareRow[] = [
      { id:"def-hinge",   type:"Hinge",         part_no:"Blum 110 Int-Soft Close",                room:"", qty:0, notes:"" },
      { id:"def-drawer",  type:"Drawer Guides",  part_no:"Full Extension Soft Close Undermount",  room:"", qty:0, notes:"" },
      { id:"def-rollout", type:"Rollout Guides", part_no:"Full Extension Sidemount",               room:"", qty:0, notes:"" },
      { id:"def-shelf",   type:"Shelf Clips",    part_no:"5mm Nickel",                             room:"", qty:0, notes:"" },
       { id:"def-closet",  type:"Closet Rod",     part_no:"",                                       room:"", qty:0, notes:"" },
    ];
    const specHwTypes = new Set(spec_hardware_list.map(h => h.type.toLowerCase()));
    const activeDefaults = HW_DEFAULTS.filter(d => d.type === "Closet Rod" || !specHwTypes.has(d.type.toLowerCase()));
    spec_hardware_list = [...activeDefaults, ...spec_hardware_list];
    fg_pulls_list = fgPullsRows;
    room_trim_list = trimRows;
    db_appliances = appRows;
  } catch {
    // Tables not yet created — empty arrays, page will be skipped
  }

  // Build keyed maps for PDF
  const finish_group_pulls: Record<string, FGPullRow[]> = {};
  for (const p of fg_pulls_list) {
    if (!finish_group_pulls[p.finish_group_id]) finish_group_pulls[p.finish_group_id] = [];
    finish_group_pulls[p.finish_group_id].push({
      id: p.id, description: p.description, part_no: p.part_no ?? "",
      finish_color: p.finish_color ?? "", where_used: p.where_used ?? "",
      qty: p.qty, sort_order: p.sort_order,
    });
  }

  const room_trim: Record<string, RoomTrimEntry[]> = {};
  for (const t of room_trim_list) {
    if (!room_trim[t.room_id]) room_trim[t.room_id] = [];
    room_trim[t.room_id].push({
      id: t.id, room_id: t.room_id, trim_type: t.trim_type,
      size_desc: t.size_desc ?? "", material: t.material ?? "",
      qty_lf: t.qty_lf, notes: t.notes ?? "", sort_order: t.sort_order,
    });
  }

  const spec_appliances_list: ApplianceEntry[] = db_appliances.map((a) => ({
    id: a.id, appliance_type: a.appliance_type,
    manufacturer: a.manufacturer ?? "", model_no: a.model_no ?? "",
    room_name: a.room_id ? (roomNameIdx.get(a.room_id) ?? "") : "",
    notes: a.notes ?? "",
    cutout_w: a.cutout_w ?? null,
    cutout_h: a.cutout_h ?? null,
    cutout_d: a.cutout_d ?? null,
    sort_order: a.sort_order,
  }));

  return {
    job_id: spec.job_id, spec_name: spec.name,
    generated_at: new Date().toISOString(),
    client_name: job.client_name, client_email: job.client_email,
    builder_name: job.builder_name, builder_company: job.builder_company,
    pm: job.pm, site_address: job.site_address, city: job.city,
    delivery_date: job.delivery_date,
    notes_install: job.notes_install, notes_finishing: job.notes_finishing,
    notes_shop: job.notes_shop, notes_client: job.notes_client,
    job_notes: job.notes ?? null,
    lifecycle_state: spec.lifecycle_state ?? null,
    finish_groups: fgViews, rooms: roomViews,
    accessories_rollup, moldings_rollup,
    spec_pulls, spec_accessories, spec_hardware: spec_hardware_list,
    finish_group_pulls, room_trim, spec_appliances_list,
  };
}
