"use client";

/**
 * QuickUploadDrawing — inline drawing upload button for the engineer queue.
 *
 * Renders as a small "Upload Drawing" link. Clicking it opens a file picker.
 * On file select, POSTs to /api/jobs/[jobId]/files with kind=05_drawings.
 * Shows "Uploading..." then "Done" or an error inline — no page reload needed.
 */

import { useRef, useState } from "react";

export function QuickUploadDrawing({ jobId }: { jobId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setState("uploading");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "05_drawings");
      const res = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setState("done");
    } catch {
      setState("error");
    }
    // reset file input so same file can be re-uploaded if needed
    if (inputRef.current) inputRef.current.value = "";
  }

  if (state === "uploading") {
    return <span className="text-blue-400 text-[10px] font-condensed uppercase tracking-wider">Uploading {fileName}...</span>;
  }
  if (state === "done") {
    return <span className="text-green-400 text-[10px] font-condensed uppercase tracking-wider">Drawing uploaded</span>;
  }
  if (state === "error") {
    return (
      <button
        onClick={() => setState("idle")}
        className="text-red-400 text-[10px] font-condensed uppercase tracking-wider hover:text-red-300"
      >
        Upload failed — retry
      </button>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.dwg,.dxf,.png,.jpg"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
        className="text-blue-400 hover:text-blue-300 text-[10px] font-condensed uppercase tracking-wider transition-colors"
      >
        + Upload Drawing
      </button>
    </>
  );
}
