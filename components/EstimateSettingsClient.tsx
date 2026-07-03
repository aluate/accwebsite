"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  id: string;
  // Labor rates ($/hr, burdened)
  shop_rate: number;
  finish_rate: number;
  install_rate: number;
  pm_rate: number;
  eng_rate: number;
  // PM people hours
  pm_hrs_base: number;
  pm_hrs_per_fg: number;
  // Eng people hours
  eng_hrs_base: number;
  eng_hrs_per_fg: number;
  // Purchasing hours
  purchasing_hrs_base: number;
  // Overhead & margin
  fixed_overhead_pct: number;
  default_margin_pct: number;
  updated_at: string;
};

function Field({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  step = "0.01",
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-white/50 uppercase tracking-widest mb-1">
        {label}
      </label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-white/40">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-28 bg-[#0d0e0f] border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60 tabular-nums"
        />
        {suffix && <span className="text-sm text-white/40">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-white/30 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-6">
      <h2 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-5">
        {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
        {children}
      </div>
    </div>
  );
}

export function EstimateSettingsClient({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(
    settings ?? {
      id: "singleton",
      shop_rate: 25,
      finish_rate: 25,
      install_rate: 45,
      pm_rate: 55,
      eng_rate: 55,
      pm_hrs_base: 2.0,
      pm_hrs_per_fg: 1.5,
      eng_hrs_base: 1.0,
      eng_hrs_per_fg: 0.75,
      purchasing_hrs_base: 2.0,
      fixed_overhead_pct: 16.5,
      default_margin_pct: 48,
      updated_at: new Date().toISOString(),
    }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof Settings) => (v: number) => {
    setForm((f) => ({ ...f, [key]: v }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/estimates/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Live preview: what does a 10-cabinet, 2-FG job cost in people overhead?
  const previewPmHrs = form.pm_hrs_base + form.pm_hrs_per_fg * 2;
  const previewEngHrs = form.eng_hrs_base + form.eng_hrs_per_fg * 2;
  const previewPurchHrs = form.purchasing_hrs_base;
  const previewPeopleOh =
    previewPmHrs * form.pm_rate +
    previewEngHrs * form.eng_rate +
    previewPurchHrs * form.pm_rate;

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0d0e0f]/95 backdrop-blur border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/estimating")}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            &larr; Estimates
          </button>
          <h1 className="text-base font-medium">Estimate Settings</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-400/80">Saved</span>}
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#f08122] hover:bg-[#e07010] disabled:opacity-40 text-black font-medium text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">

        {/* Labor rates */}
        <Section title="Labor rates (burdened $/hr)">
          <Field label="Shop / fabrication" prefix="$" suffix="/hr"
            hint="CNC, assembly, kitting"
            value={form.shop_rate} onChange={set("shop_rate")} />
          <Field label="Finishing" prefix="$" suffix="/hr"
            hint="Stain, paint, seal"
            value={form.finish_rate} onChange={set("finish_rate")} />
          <Field label="Installation" prefix="$" suffix="/hr"
            hint="On-site install crew"
            value={form.install_rate} onChange={set("install_rate")} />
          <Field label="Project management" prefix="$" suffix="/hr"
            hint="PM coordination & client"
            value={form.pm_rate} onChange={set("pm_rate")} />
          <Field label="Engineering" prefix="$" suffix="/hr"
            hint="Drawing review & BOM"
            value={form.eng_rate} onChange={set("eng_rate")} />
        </Section>

        {/* People overhead hours */}
        <Section title="People overhead hours (per job)">
          <Field label="PM base hours" suffix="hrs"
            hint="Flat per-job PM time"
            value={form.pm_hrs_base} onChange={set("pm_hrs_base")} step="0.25" />
          <Field label="PM per finish group" suffix="hrs/FG"
            hint="Scales with finish complexity"
            value={form.pm_hrs_per_fg} onChange={set("pm_hrs_per_fg")} step="0.25" />
          <Field label="Eng base hours" suffix="hrs"
            hint="Flat per-job eng time"
            value={form.eng_hrs_base} onChange={set("eng_hrs_base")} step="0.25" />
          <Field label="Eng per finish group" suffix="hrs/FG"
            hint="More FGs = more drawing sets"
            value={form.eng_hrs_per_fg} onChange={set("eng_hrs_per_fg")} step="0.25" />
          <Field label="Purchasing base hours" suffix="hrs"
            hint="POs, material sourcing"
            value={form.purchasing_hrs_base} onChange={set("purchasing_hrs_base")} step="0.25" />
        </Section>

        {/* Fixed overhead & margin */}
        <Section title="Overhead & margin defaults">
          <Field label="Fixed overhead" suffix="%"
            hint="Building, insurance, equipment -- % of direct cost"
            value={form.fixed_overhead_pct} onChange={set("fixed_overhead_pct")} step="0.1" />
          <Field label="Default margin" suffix="%"
            hint="Pre-filled on new estimates (adjustable per job)"
            value={form.default_margin_pct} onChange={set("default_margin_pct")} step="0.5" />
        </Section>

        {/* Preview */}
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-6">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">
            Preview -- 2 finish group job
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-white/40 text-xs mb-1">PM</div>
              <div className="tabular-nums">{previewPmHrs.toFixed(2)} hrs</div>
              <div className="text-white/40 text-xs">${(previewPmHrs * form.pm_rate).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Engineering</div>
              <div className="tabular-nums">{previewEngHrs.toFixed(2)} hrs</div>
              <div className="text-white/40 text-xs">${(previewEngHrs * form.eng_rate).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Purchasing</div>
              <div className="tabular-nums">{previewPurchHrs.toFixed(2)} hrs</div>
              <div className="text-white/40 text-xs">${(previewPurchHrs * form.pm_rate).toFixed(0)}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-sm">
            <span className="text-white/50">Total people overhead</span>
            <span className="font-semibold tabular-nums text-[#f08122]">${previewPeopleOh.toFixed(0)}</span>
          </div>
          <p className="text-[11px] text-white/25 mt-2">
            Sell price example at {form.default_margin_pct}% margin: if direct+fixed cost = $10,000,
            sell = ${(10000 / (1 - form.default_margin_pct / 100)).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {settings?.updated_at && (
          <p className="text-xs text-white/20 text-right">
            Last saved: {new Date(settings.updated_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
