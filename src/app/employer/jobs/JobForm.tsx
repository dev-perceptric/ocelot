"use client";

import { useActionState, useEffect, useState } from "react";
import { keepValues } from "@/components/forms";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Field, IconButton, inputClass, textAreaClass } from "@/components/ui";
import { X } from "lucide-react";
import { SENIORITIES, TYPES } from "@/lib/jobForm";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { CITIES, COUNTRIES } from "@/lib/places";
import { CATEGORIES, CURRENCIES, PERIODS, ROLES } from "@/lib/taxonomy";
import { saveJob, type JobState } from "./actions";

export type JobValues = {
  id: string | null; title: string; role: string | null; seniority: string | null; employment_type: string | null;
  workplace: string | null; office_places: string[]; eligible_countries: string[];
  salary_min: string; salary_max: string; salary_currency: string | null; salary_period: string | null;
  description: string; apply_method: "ocelot" | "external"; apply_url: string; questions: string[];
};

const roleOptions = ROLES.map((r) => ({ value: r.slug, label: r.name, group: CATEGORIES.find((c) => c.slug === r.category)?.name }));
const cityOptions = CITIES.map((c) => ({ value: c.slug, label: c.name, group: COUNTRIES.find((k) => k.country_code === c.country_code)?.name }));
const countryOptions = COUNTRIES.map((c) => ({ value: c.country_code, label: c.name }));
const WORKPLACE_CHOICES = [
  { value: "remote", label: "Remote", line: "Work from anywhere in the countries you choose" },
  { value: "hybrid", label: "Hybrid", line: "Some days in the office" },
  { value: "on_site", label: "On-site", line: "In the office every day" },
];

