"use client";

import { useRef, useState, useEffect } from "react";

type Doc = { type: string; filename: string; url: string };

function DocViewer({ doc, index }: { doc: Doc; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);

  const label =
    doc.type === "disclosure"     ? "Residential Disclosure"
    : doc.type === "03_job_specs" ? "Cabinet Specification"
    : doc.type === "05_drawings"  ? "Project Drawings"
    : doc.type === "02_quote"     ? "Estimate / Quote"
    : doc.filename;

  function openNewTab() {
    window.open(doc.url, "_blank", "noopener");
    setOpened(true);
  }

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[#f08122] text-lg shrink-0">📄</span>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{label}</p>
            <p className="text-white/30 text-xs truncate">{doc.filename}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {opened && (
            <span className="text-green-400 text-xs font-condensed uppercase tracking-widest">
              ✓ Opened
            </span>
          )}
          <button
            onClick={openNewTab}
            className="text-xs font-condensed uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white/70 hover:text-white px-3 py-1.5 rounded transition-colors"
          >
            Open
          </button>
          <button
            onClick={() => { setExpanded(!expanded); setOpened(true); }}
            className="text-xs font-condensed uppercase tracking-widest bg-[#f08122]/20 hover:bg-[#f08122]/30 text-[#f08122] px-3 py-1.5 rounded transition-colors"
          >
            {expanded ? "Hide" : "Preview"}
          </button>
        </div>
      </div>

      {/* Inline PDF preview */}
      {expanded && (
        <div className="border-t border-white/10">
          <iframe
            src={doc.url}
            className="w-full"
            style={{ height: "520px", background: "#1a1a1a" }}
            title={label}
          />
        </div>
      )}
    </div>
  );
}

export function SignoffCanvas({
  token,
  jobLabel,
  docs = [],
}: {
  token: string;
  jobLabel: string;
  docs?: Doc[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig]   = useState(false);
  const [name, setName]       = useState("");
  const [agreed, setAgreed]   = useState(false);
  const [state, setState]     = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errMsg, setErrMsg]   = useState("");

  // ── canvas setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width  / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSig(true);
  }

  function onPointerUp() { setDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  // ── submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!name.trim() || !hasSig || !agreed) return;
    setState("submitting");
    const canvas = canvasRef.current!;
    const signature_data = canvas.toDataURL("image/png");
    try {
      const res = await fetch(`/api/signoffs/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_name: name.trim(), signature_data }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrMsg(body.error ?? "Something went wrong");
        setState("error");
        return;
      }
      setState("done");
    } catch (e) {
      setErrMsg(String(e));
      setState("error");
    }
  }

  // ── done state ────────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-heading uppercase tracking-wide text-white">
          Signature Received
        </h2>
        <p className="text-white/50 text-sm max-w-sm">
          Your approval has been recorded. The Advanced Custom Cabinets team
          has been notified and will be in touch.
        </p>
        <p className="text-white/25 text-xs mt-4">You may close this window.</p>
      </div>
    );
  }

  const canSubmit = name.trim() && hasSig && agreed && state === "idle";

  return (
    <div className="space-y-8">

      {/* ── Documents to review ─────────────────────────────────────────── */}
      {docs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-condensed uppercase tracking-widest text-white/50">
              Documents to Review
            </h2>
            <div className="flex-1 border-t border-white/10" />
            <span className="text-xs font-condensed text-white/30">{docs.length} file{docs.length !== 1 ? "s" : ""}</span>
          </div>
          <p className="text-white/40 text-xs">
            Please review each document before signing. Use &ldquo;Preview&rdquo; to read inline or &ldquo;Open&rdquo; to view in a new tab.
          </p>
          {docs.map((doc, i) => (
            <DocViewer key={i} doc={doc} index={i} />
          ))}
        </div>
      )}

      {/* ── Approval form ───────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-condensed uppercase tracking-widest text-white/50">
            Your Approval
          </h2>
          <div className="flex-1 border-t border-white/10" />
        </div>

        {/* Job label */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-1">Job</p>
          <p className="text-white text-sm font-medium">{jobLabel}</p>
        </div>

        {/* What they're approving */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-5">
          <p className="text-white/70 text-sm leading-relaxed">
            By signing below, you confirm that you have reviewed and approve the
            cabinet specifications for the above job, as presented by Advanced
            Custom Cabinets. Changes after signing may be subject to a change order.
          </p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
            Your Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full bg-[#111] border border-white/15 rounded px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#f08122]"
          />
        </div>

        {/* Signature canvas */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-condensed uppercase tracking-widest text-white/50">
              Signature <span className="text-white/25 normal-case">(draw below)</span>
            </label>
            {hasSig && (
              <button
                onClick={clearCanvas}
                className="text-xs font-condensed uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={160}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-full rounded border border-white/15 bg-[#111] touch-none cursor-crosshair"
            style={{ height: "160px" }}
          />
          {!hasSig && (
            <p className="text-white/20 text-[11px] mt-1 text-center">Use mouse or touch to sign</p>
          )}
        </div>

        {/* Agreement checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-[#f08122] w-4 h-4 shrink-0"
          />
          <span className="text-white/60 text-sm leading-relaxed">
            I confirm I have read and approve the above cabinet specifications.
            I understand that changes after this approval may be subject to a
            change order fee.
          </span>
        </label>

        {/* Error */}
        {state === "error" && (
          <p className="text-red-400 text-sm font-condensed">{errMsg}</p>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full bg-[#f08122] hover:bg-[#d9711e] disabled:bg-white/10 disabled:text-white/20 text-white font-condensed uppercase tracking-widest py-3 rounded text-sm transition-colors"
        >
          {state === "submitting" ? "Submitting…" : "Submit Approval"}
        </button>

        <p className="text-white/20 text-[11px] text-center leading-relaxed">
          Your name, signature, IP address, and timestamp will be recorded.
          This constitutes a legally binding electronic approval.
        </p>
      </div>
    </div>
  );
}
