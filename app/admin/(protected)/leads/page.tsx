"use client";

import { useState, useEffect } from "react";
import { leadInquiryResponse } from "@/lib/email-templates";

const LABEL = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT = "w-full bg-[#1d1d1d] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT + " appearance-none";

const YOUR_NAME  = "Advanced Cabinets";
const YOUR_PHONE = "(208) 888-0000"; // update to real number
const YOUR_EMAIL = "residential@advancedcabinets.net";

type Status = "idle" | "sending" | "sent" | "error";

export default function LeadsPage() {
  // Lead info
  const [clientName,   setClientName]   = useState("");
  const [clientEmail,  setClientEmail]  = useState("");
  const [clientPhone,  setClientPhone]  = useState("");
  const [projectType,  setProjectType]  = useState("Residential");
  const [source,       setSource]       = useState("Website form");
  const [message,      setMessage]      = useState("");

  // Email draft
  const [subject,    setSubject]    = useState("");
  const [emailBody,  setEmailBody]  = useState("");
  const [tab,        setTab]        = useState<"edit" | "preview">("edit");

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Auto-generate template whenever client name changes
  useEffect(() => {
    const firstName = clientName.trim().split(" ")[0] || "there";
    const tmpl = leadInquiryResponse({
      clientFirstName: firstName,
      yourName: YOUR_NAME,
      yourPhone: YOUR_PHONE,
      yourEmail: YOUR_EMAIL,
    });
    setSubject(tmpl.subject);
    setEmailBody(tmpl.text);
  }, [clientName]);

  async function send(action: "send_response" | "log_only") {
    if (!clientName || !clientEmail) {
      setErrorMsg("Client name and email are required.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");

    const res = await fetch("/api/admin/leads/send-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName, clientEmail, clientPhone,
        projectType, source, message,
        subject, emailBody, action,
      }),
    });

    if (res.ok) {
      setStatus("sent");
    } else {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error ?? "Something went wrong.");
      setStatus("error");
    }
  }

  function reset() {
    setClientName(""); setClientEmail(""); setClientPhone("");
    setProjectType("Residential"); setSource("Website form"); setMessage("");
    setSubject(""); setEmailBody(""); setStatus("idle"); setErrorMsg("");
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-1">Leads</h1>
      <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-10">
        Intake &amp; Response — Admin Only
      </p>

      {status === "sent" ? (
        <div className="bg-[#1a2a1a] border border-white/10 rounded p-8 text-center">
          <p className="text-green-400 font-condensed uppercase tracking-widest text-sm mb-2">
            ✓ Response sent
          </p>
          <p className="text-white/40 text-xs mb-6">Email delivered to {clientEmail}</p>
          <button
            onClick={reset}
            className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-6 rounded transition-colors"
          >
            New Lead
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">

          {/* Left: Lead info */}
          <div>
            <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">
              Lead Info
            </p>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Name *</label>
                  <input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className={INPUT}
                    placeholder="Jonnee Western"
                  />
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <input
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    className={INPUT}
                    placeholder="(208) 555-0000"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Email *</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  className={INPUT}
                  placeholder="client@email.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Project Type</label>
                  <select
                    value={projectType}
                    onChange={e => setProjectType(e.target.value)}
                    className={SELECT}
                  >
                    <option>Residential</option>
                    <option>Commercial</option>
                    <option>Unknown</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Source</label>
                  <select
                    value={source}
                    onChange={e => setSource(e.target.value)}
                    className={SELECT}
                  >
                    <option>Website form</option>
                    <option>Cold call</option>
                    <option>Referral</option>
                    <option>Walk-in</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>Their message / notes</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className={INPUT + " resize-none"}
                  placeholder="Paste their form message or add intake notes..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => send("log_only")}
                disabled={status === "sending"}
                className="bg-[#2d2d2d] hover:bg-[#3d3d3d] text-white/70 font-condensed uppercase tracking-widest text-xs py-2.5 px-5 rounded transition-colors disabled:opacity-40"
              >
                Log Only (no email)
              </button>
              <button
                onClick={() => send("send_response")}
                disabled={status === "sending" || !clientEmail}
                className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2.5 px-6 rounded transition-colors disabled:opacity-40"
              >
                {status === "sending" ? "Sending..." : "Send Response →"}
              </button>
            </div>

            {errorMsg && (
              <p className="text-red-400 text-xs mt-3">{errorMsg}</p>
            )}
          </div>

          {/* Right: Email draft */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
                Response Email
              </p>
              <div className="flex gap-1">
                {(["edit", "preview"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`text-xs font-condensed uppercase tracking-widest px-3 py-1 rounded transition-colors ${
                      tab === t
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {tab === "edit" ? (
              <div className="space-y-3">
                <div>
                  <label className={LABEL}>Subject</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Body (plain text)</label>
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    rows={16}
                    className={INPUT + " resize-none font-mono text-xs leading-relaxed"}
                  />
                </div>
                <p className="text-white/20 text-xs">
                  Edit freely — this is plain text sent directly to the client.
                  Template auto-fills when you enter the client name.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded overflow-hidden">
                <div className="bg-[#1e3a5f] text-white px-4 py-3">
                  <div className="text-xs opacity-60 uppercase tracking-widest">To: {clientEmail || "—"}</div>
                  <div className="text-xs opacity-60 uppercase tracking-widest mt-0.5">Subject: {subject}</div>
                </div>
                <pre className="p-4 text-xs text-[#222] whitespace-pre-wrap leading-relaxed font-sans">
                  {emailBody}
                </pre>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