export function JobForm({ values, live, trusted }: { values: JobValues; live: boolean; trusted: boolean }) {
  const [state, action, pending] = useActionState<JobState, FormData>(saveJob, {});
  const [workplace, setWorkplace] = useState(values.workplace);
  const [applyMethod, setApplyMethod] = useState(values.apply_method === "ocelot" && !values.id ? "external" : values.apply_method);
  const [questions, setQuestions] = useState(values.questions.length ? values.questions : []);
  const [descLength, setDescLength] = useState(values.description.length);
  const e = state.errors ?? {};
  useEffect(() => { if (state.savedAt && !state.error) toast("Job saved"); }, [state.savedAt, state.error]);
  const err = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-10" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Group title="The role">
        <Field label="Job title" htmlFor="title" error={e.title}>
          <input id="title" name="title" defaultValue={values.title} required maxLength={140} placeholder="Marketing Manager" className={inputClass} {...err("title")} />
        </Field>
        <Field label="Role" htmlFor="role" error={e.role}>
          <Select id="role" name="role" options={roleOptions} defaultValue={values.role} placeholder="Choose a role" invalid={Boolean(e.role)} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Seniority" htmlFor="seniority" error={e.seniority}>
            <Select id="seniority" name="seniority" options={SENIORITIES.map((s) => ({ value: s, label: SENIORITY[s] }))} defaultValue={values.seniority} placeholder="Choose seniority" />
          </Field>
          <Field label="Employment type" htmlFor="employment_type" error={e.employment_type}>
            <Select id="employment_type" name="employment_type" options={TYPES.map((t) => ({ value: t, label: EMPLOYMENT[t] }))} defaultValue={values.employment_type} placeholder="Choose a type" />
          </Field>
        </div>
      </Group>

      <Group title="Where">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-meta font-bold">Workplace</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {WORKPLACE_CHOICES.map((w) => (
              <label key={w.value} className="flex cursor-pointer flex-col gap-1 border border-border bg-surface p-4 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)] rounded-[var(--radius-card)]">
                <span className="flex items-center gap-3">
                  <input type="radio" name="workplace" value={w.value} defaultChecked={values.workplace === w.value} onChange={() => setWorkplace(w.value)} className="size-5 accent-ink" />
                  <span className="font-bold">{w.label}</span>
                </span>
                <span className="pl-8 text-meta text-muted">{w.line}</span>
              </label>
            ))}
          </div>
          {e.workplace ? <p className="text-meta text-danger">{e.workplace}</p> : null}
        </fieldset>
        {workplace === "on_site" || workplace === "hybrid" ? (
          <Field label="Office cities" htmlFor="office_places" error={e.office_places}>
            <Select id="office_places" name="office_places" multiple options={cityOptions} defaultValue={values.office_places} placeholder="Choose cities" />
          </Field>
        ) : null}
        <Field label="Countries you can hire from" htmlFor="eligible_countries" error={e.eligible_countries}>
          <Select id="eligible_countries" name="eligible_countries" multiple options={countryOptions} defaultValue={values.eligible_countries} placeholder="Choose countries" />
        </Field>
      </Group>

      <Group title="Pay">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_160px]">
          <div><label htmlFor="salary_min" className="text-meta font-bold">From</label><input id="salary_min" name="salary_min" inputMode="numeric" defaultValue={values.salary_min} placeholder="1,500" className={`${inputClass} mt-2`} /></div>
          <div><label htmlFor="salary_max" className="text-meta font-bold">To</label><input id="salary_max" name="salary_max" inputMode="numeric" defaultValue={values.salary_max} placeholder="2,500" className={`${inputClass} mt-2`} /></div>
          <div><span className="text-meta font-bold">Currency</span><div className="mt-2"><Select name="salary_currency" aria-label="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={values.salary_currency ?? "USD"} /></div></div>
          <div><span className="text-meta font-bold">Period</span><div className="mt-2"><Select name="salary_period" aria-label="Period" options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} defaultValue={values.salary_period ?? "month"} /></div></div>
        </div>
        {e.salary ? <p className="text-meta text-danger" role="alert">{e.salary}</p> : null}
      </Group>

      <Group title="Description">
        <Field label="About the job" htmlFor="description" error={e.description}>
          <textarea id="description" name="description" defaultValue={values.description} maxLength={10000} onChange={(ev) => setDescLength(ev.target.value.trim().length)}
            className={`${textAreaClass} min-h-72`} placeholder={"What the team does\nWhat you'll do\nWhat you bring\nHow hiring works"} {...err("description")} />
        </Field>
        <p className={`-mt-4 text-meta ${descLength < 200 ? "text-muted" : "text-success"}`}>{descLength} of at least 200 characters</p>
      </Group>

      <Group title="Applications">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">How people apply</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="apply_method" value="external" checked={applyMethod === "external"} onChange={() => setApplyMethod("external")} className="size-5 accent-ink" />
            On our own site
          </label>
          <label className="flex min-h-11 items-center gap-3 text-muted">
            <input type="radio" name="apply_method" value="ocelot" checked={applyMethod === "ocelot"} onChange={() => setApplyMethod("ocelot")} disabled={values.apply_method !== "ocelot" || !values.id} className="size-5 accent-ink" />
            On Ocelot (opens soon)
          </label>
        </fieldset>
        {applyMethod === "external" ? (
          <Field label="Where people apply" htmlFor="apply_url" error={e.apply_url}>
            <input id="apply_url" name="apply_url" defaultValue={values.apply_url} placeholder="example.com/careers/marketing-manager" className={inputClass} {...err("apply_url")} />
          </Field>
        ) : null}
        {applyMethod === "ocelot" ? (
        <div className="flex flex-col gap-3">
          <p className="text-meta font-bold">Screening questions</p>
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`q-${i}`} className="sr-only">Question {i + 1}</label>
              <input id={`q-${i}`} name="questions" value={q} maxLength={300} onChange={(ev) => setQuestions(questions.map((x, j) => (j === i ? ev.target.value : x)))} className={inputClass} />
              <IconButton label={`Remove question ${i + 1}`} onClick={() => setQuestions(questions.filter((_, j) => j !== i))}><X size={20} aria-hidden /></IconButton>
            </div>
          ))}
          {questions.length < 5 ? <Button type="button" variant="outline" className="self-start" onClick={() => setQuestions([...questions, ""])}>Add a question</Button> : null}
          {e.questions ? <p className="text-meta text-danger">{e.questions}</p> : null}
        </div>
        ) : null}
      </Group>

      {state.error ? <p className="border border-danger bg-danger-bg p-4 text-body text-danger rounded-[var(--radius-card)]" role="alert">{state.error}</p> : null}
      {Object.keys(e).length ? <p className="text-meta text-danger" role="alert">Check the fields marked above.</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <Button type="submit" name="intent" value="save" disabled={pending} aria-busy={pending}>{pending ? "Saving" : "Save changes"}</Button>
        ) : (
          <>
            <Button type="submit" name="intent" value="review" disabled={pending} aria-busy={pending}>{pending ? "Sending" : trusted ? "Publish" : "Send for review"}</Button>
            <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>Save draft</Button>
          </>
        )}
      </div>
      {live && !trusted ? <p className="-mt-6 text-meta text-muted">Changes go to review before candidates see them.</p> : null}
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-border pt-6">
      <h2 className="text-card font-bold">{title}</h2>
      {children}
    </section>
  );
}
