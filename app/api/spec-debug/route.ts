export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import path from "path";
import fs from "fs";

export async function GET(req: NextRequest) {
  const specId = req.nextUrl.searchParams.get("specId") ?? "58aba5f33bc80461";
  const jobId  = req.nextUrl.searchParams.get("jobId")  ?? "ACC-2026-0179";
  const steps: Record<string, unknown> = {};

  try {
    // Step 1: catalog test
    const dir = path.join(process.cwd(), "data/catalogs");
    steps.cwd = process.cwd();
    steps.catalogDir = dir;
    steps.catalogDirExists = fs.existsSync(dir);
    if (steps.catalogDirExists) {
      const f = path.join(dir, "colors_paint.json");
      steps.paintColorsExists = fs.existsSync(f);
      if (steps.paintColorsExists) {
        const raw = JSON.parse(fs.readFileSync(f, "utf-8"));
        steps.paintColorsCount = Array.isArray(raw) ? raw.length : "not-array";
      }
    }

    // Step 2: residential_specs (with job_id)
    steps.q1_start = Date.now();
    const specs = await sql`SELECT id, job_id FROM residential_specs WHERE id = ${specId} AND job_id = ${jobId}`;
    steps.q1_ms = Date.now() - (steps.q1_start as number);
    steps.q1_rows = specs.length;

    if (!specs.length) {
      const specs2 = await sql`SELECT id, job_id FROM residential_specs WHERE id = ${specId}`;
      steps.q1_without_jobid_rows = specs2.length;
      steps.q1_actual_job_id = specs2[0]?.job_id ?? null;
    }

    // Step 3: finish_groups
    steps.q2_start = Date.now();
    const fg = await sql`SELECT id FROM finish_groups WHERE spec_id = ${specId}`;
    steps.q2_ms = Date.now() - (steps.q2_start as number);
    steps.q2_rows = fg.length;

    // Step 4: rooms
    steps.q3_start = Date.now();
    const rooms = await sql`SELECT id FROM rooms WHERE spec_id = ${specId}`;
    steps.q3_ms = Date.now() - (steps.q3_start as number);
    steps.q3_rows = rooms.length;

    steps.ok = true;
  } catch (e) {
    steps.error = (e as Error).message;
    steps.stack = (e as Error).stack;
  }

  return NextResponse.json(steps);
}
