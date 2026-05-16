"use client";

/**
 * StatusAdvanceButton
 *
 * Unified status-advance control for the job detail page.
 * Replaces ReleaseToProductionButton, ReadyToScheduleButton, SendSignoffButton.
 *
 * For each transition that has a gate config, shows a modal with:
 *   - What will happen
 *   - Optional/required file upload (drag-and-drop)
 *   - Who will be emailed (preview)
 *   - A note field
 *   - Confirm button
 *
 * For transitions with no gate config, uses a simple confirm modal.
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TRANSITION_GATES, nextStatus, STATUS_SEQUENCE } from "@/lib/transition-gates";

type UploadedFile = {
  id: string;
  filename: string;
  size: number;
};

const RECIPIENT_LABELS: Record<string, string> = {
  client: "Client",
  pm:     "Project Manager",
  eng:    "Engineering team",
  shop:   "Production / Shop",
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatusAdvanceButton({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = nextStatus(currentStatus);
  const gate   = target ? TRANSITION_GATES[target] : undefined;

  // Nothing to advance to
  if (!target || currentStatus === "complete") return null;

  const buttonLabel = gate?.buttonLabel ?? `Advance to ${target.replace(/_/g, " ")}`;

  function open() {
    setModalOpen(true);
    setNote("");
    setUploadedFiles([]);
    setUploadError("");
    setSubmitError("");
    setDone(false);
  }

  function close() {
    if (submitting || uploading) return;
    setModalOpen(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", gate?.docKind ?? "14_prod_docs");

      const res = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      setUploadedFiles((prev) => [...prev, { id: data.id, filename: data.filename, size: data.size }]);
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  }, [gate?.docKind, jobId]);

  async function handleAdvance() {
    if (gate?.docRequired && uploadedFiles.length === 0) {
      setSubmitError(`Please upload ${gate.docLabel} before proceeding.`);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: target,
          note: note.trim() || undefined,
          fileIds: uploadedFiles.map((f) => f.id),
          _actor: "pm",
          _actorRole: "pm",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? "Failed to advance status");
        setSubmitting(false);
        return;
      }
      setDone(true);
      setTimeout(() => {
        setModalOpen(false);
        router.refresh();
      }, 900);
    } catch (e) {
      setSubmitError(String(e));
      setSubmitting(false);
    }
  }

  const currentIdx = STATUS_SEQUENCE.indexOf(currentStatus as typeof STATUS_SEQUENCE[number]);
  const targetIdx  = STATUS_SEQUENCE.indexOf(target as typeof STATUS_SEQUENCE[number]);

  return (
    <>
      <button
        onClick={open}
        className="bg-[#f08122]/15 hover:bg-[#f08122]/25 text-[#f08122] border border-[#f08122]/30 hover:border-[#f08122]/60 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
      >
        {buttonLabel} →
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-lg">

            {/* Header */}
            <h3 className="font-heading text-lg uppercase tracking-wide text-white mb-1">
              {gate?.modalHeading ?? buttonLabel}
            </h3>
            <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-5">
              {currentStatus.replace(/_/g, " ")} → {target.replace(/_/g, " ")}
            </p>

            {/* Progress strip */}
            <div className="flex gap-0.5 mb-5">
              {STATUS_SEQUENCE.map((s, i) => (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${
                    i < currentIdx  ? "bg-white/20" :
                    i === currentIdx ? "bg-[#f08122]/60" :
                    i === targetIdx  ? "bg-[#f08122]" :
                                       "bg-white/10"
                  }`}
                />
              ))}
            </div>

            {gate?.modalDesc && (
              <p className="text-white/60 text-sm mb-5 leading-relaxed">{gate.modalDesc}</p>
            )}

            {/* File upload zone */}
            {gate?.docKind && (
              <div className="mb-5">
                <p className="text-xs font-condensed uppercase tracking-widest text-white/50 mb-2">
                  {gate.docLabel}
                  {gate.docRequired
                    ? <span className="text-red-400 ml-1">*</span>
                    : <span className="text-white/25 ml-1">(optional)</span>
                  }
                </p>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-[#f08122] bg-[#f08122]/10"
                      : "border-white/15 hover:border-white/30 bg-white/5"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  />
                  {uploading ? (
                    <p className="text-white/50 text-sm">Uploading…</p>
                  ) : (
                    <>
                      <p className="text-white/50 text-sm">Drop files here or <span className="text-[#f08122]">browse</span></p>
                      {gate.woUpload && (
                        <p className="text-white/25 text-[10px] font-condensed mt-1">WO####.pdf and CO####.pdf numbers auto-detected</p>
                      )}
                    </>
                  )}
                </div>

                {uploadError && (
                  <p className="text-red-400 text-xs font-condensed mt-2">{uploadError}</p>
                )}

                {/* Uploaded file list */}
                {uploadedFiles.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {uploadedFiles.map((f) => (
                      <li key={f.id} className="flex items-center justify-between bg-white/5 rounded px-3 py-1.5 text-xs">
                        <span className="text-white/80 truncate max-w-xs">{f.filename}</span>
                        <span className="text-white/30 ml-2 shrink-0">{formatBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Email preview */}
            {gate?.recipients && gate.recipients.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded p-3 mb-5">
                <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-1.5">Will send email to</p>
                <div className="flex flex-wrap gap-1.5">
                  {gate.recipients.map((r) => (
                    <span key={r} className="text-[10px] font-condensed uppercase tracking-wider text-blue-300 bg-blue-900/30 rounded px-2 py-0.5">
                      {RECIPIENT_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Note field */}
            <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
              Note <span className="text-white/25 normal-case">(included in emails, optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any context for the recipient…"
              className="w-full bg-[#111] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] resize-none mb-4 placeholder:text-white/20"
            />

            {submitError && (
              <p className="text-red-400 text-xs font-condensed mb-3">{submitError}</p>
            )}

            {done && (
              <p className="text-green-400 text-xs font-condensed mb-3">
                ✓ Status updated to {target.replace(/_/g, " ")}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={close}
                disabled={submitting || done}
                className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleAdvance}
                disabled={submitting || uploading || done}
                className="bg-[#f08122] hover:bg-[#f08122]/90 disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded transition-colors"
              >
                {submitting ? "Advancing…" : done ? "Done ✓" : `Confirm — ${buttonLabel}`}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
