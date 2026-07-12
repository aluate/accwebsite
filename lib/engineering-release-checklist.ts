/**
 * Engineering Release Checklist — RC-30-01C
 * Residential Sales / Design Team gate before releasing to engineering.
 * ALL items must be checked before the release email can be sent.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  note?: string;
}

export interface ChecklistSection {
  id: string;
  label: string;
  items: ChecklistItem[];
}

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "drawings",
    label: "1. Drawings & Client Approvals",
    items: [
      { key: "drawings_complete",       label: "Drawings 100% complete, updated, and approved by client", note: "Includes 100% field dimensions" },
      { key: "color_samples_signed",    label: "All color selection samples complete and signed off by client" },
      { key: "selections_finalized",    label: "All selections finalized and signed off by client" },
      { key: "appliance_sink_verified", label: "Appliance and sink specs reviewed and verified by PM" },
      { key: "flooring_in_drawings",    label: "Flooring verified and communicated in drawings" },
    ],
  },
  {
    id: "spec_scope",
    label: "2. Spec Sheet — Scope",
    items: [
      { key: "rooms_listed", label: "Rooms covered under the fixture / material for this WO spec are listed" },
    ],
  },
  {
    id: "spec_materials",
    label: "2. Spec Sheet — Interior / Exterior Materials",
    items: [
      { key: "interior_material", label: "Interior material specified", note: "Typical: Hardrock Maple Melamine, Prefinished Maple Ply" },
      { key: "exterior_material", label: "Exterior material specified", note: "Typically: Melamine flavor or veneer species" },
    ],
  },
  {
    id: "spec_door_styles",
    label: "2. Spec Sheet — Door / Drawer Front / End Panel Styles",
    items: [
      { key: "slab_grain",            label: "Slab — grain orientation noted" },
      { key: "cabinet_edge_details",  label: "Cabinet spec with edge details" },
    ],
  },
  {
    id: "spec_drawer",
    label: "2. Spec Sheet — Drawer Box / Roll-Out",
    items: [
      { key: "drawer_style_material", label: "Style and material specified", note: "Typical: Prefinished Maple Ply; dovetail construction" },
    ],
  },
  {
    id: "spec_finish",
    label: "2. Spec Sheet — Finish",
    items: [
      { key: "stain_paint",  label: "Stain / Paint specified" },
      { key: "finish_spec",  label: "Finish specified" },
      { key: "sheen_spec",   label: "Sheen specified" },
    ],
  },
  {
    id: "spec_edge_banding",
    label: "2. Spec Sheet — Edge Banding",
    items: [
      { key: "interior_banding", label: "Interior banding noted", note: "Adj shelves, bottoms of upper, unfinished ends — typically matches box material" },
      { key: "exterior_banding", label: "Exterior banding noted", note: "Top edges, door edges, finished end panels — PVC match; if PVC, correct ESI spec number/name" },
      { key: "drawer_banding",   label: "Drawer Box / Roll-Out banding noted", note: "Typically prefinished Maple" },
    ],
  },
  {
    id: "spec_pulls",
    label: "2. Spec Sheet — Pulls",
    items: [
      { key: "pulls_brand",  label: "Brand / Spec" },
      { key: "pulls_size",   label: "Size" },
      { key: "pulls_finish", label: "Finish" },
      { key: "pulls_qty",    label: "Quantity", note: "Engineering verifies qty when ordering" },
    ],
  },
  {
    id: "spec_wo_hardware",
    label: "2. Spec Sheet — WO Hardware",
    items: [
      { key: "hinges",        label: "Hinges specified", note: "Typical: Blum 110° with 0mm plates; engineering will order blind / bi-fold hinges as needed" },
      { key: "drawer_guides", label: "Drawer / Roll-Out guides specified", note: "Under mount, side mount, soft close" },
      { key: "aventos",       label: "Blum Aventos noted if used" },
    ],
  },
  {
    id: "spec_misc_hardware",
    label: "2. Spec Sheet — Misc Hardware",
    items: [
      { key: "closet_rods",      label: "Closet rods / ends", note: 'Typical: Futaba 1-1/16" or special spec' },
      { key: "rev_a_shelf",      label: "Rev-a-Shelf items with spec number & quantity" },
      { key: "aksel_brackets",   label: "Aksel HD Floating shelf bracket quantity" },
      { key: "locking_drawers",  label: "Locking Drawers" },
      { key: "docking_drawers",  label: "Docking Drawers" },
      { key: "pocket_doors",     label: "Pocket door systems" },
      { key: "glass_inserts",    label: "Glass inserts", note: "Type: clear, seedy, reeded, etc." },
      { key: "led_channel",      label: "LED channel if used", note: "Typical spec / custom client spec" },
    ],
  },
  {
    id: "spec_moldings",
    label: "2. Spec Sheet — Moldings (with Linear Footage & Material Designation)",
    items: [
      { key: "toe_skin",   label: "Toe skin" },
      { key: "fillers",    label: "Fillers" },
      { key: "light_rail", label: "Light rail" },
      { key: "crown",      label: "Crown — size if L-shaped, M/W spec if ran molding" },
    ],
  },
  {
    id: "appliances",
    label: "3. Appliance Specs",
    items: [
      { key: "flush_vs_standard",        label: "Flush vs. standard installation specified" },
      { key: "box_width_correct",        label: "Cabinet box width is correct to accommodate flush / standard installation" },
      { key: "cabinet_depths",           label: "Cabinet depths accommodate appliance and front, along with manufacturer requirements", note: "Electrical, venting, gas line, etc." },
      { key: "appliance_specs_drawings", label: "Correct appliance specs noted on drawings at their locations" },
    ],
  },
  {
    id: "countertops",
    label: "4. Countertop Info",
    items: [
      { key: "top_thickness_by_others", label: "Thickness noted if tops are by others", note: "This dictates cabinet heights that sit on the countertop and upper spacing" },
      { key: "top_thickness_inhouse",   label: "Thickness and style noted if tops are in-house", note: 'e.g., 1-1/2" veneer top with solid edge' },
      { key: "overhang_verified",       label: "Counter overhang laminates into end panels — verified" },
    ],
  },
  {
    id: "material_limits",
    label: "5. Material Limitations",
    items: [
      { key: "sheet_sizes_ok",               label: "Material sheet sizes accommodate panel and cabinet heights", note: 'e.g., 3/4" wd panel vs. 3/4 rib wd will need to be seamed' },
      { key: "seam_locations_communicated",  label: "If client is committed to a material only available in 8’, client has been informed of seam locations" },
    ],
  },
  {
    id: "project_setup",
    label: "6. Project Setup",
    items: [
      { key: "job_number_confirmed", label: "Job number assigned (ACC-YYYY-NNNN)", note: "Auto-verified when job number is set on the job" },
      { key: "snappak_setup",      label: "SnapPak set up correctly with correct milestones" },
      { key: "ship_date_known",    label: "Ship date confirmed to the best of our knowledge" },
      { key: "project_folder",     label: "Project folder set up and in place" },
      { key: "cv_file_structure",  label: "CV file structure / folders accurate — archived as needed" },
      { key: "field_video",        label: "Field dimension video uploaded in folder" },
    ],
  },
  {
    id: "release_email",
    label: "7. Release Email Contents",
    items: [
      { key: "drawings_attached",   label: "Approved PDF drawings uploaded below and will be attached" },
      { key: "installer_stated",    label: "Who is installing — noted in release message below" },
      { key: "ship_date_in_msg",    label: "Ship date confirmed in release message below" },
      { key: "other_details_noted", label: "Any other relevant details included in release message below" },
    ],
  },
];

/** Flat list of all item keys — used to validate completeness. */
export function allKeys(): string[] {
  return CHECKLIST_SECTIONS.flatMap((s) => s.items.map((i) => i.key));
}

/** Returns true if every item in the checklist is checked. */
export function isComplete(state: Record<string, boolean>): boolean {
  return allKeys().every((k) => state[k] === true);
}

/** How many items are checked vs. total. */
export function completionCount(state: Record<string, boolean>): { checked: number; total: number } {
  const keys = allKeys();
  return { checked: keys.filter((k) => !!state[k]).length, total: keys.length };
}
