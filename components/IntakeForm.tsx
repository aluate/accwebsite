"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type PmOption = { name: string; email: string | null };

const SECTION = "mb-8";
const LABEL = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT = "w-full bg-[#1d1d1d] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT + " appearance-none";

type InitialValues = Partial<{
  job_number: string;
  job_type: string; client_name: string; client_email: string; client_phone: string;
  site_address: string; city: string; pm: string;
  builder_name: string; builder_email: string; builder_phone: string; builder_company: string;
  delivery_date: string; notes: string;
  notes_install: string; notes_finishing: string; notes_shop: string; notes_client: string;
  mod_residential: number; mod_commercial: number; mod_trim: number; mod_doors: number;
  id: string;
}>;

export function IntakeForm({ initial }: { initial?: InitialValues }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!initial?.id;
  const [pms, setPms] = useState<PmOption[]>([]);

  // Address autocomplete state
  const addressRef = useRef<HTMLInputElement>(null);
  const [addressValue, setAddressValue] = useState(initial?.site_address ?? "");
  const [cityValue, setCityValue] = useState(initial?.city ?? "");

  // Load PM list from DB
  useEffect(() => {
    fetch("/api/jobs/pms")
      .then((r) => r.json())
      .then((data: PmOption[]) => setPms(data))
      .catch(() => {/* leave empty, form still works */});
  }, []);

  // Load Google Places autocomplete
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !addressRef.current) return;

    const scriptId = "google-maps-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__initGooglePlaces`;
      script.async = true;
      document.head.appendChild(script);
    }

    function initAutocomplete() {
      if (!addressRef.current || !window.google) return;
      const ac = new window.google.maps.places.Autocomplete(addressRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["formatted_address", "address_components"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return;
        const city = place.address_components.find((c: { types: string[]; long_name: string }) =>
          c.types.includes("locality")
        )?.long_name ?? "";
        setAddressValue(place.formatted_address ?? "");
        setCityValue(city);
      });
    }

    (window as typeof window & { __initGooglePlaces?: () => void }).__initGooglePlaces = initAutocomplete;

    if (window.google?.maps?.places) {
      initAutocomplete();
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const body = {
      job_number:       fd.get("job_number"),
      job_type:         fd.get("job_type"),
      client_name:      fd.get("client_name"),
      client_email:     fd.get("client_email"),
      client_phone:     fd.get("client_phone"),
      site_address:     addressValue || fd.get("site_address"),
      city:             cityValue || fd.get("city"),
      pm:               fd.get("pm"),
      builder_name:     fd.get("builder_name"),
      builder_email:    fd.get("builder_email"),
      builder_phone:    fd.get("builder_phone"),
      builder_company:  fd.get("builder_company"),
      delivery_date:    fd.get("delivery_date"),
      notes:            fd.get("notes"),
      notes_install:    fd.get("notes_install"),
      notes_finishing:  fd.get("notes_finishing"),
      notes_shop:       fd.get("notes_shop"),
      notes_client:     fd.get("notes_client"),
      mod_residential:  fd.get("mod_residential") === "on",
      mod_commercial:   fd.get("mod_commercial") === "on",
      mod_trim:         fd.get("mod_trim") === "on",
      mod_doors:        fd.get("mod_doors") === "on",
    };

    try {
      let jobId: string;
      if (isEdit) {
        const res = await fetch(`/api/jobs/${initial!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Server error");
        jobId = initial!.id!;
      } else {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        jobId = data.job_number || data.id;
      }
      router.push(`/jobs/${jobId}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Check the server and try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-0">

      {/* Job Number */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Job Number</p>
        <div className="max-w-xs">
          <label className={LABEL}>TradeSoft Job # *</label>
          <input
            type="text"
            name="job_number"
            defaultValue={initial?.job_number ?? ""}
            placeholder="e.g. 26162"
            required={!isEdit}
            className={INPUT}
          />
        </div>
      </div>

      {/* Job Type */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Job Type</p>
        <div className="flex gap-4">
          {["residential", "commercial"].map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="job_type"
                value={t}
                defaultChecked={(initial?.job_type ?? "residential") === t}
                className="accent-[#f08122]"
              />
              <span className="text-white/70 text-sm font-condensed uppercase tracking-widest">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Client */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Client</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Name *</label>
            <input name="client_name" required defaultValue={initial?.client_name ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input name="client_email" type="email" defaultValue={initial?.client_email ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input name="client_phone" type="tel" defaultValue={initial?.client_phone ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>City</label>
            <input
              name="city"
              value={cityValue}
              onChange={(e) => setCityValue(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Site Address *</label>
            <input
              ref={addressRef}
              name="site_address"
              required
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              placeholder="Start typing to search addresses…"
              className={INPUT}
            />
          </div>
        </div>
      </div>

      {/* Project Manager */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Project Manager</p>
        <div className="max-w-xs">
          <label className={LABEL}>Assigned PM</label>
          <select name="pm" defaultValue={initial?.pm ?? ""} className={SELECT}>
            <option value="">-- Select PM --</option>
            {pms.map((pm) => (
              <option key={pm.name} value={pm.name}>{pm.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Builder */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Builder / Contractor</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Name</label>
            <input name="builder_name" defaultValue={initial?.builder_name ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Company</label>
            <input name="builder_company" defaultValue={initial?.builder_company ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input name="builder_email" type="email" defaultValue={initial?.builder_email ?? ""} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input name="builder_phone" type="tel" defaultValue={initial?.builder_phone ?? ""} className={INPUT} />
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Scope of Work</p>
        <p className="text-white/30 text-xs mb-4 font-condensed uppercase tracking-widest">Select all that apply -- each is managed independently</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { name: "mod_residential", label: "Residential Cabinets",  desc: "Express wizard or PM-built order" },
            { name: "mod_commercial",  label: "Commercial Cabinets",   desc: "CV report -> auto-priced" },
            { name: "mod_trim",        label: "Trim Supply",           desc: "Crown, base, case -- any millwork" },
            { name: "mod_doors",       label: "Doors",                 desc: "Supplier price schedule estimate" },
          ].map((m) => (
            <label key={m.name} className="flex items-start gap-3 bg-[#2d2d2d] rounded p-4 cursor-pointer hover:bg-[#353535] transition-colors">
              <input type="checkbox" name={m.name} defaultChecked={!!initial?.[m.name as keyof typeof initial]} className="accent-[#f08122] mt-0.5 shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">{m.label}</p>
                <p className="text-white/40 text-xs mt-0.5">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Timeline & Intake Source */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Timeline &amp; Intake</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Rough Delivery Date</label>
            <input name="delivery_date" type="date" defaultValue={initial?.delivery_date ?? ""} className={INPUT} />
          </div>
        </div>
        <div className="mt-4">
          <label className={LABEL}>Intake / Source Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={initial?.notes ?? ""}
            placeholder="How did this job come in? Procore bump, phone call, walk-in... anything relevant."
            className={INPUT + " resize-none"}
          />
        </div>
      </div>

      {/* Build Notes -- each section routes to a different team */}
      <div className={SECTION}>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Build Notes</p>
        <p className="text-white/30 text-xs mb-4 font-condensed uppercase tracking-widest">
          Each note routes to a different audience -- Install team, Finishing dept, Shop floor, or the Client. Leave blank if not applicable.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Install Instructions</label>
            <textarea
              name="notes_install"
              rows={3}
              defaultValue={initial?.notes_install ?? ""}
              placeholder="Floor conditions, install order, scribe-to-wall, ceiling height quirks..."
              className={INPUT + " resize-none"}
            />
          </div>
          <div>
            <label className={LABEL}>Finishing Dept</label>
            <textarea
              name="notes_finishing"
              rows={3}
              defaultValue={initial?.notes_finishing ?? ""}
              placeholder="Sheen, custom paint match, hardwood edge to paint, glaze details..."
              className={INPUT + " resize-none"}
            />
          </div>
          <div>
            <label className={LABEL}>Shop Build Notes</label>
            <textarea
              name="notes_shop"
              rows={3}
              defaultValue={initial?.notes_shop ?? ""}
              placeholder="Box construction quirks, applied panels, hood enclosures, special joinery..."
              className={INPUT + " resize-none"}
            />
          </div>
          <div>
            <label className={LABEL}>Client-Facing Notes</label>
            <textarea
              name="notes_client"
              rows={3}
              defaultValue={initial?.notes_client ?? ""}
              placeholder="What the client should see on the spec -- included scope, exclusions, callouts..."
              className={INPUT + " resize-none"}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <div className="flex gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-3 px-8 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Job"}
        </button>
        <a
          href="/jobs"
          className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-sm py-3 px-4 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
