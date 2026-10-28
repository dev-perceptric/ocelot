"use client";

import { useState } from "react";

// An on/off setting that takes effect right away. For choices saved with a form button, use Checkbox.
export function Switch({ id, label, checked, defaultChecked = false, onChange, name, disabled }: {
  id: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  name?: string;
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <label htmlFor={id} className="text-body">{label}</label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => { setOwn(!on); onChange?.(!on); }}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 disabled:opacity-50 ${on ? "border-ink bg-ink" : "border-input-border bg-canvas"}`}
      >
        <span className={`absolute left-0 top-0.5 size-[18px] rounded-full transition-transform duration-150 ${on ? "translate-x-[22px] bg-brand" : "translate-x-0.5 bg-surface border border-input-border"}`} />
        <span className="sr-only">{on ? "On" : "Off"}</span>
      </button>
      {name ? <input type="hidden" name={name} value={on ? "on" : ""} /> : null}
    </div>
  );
}
