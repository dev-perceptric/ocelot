import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared parts. Pages use these and never make their own copy.

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold uppercase tracking-[0.28em] ${className}`} aria-label="Ocelot">
      OCELOT
    </span>
  );
}

const BUTTON = {
  base: "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 text-body font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted",
  primary: "bg-brand text-ink hover:bg-brand-hover",
  secondary: "bg-ink text-surface hover:bg-ink/85",
  outline: "border border-ink text-ink hover:bg-canvas",
  ghost: "text-ink hover:bg-canvas",
  danger: "bg-danger text-surface hover:bg-danger/90",
};
type Variant = Exclude<keyof typeof BUTTON, "base">;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BUTTON.base} ${BUTTON[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BUTTON.base} ${BUTTON[variant]} ${className}`} {...props} />;
}

export const inputClass =
  "h-12 w-full rounded-[var(--radius-control)] border border-input-border bg-surface px-4 text-body text-ink placeholder:text-muted";

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-meta font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// A state is a square tag with a text label. Rejected, saved, withdrawn and archived are neutral.
const TONE = {
  neutral: "bg-canvas text-ink",
  success: "bg-success-bg text-success",
  info: "bg-info-bg text-info",
  progress: "bg-progress-bg text-progress",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  brand: "bg-brand text-ink",
};
export type Tone = keyof typeof TONE;

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 text-label font-bold ${TONE[tone]}`}>{children}</span>;
}

// A tool's first screen before there's data: one title, one line, one button.
export function Empty({ title, line, action }: { title: string; line?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border border-border bg-surface p-8 rounded-[var(--radius-card)]">
      <h2 className="text-card font-bold">{title}</h2>
      {line ? <p className="text-body text-muted">{line}</p> : null}
      {action}
    </div>
  );
}
