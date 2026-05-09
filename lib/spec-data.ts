import sql from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import type { SpecPDFData, FinishGroupView, RoomView, AccessoryRollupRow, MoldingRollupRow } from "@/lib/pdf-spec";

type SpecRow = { id: string; job_id: string; name: string; status: string };
type JobRow = { id: string; client_name: string; client_email: string | null; builder_name: string | null; builder_company: string | null; pm: string | null; site_address: string; city: string | null; delivery_date: string | null; notes_install: string | null; notes_finishing: string | null; notes_shop: string | null; notes_client: string | null };
type FGRow = { id: string; label: string; finish_type: string; notes: string | null; stain_id: string | null; paint_id: string | null; glaze_id: string | null; topcoat_id: string | null; sheen_id: string | null };
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

  const fgs = await sql<FGRow[]>`SELECT * FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order`;
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
  const edgebandIdx=new Map(catalogs.edgebands().map(e=>[e.id,e.product_name]));
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

  const fgViews: FinishGroupView[] = fgs.map((g) => ({
    id:g.id, label:g.label, finish_type:g.finish_type, notes:g.notes??"",
    finish:{stain_name:g.stain_id?(stainIdx.get(g.stain_id)??g.stain_id):"",paint_name:g.paint_id?(paintIdx.get(g.paint_id)??g.paint_id):"",glaze_name:g.glaze_id?(glazeIdx.get(g.glaze_id)??g.glaze_id):"",topcoat_name:g.topcoat_id?(topcoatIdx.get(g.topcoat_id)??g.topcoat_id):"",sheen_name:g.sheen_id?(sheenIdx.get(g.sheen_id)??g.sheen_id):""},
    materials:materials.filter(m=>m.finish_group_id===g.id).map(m=>({role:m.role,role_label:MATERIAL_ROLE_LABEL[m.role]??m.role,name:m.material_id?(carcassIdx.get(m.material_id)??m.material_id):"",where_used:m.where_used??"",notes:m.notes??""})),
    door_fronts:doorFronts.filter(d=>d.finish_group_id===g.id).map(d=>({role:d.role,role_label:DOOR_FRONT_ROLE_LABEL[d.role]??d.role,slot_label:d.slot_label??"",style_name:d.style_id?(doorStyleIdx.get(d.style_id)??d.style_id):"",material_name:d.material_id?(doorMatIdx.get(d.material_id)??d.material_id):"",oe_name:d.oe_id?(cabdoorEdgeIdx.get(d.oe_id)??d.oe_id):"",ie_name:d.ie_id?(cabdoorInsideIdx.get(d.ie_id)??d.ie_id):"",panel_name:d.panel_id?(cabdoorPanelIdx.get(d.panel_id)??d.panel_id):"",grain:d.grain??"",vendor:d.vendor??"",notes:d.notes??""})),
    drawers:drawers.filter(d=>d.finish_group_id===g.id).map(d=>({role:d.role,role_label:DRAWER_ROLE_LABEL[d.role]??d.role,slot_label:d.slot_label??"",drawer_box_name:d.drawer_box_id?(drawerBoxIdx.get(d.drawer_box_id)??d.drawer_box_id):"",slides_name:d.slides_id?(drawerSlideIdx.get(d.slides_id)??d.slides_id):"",notes:d.notes??""})),
    edgebands:edgebands.filter(e=>e.finish_group_id===g.id).map(e=>({code:e.code,edgeband_name:e.edgeband_id?(edgebandIdx.get(e.edgeband_id)??e.edgeband_id):"",where_used_label:e.where_used?(EDGEBAND_WHERE_USED_LABEL[e.where_used]??e.where_used):"",notes:e.notes??""})),
    hardware:hardware.filter(h=>h.finish_group_id===g.id).map(h=>({role:h.role,role_label:HW_ROLE_LABEL[h.role]??h.role,slot_label:h.slot_label??"",hardware_name:hardwareName(h.role,h.hardware_id),brand:hardwareBrand(h.role,h.hardware_id),qty:h.qty,location:h.location??"",vendor:h.vendor??"",notes:h.notes??""})),
    countertops:countertops.filter(c=>c.finish_group_id===g.id).map(c=>({location:c.location??"",style_name:c.style_id?(ctopStyleIdx.get(c.style_id)??c.style_id):"",edge_name:c.edge_id?(ctopEdgeIdx.get(c.edge_id)??c.edge_id):"",splash_style:c.splash_style??"",splash_edge_name:c.splash_edge_id?(ctopEdgeIdx.get(c.splash_edge_id)??c.splash_edge_id):"",material_name:c.material_id?(ctopMatIdx.get(c.material_id)??c.material_id):"",buildup_in:c.buildup_in,core_substrate:c.core_substrate??"",brackets:c.brackets??"",notes:c.notes??""})),
    moldings:moldings.filter(m=>m.finish_group_id===g.id).map(m=>({molding_type:m.molding_type,type_label:MOLDING_TYPE_LABEL[m.molding_type]??m.molding_type,profile_name:m.molding_profile_id?(moldingProfIdx.get(m.molding_profile_id)??m.molding_profile_id):"",size_in:m.size_in,material_name:m.material_id?(moldingMatIdx.get(m.material_id)??m.material_id):"",qty_lf:m.qty_lf,where_used:moldingRooms.filter(mr=>mr.molding_id===m.id).map(mr=>roomNameIdx.get(mr.room_id)??mr.room_id),notes:m.notes??""})),
  }));

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

  return{job_id:spec.job_id,spec_name:spec.name,generated_at:new Date().toISOString(),client_name:job.client_name,client_email:job.client_email,builder_name:job.builder_name,builder_company:job.builder_company,pm:job.pm,site_address:job.site_address,city:job.city,delivery_date:job.delivery_date,notes_install:job.notes_install,notes_finishing:job.notes_finishing,notes_shop:job.notes_shop,notes_client:job.notes_client,finish_groups:fgViews,rooms:roomViews,accessories_rollup,moldings_rollup};
}
