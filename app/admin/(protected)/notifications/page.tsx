import NotificationSettingsClient from "@/components/NotificationSettingsClient";

export const dynamic = "force-dynamic";

export default function NotificationsAdminPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-heading text-2xl uppercase tracking-wide text-[#f08122] mb-1">Automated emails</h1>
      <p className="text-white/40 text-sm mb-8 max-w-3xl">
        Every email the system sends on its own, who it goes to, and a test mode that puts all of it in
        your own inboxes while you are trying things. Recipients are set as roles — &ldquo;the client&rdquo;,
        &ldquo;the builder&rdquo; — so they resolve against each job rather than being an address someone
        has to remember to change.
      </p>
      <NotificationSettingsClient />
    </div>
  );
}
