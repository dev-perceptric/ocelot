"use client";

import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";

const MB = 1024 * 1024;

// Pick or drop one file. Checks type and size before anything uploads; the server and storage rules check again.
export function FileDrop({ label, accept, maxBytes, onFile, hint, disabled }: {
  label: string;
  accept: Record<string, string>; // mime type -> what people call it, e.g. { "application/pdf": "PDF" }
  maxBytes: number;
  onFile: (file: File) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const kinds = Object.values(accept).join(" or ");

  const take = (file?: File) => {
    if (!file) return;
    if (!accept[file.type]) return setError(`Choose a ${kinds} file.`);
    if (file.size > maxBytes) return setError(`Choose a file under ${Math.round(maxBytes / MB)} MB.`);
    setError("");
    onFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-meta font-bold">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files[0]); }}
        className={`flex flex-col items-center gap-2 border border-dashed px-6 py-8 text-center rounded-[var(--radius-card)] ${over ? "border-ink bg-canvas" : "border-input-border"}`}
      >
        <Upload size={24} strokeWidth={1.75} aria-hidden />
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="font-bold underline disabled:text-muted">
          Choose a file
        </button>
        <p className="text-meta text-muted">{hint ?? `${kinds}, up to ${Math.round(maxBytes / MB)} MB`}</p>
        <input
          ref={input}
          id={id}
          type="file"
          accept={Object.keys(accept).join(",")}
          className="sr-only"
          disabled={disabled}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {error ? <p id={`${id}-error`} className="text-meta text-danger">{error}</p> : null}
    </div>
  );
}
