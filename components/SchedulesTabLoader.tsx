"use client";
/**
 * Lazy-loads catalogs + initial schedules from /api/specs/[id]/schedules-init
 * on first render of the Schedules tab, then mounts SpecSchedulesPanel.
 *
 * Keeps the v2 catalog payload out of the parent props (which already carry
 * a hefty CatalogData object). Single fetch on tab activation; cached for
 * the rest of the session.
 */
import { useEffect, useState } from "react";
import { SpecSchedulesPanel, type ScheduleCatalogs } from "@/components/SpecSchedulesPanel";

type InitResponse = {
  finish_groups: { id: string; label: string; finish_type: string; notes: string | null;
                   stain_id: string | null; paint_id: string | null; glaze_id: string | null;
                   topcoat_id: string | null; sheen_id: string | null; sort_order: number }[];
  schedules: {
    materials: unknown[]; door_fronts: unknown[]; drawers: unknown[];
    edgebands: unknown[]; hardware: unknown[]; countertops: unknown[];
  };
  catalogs: ScheduleCatalogs;
};

export function SchedulesTabLoader({
  specId,
  onRegisterSave,
}: {
  specId: string;
  /**
   * Called once the SpecSchedulesPanel mounts; the panel passes its `save()`
   * function up so the parent's "Save All" button can invoke it. Optional —
   * if omitted, the Schedules tab still saves via its own button.
   */
  onRegisterSave?: (fn: () => Promise<void>) => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data,  setData]  = useState<InitResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/specs/${specId}/schedules-init`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json() as InitResponse;
        if (!cancelled) { setData(json); setState("ready"); }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setState("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [specId]);

  if (state === "loading") {
    return <div className="text-white/40 text-sm py-8">Loading schedules…</div>;
  }
  if (state === "error" || !data) {
    return <div className="text-red-400 text-sm py-8">Failed to load schedules: {error}</div>;
  }
  return (
    <SpecSchedulesPanel
      specId={specId}
      finishGroups={data.finish_groups}
      initial={{
        materials:   data.schedules.materials   as never,
        door_fronts: data.schedules.door_fronts as never,
        drawers:     data.schedules.drawers     as never,
        edgebands:   data.schedules.edgebands   as never,
        hardware:    data.schedules.hardware    as never,
        countertops: data.schedules.countertops as never,
      }}
      catalogs={data.catalogs}
      onRegisterSave={onRegisterSave}
    />
  );
}
