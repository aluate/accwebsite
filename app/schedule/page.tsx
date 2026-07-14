export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireBuilder } from "@/lib/auth";
import { ScheduleWallClient } from "@/components/ScheduleWallClient";

/**
 * Schedule page - thin server shell.
 *
 * Auth check happens server-side (requireBuilder), then the page renders
 * immediately with a loading skeleton. ScheduleWallClient fetches its own
 * data via GET /api/schedule/data and polls every 60 s for the TV wall.
 *
 * No DB queries run here - eliminates "DATABASE BUSY" cold-start failures
 * that appeared when 5 parallel queries raced against the Vercel timeout.
 */
export default async function SchedulePage() {
  const session = await requireBuilder();
  if (session.role === "installer") redirect("/installer");
  const isAdmin = session.role === "admin";
  const today = new Date().toISOString().slice(0, 10);

  return <ScheduleWallClient isAdmin={isAdmin} today={today} />;
}
