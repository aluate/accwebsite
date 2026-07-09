"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type EditableField =
  | "client_name" | "client_email" | "client_phone" | "site_address" | "city"
  | "pm" | "builder_name" | "builder_company" | "builder_email" | "builder_phone"
  | "delivery_date" | "notes" | "job_number";

interface Props {
  jobId: string;
  initialValues: Partial<Record<EditableField, string | null>>;
}

export function JobInlineEditClient({ jobId, initialValues }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [values, setValues] = useState<Partial<Record<EditableField, string>>>(
    Object.fromEntries(
      Object.entries(initialValues).map(([k, v]) => [k, v ?? ""])
    ) as Partial<Record<EditableField, string>>
  );
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  async function commitEdit(field: EditableField) {
    if (saving) return;
    setSaving(true);
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: values[field] || null }),
      });
      router.refresh();
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  function startEdit(field: EditableField) {
    setEditing(field);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function EditableRow({
    label, field, href, multiline,
  }: {
    label: string;
    field: EditableField;
    href?: string;
    multiline?: boolean;
  }) {
    const val = values[field] ?? "";
    const isEditing = editing === field;

    if (isEditing) {
      return (
        <div className="py-2 border-b border-white/5 last:border-0">
          <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-1">{label}</p>
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={val}
              rows={3}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              onBlur={() => commitEdit(field)}
              onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
              className="w-full bg-[#111] border border-[#f08122]/40 rounded px-2 py-1 text-white text-sm focus:outline-none resize-none"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={val}
              type={field === "delivery_date" ? "date" : field.includes("email") ? "email" : field.includes("phone") ? "tel" : "text"}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              onBlur={() => commitEdit(field)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit(field);
                if (e.key === "Escape") setEditing(null);
              }}
              className="w-full bg-[#111] border border-[#f08122]/40 rounded px-2 py-1 text-white text-sm focus:outline-none"
            />
          )}
        </div>
      );
    }

    return (
      <div
        className="py-2 border-b border-white/5 last:border-0 group cursor-pointer hover:bg-white/3 rounded px-1 -mx-1 transition-colors"
        onClick={() => startEdit(field)}
        title={`Click to edit ${label}`}
      >
        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">{label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {val ? (
            href ? (
              <a
                href={`${href}${val}`}
                className="text-white/70 text-sm hover:text-[#f08122] transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {val}
              </a>
            ) : (
              <p className="text-white/70 text-sm">{val}</p>
            )
          ) : (
            <p className="text-white/20 text-sm italic">—</p>
          )}
          <span className="opacity-0 group-hover:opacity-100 text-white/30 text-[10px] ml-1 transition-opacity">✎</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Client */}
      <div className="bg-[#1e1e1e] rounded-lg border border-white/8 p-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-[10px] mb-3">Client</p>
        <EditableRow label="Name"    field="client_name" />
        <EditableRow label="Email"   field="client_email"  href="mailto:" />
        <EditableRow label="Phone"   field="client_phone"  href="tel:" />
        <EditableRow label="Address" field="site_address" />
        <EditableRow label="City"    field="city" />
      </div>

      {/* Project Info */}
      <div className="bg-[#1e1e1e] rounded-lg border border-white/8 p-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-[10px] mb-3">Project Info</p>
        <EditableRow label="PM"           field="pm" />
        <EditableRow label="Job #"        field="job_number" />
        <EditableRow label="Delivery"     field="delivery_date" />
      </div>

      {/* Builder */}
      <div className="bg-[#1e1e1e] rounded-lg border border-white/8 p-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-[10px] mb-3">Builder</p>
        <EditableRow label="Name"    field="builder_name" />
        <EditableRow label="Company" field="builder_company" />
        <EditableRow label="Email"   field="builder_email"  href="mailto:" />
        <EditableRow label="Phone"   field="builder_phone"  href="tel:" />
      </div>

      {/* Notes */}
      <div className="bg-[#1e1e1e] rounded-lg border border-white/8 p-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-[10px] mb-3">Notes</p>
        <EditableRow label="Notes" field="notes" multiline />
      </div>

      {saving && (
        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest text-center">Saving…</p>
      )}
    </div>
  );
}
