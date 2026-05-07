import { redirect } from "next/navigation";

// Phase 1B+ (2026-05): the legacy admin-password login is retired.
// Send everyone to the unified /login page.
export default function AdminLoginPage() {
  redirect("/login");
}
