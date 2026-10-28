"use client";

import { keepValues } from "@/components/forms";
import { useActionState, useEffect } from "react";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Checkbox, Field, inputClass } from "@/components/ui";
import { CITIES, COUNTRIES } from "@/lib/places";
import { CURRENCIES, LANGUAGES, PERIODS, WORKPLACES } from "@/lib/taxonomy";
import { saveProfile, type ProfileState } from "./actions";

export type ProfileValues = {
  full_name: string; headline: string; phone: string; city: string | null; years_experience: string;
  work_countries: string[]; languages: string[]; open_to: string[];
  salary_hope_min: string; salary_hope_currency: string | null; salary_hope_period: string | null;
  linkedin: string; website: string; time_zone: string;
};

const cityOptions = CITIES.map((c) => ({ value: c.slug, label: c.name, group: COUNTRIES.find((k) => k.country_code === c.country_code)?.name }));
const countryOptions = COUNTRIES.map((c) => ({ value: c.country_code, label: c.name }));
const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.name }));
const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));
const periodOptions = PERIODS.map((p) => ({ value: p.value, label: p.label }));

export function ProfileForm({ values, email, zones }: { values: ProfileValues; email: string; zones: string[] }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const e = state.errors ?? {};
  useEffect(() => { if (state.savedAt) toast("Profile saved"); }, [state.savedAt]);
  const err = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-10" noValidate>
      <Group title="About you">
        <Field label="Full name" htmlFor="full_name" error={e.full_name}>
          <input id="full_name" name="full_name" defaultValue={values.full_name} required maxLength={120} autoComplete="name" className={inputClass} {...err("full_name")} />
        </Field>
        <Field label="Headline" htmlFor="headline" error={e.headline}>
          <input id="headline" name="headline" defaultValue={values.headline} maxLength={140} placeholder="Content marketer for B2B software" className={inputClass} {...err("headline")} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Email" htmlFor="email">
            <input id="email" value={email} readOnly disabled className={inputClass} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={e.phone}>
            <input id="phone" name="phone" type="tel" defaultValue={values.phone} autoComplete="tel" className={inputClass} {...err("phone")} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={e.city}>
            <Select id="city" name="city" options={cityOptions} defaultValue={values.city} placeholder="Choose a city" invalid={Boolean(e.city)} />
          </Field>
          <Field label="Years of experience" htmlFor="years_experience" error={e.years_experience}>
            <input id="years_experience" name="years_experience" inputMode="numeric" defaultValue={values.years_experience} className={inputClass} {...err("years_experience")} />
          </Field>
        </div>
      </Group>

      <Group title="What you're looking for">
        <Field label="Countries you can work in" htmlFor="work_countries" error={e.work_countries}>
          <Select id="work_countries" name="work_countries" multiple options={countryOptions} defaultValue={values.work_countries} placeholder="Choose countries" invalid={Boolean(e.work_countries)} />
        </Field>
        <fieldset>
          <legend className="text-meta font-bold">Open to</legend>
          <div className="mt-1 flex flex-wrap gap-x-6">
            {WORKPLACES.map((w) => (
              <Checkbox key={w.value} id={`open_to_${w.value}`} name="open_to" value={w.value} label={w.label} defaultChecked={values.open_to.includes(w.value)} />
            ))}
          </div>
          {e.open_to ? <p className="text-meta text-danger">{e.open_to}</p> : null}
        </fieldset>
        <Field label="Languages" htmlFor="languages" error={e.languages}>
          <Select id="languages" name="languages" multiple options={languageOptions} defaultValue={values.languages} placeholder="Choose languages" />
        </Field>
        <div>
          <p className="text-meta font-bold">Salary you&apos;re looking for</p>
          <p className="text-meta text-muted">Only you can see this.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_140px_180px]">
            <div>
              <label htmlFor="salary_hope_min" className="sr-only">Amount</label>
              <input id="salary_hope_min" name="salary_hope_min" inputMode="numeric" defaultValue={values.salary_hope_min} placeholder="2,000" className={inputClass} {...err("salary_hope_min")} />
            </div>
            <Select name="salary_hope_currency" aria-label="Currency" options={currencyOptions} defaultValue={values.salary_hope_currency} placeholder="Currency" invalid={Boolean(e.salary_hope_currency)} />
            <Select name="salary_hope_period" aria-label="Period" options={periodOptions} defaultValue={values.salary_hope_period} placeholder="Period" invalid={Boolean(e.salary_hope_period)} />
          </div>
          {[e.salary_hope_min, e.salary_hope_currency, e.salary_hope_period].filter(Boolean).map((m) => (
            <p key={m} className="mt-2 text-meta text-danger">{m}</p>
          ))}
        </div>
      </Group>

      <Group title="Links">
        <Field label="LinkedIn" htmlFor="linkedin" error={e.linkedin}>
          <input id="linkedin" name="linkedin" defaultValue={values.linkedin} placeholder="linkedin.com/in/your-name" className={inputClass} {...err("linkedin")} />
        </Field>
        <Field label="Website or portfolio" htmlFor="website" error={e.website}>
          <input id="website" name="website" defaultValue={values.website} placeholder="yourname.com" className={inputClass} {...err("website")} />
        </Field>
      </Group>

      <Group title="Time zone">
        <Field label="Time zone" htmlFor="time_zone" error={e.time_zone}>
          <Select id="time_zone" name="time_zone" options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} defaultValue={values.time_zone} />
        </Field>
      </Group>

      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      {Object.keys(e).length ? <p className="text-meta text-danger" role="alert">Check the fields marked above.</p> : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">{pending ? "Saving" : "Save profile"}</Button>
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
