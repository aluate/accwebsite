export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireBuilder } from "@/lib/auth";
import { ScheduleWallClient } from "@/components/ScheduleWallClient";

import { can } from "@/lib/permissions";
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
  /*
    THE ONE THAT BLOCKED THE WHOLE PUNCH-TO-INSTALLER FLOW.

    This read `role === "admin" || role === "karl"` and was never pointed at the
    capability map. 0057 gave PMs schedule.edit on the API, and the role matrix
    then showed a PM with ZERO draggable cards and no add button: the capability
    existed and there was no way to reach it. A PM could schedule only by calling
    the endpoint by hand.

    The prop is still called isAdmin inside ScheduleWallClient; what it actually
    means is "may edit the calendar", which is what it is now given.
  */
  const isAdmin = can(session.role, "schedule.edit");
  const today = new Date().toISOString().slice(0, 10);

  return <ScheduleWallClient isAdmin={isAdmin} today={today} />;
}
