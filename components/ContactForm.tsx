"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "success" | "error";

export function ContactForm({ showPhone }: { showPhone?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
      (e.target as HTMLFormElement).reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-8 text-white/70 font-heading text-xl">
        Thank you!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="firstName" name="firstName" label="First Name" required />
        <Field id="lastName" name="lastName" label="Last Name" required />
      </div>
      <Field id="email" name="email" label="Email" type="email" required />
      {showPhone && <Field id="phone" name="phone" label="Phone" type="tel" />}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-condensed uppercase tracking-widest text-white/60" htmlFor="projectType">
          Project Type *
        </label>
        <select
          id="projectType"
          name="projectType"
          required
          className="bg-[#1d1d1d] border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]"
        >
          <option value="">Select an option</option>
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-condensed uppercase tracking-widest text-white/60" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className="bg-[#1d1d1d] border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-3 px-6 rounded transition-colors disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Submit"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-400 text-center">
          Something went wrong. Please call us at {"{SITE.phone}"}.
        </p>
      )}
    </form>
  );
}

function Field({
  id, name, label, type = "text", required,
}: {
  id: string; name: string; label: string; type?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-condensed uppercase tracking-widest text-white/60" htmlFor={id}>
        {label}{required && " *"}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        className="bg-[#1d1d1d] border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]"
      />
    </div>
  );
}
