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
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap px-2 py-0.5 text-label font-bold ${TONE[tone]}`}>{children}</span>;
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

// Icon-only button. The label is required: it is read out and shown as the tooltip.
export function IconButton({ label, children, className = "", ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex size-11 items-center justify-center hover:bg-canvas disabled:text-muted rounded-[var(--radius-control)] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const textAreaClass =
  "min-h-32 w-full rounded-[var(--radius-control)] border border-input-border bg-surface px-4 py-3 text-body text-ink placeholder:text-muted";

export function Checkbox({ id, label, ...props }: ComponentProps<"input"> & { id: string; label: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
      <input id={id} type="checkbox" className="size-5 shrink-0 accent-ink" {...props} />
      <span>{label}</span>
    </label>
  );
}

// A choice between a few options shown as cards ("Find a job" / "Hire for my company").
export function RadioCards({ name, legend, options, defaultValue, required }: {
  name: string;
  legend: string;
  options: { value: string; label: string; line?: string }[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-meta font-bold">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer flex-col gap-1 border border-border bg-surface p-5 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 rounded-[var(--radius-card)]"
          >
            <span className="flex items-center gap-3">
              <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} required={required} className="size-5 accent-ink" />
              <span className="text-body font-bold">{o.label}</span>
            </span>
            {o.line ? <span className="pl-8 text-meta text-muted">{o.line}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Plain tables for member lists, admin lists and later the applicant list.
export function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border bg-surface rounded-[var(--radius-card)]">
      <table className="w-full border-collapse text-left text-body" aria-label={label}>{children}</table>
    </div>
  );
}
export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={`border-b border-border px-4 py-3 text-meta font-bold text-muted ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-border px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function Pagination({ page, hasNext, href }: { page: number; hasNext: boolean; href: (page: number) => string }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-body">
      {page > 1 ? <Link href={href(page - 1)} className="font-bold underline">Previous</Link> : <span />}
      <span className="text-meta text-muted">Page {page}</span>
      {hasNext ? <Link href={href(page + 1)} className="font-bold underline">Next</Link> : <span />}
    </nav>
  );
}

// A company logo, or its initials on canvas when there's no logo yet.
export function CompanyLogo({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  // A logo keeps its own shape: as tall as `size`, as wide as it is (up to three times that), with no frame.
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" height={size} className="shrink-0 object-contain" style={{ height: size, width: "auto", maxWidth: size * 3 }} />
  ) : (
    <span aria-hidden className="flex shrink-0 items-center justify-center border border-border bg-canvas font-bold rounded-[var(--radius-control)]" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

// Grey blocks that hold the layout while data loads. Never a spinner.
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-5 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

// A tool's first screen before there's data: one big title, one line, one button.
export function ToolIntro({ title, line, action }: { title: string; line: string; action?: ReactNode }) {
  return (
    <div className="flex max-w-[640px] flex-col items-start gap-4 py-12">
      <h1 className="text-section-sm font-bold md:text-section">{title}</h1>
      <p className="font-[family-name:var(--font-editorial)] text-lede">{line}</p>
      {action}
    </div>
  );
}
