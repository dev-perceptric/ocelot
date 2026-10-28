"use client";

import { useActionState, useEffect, useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { FileDrop } from "@/components/FileDrop";
import { keepValues } from "@/components/forms";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, CompanyLogo, Field, inputClass, textAreaClass } from "@/components/ui";
import { SIZE_LABEL, SIZES } from "@/lib/company";
import { CITIES, COUNTRIES } from "@/lib/places";
import { createClient } from "@/lib/supabase/browser";
import { saveCompany, setLogo, type CompanyState } from "./actions";

export type CompanyValues = {
  id: string; name: string; slug: string; website: string; about: string; size: string | null;
  industry: string; office_places: string[]; logo_url: string | null;
};

const cityOptions = CITIES.map((c) => ({ value: c.slug, label: c.name, group: COUNTRIES.find((k) => k.country_code === c.country_code)?.name }));
const LOGO_TYPES = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "image/svg+xml": "SVG" };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export function CompanyForm({ values, canEdit }: { values: CompanyValues; canEdit: boolean }) {
  const [state, action, pending] = useActionState<CompanyState, FormData>(saveCompany, {});
  const [logo, setLogoUrl] = useState(values.logo_url);
  const [uploading, setUploading] = useState(false);
  const e = state.errors ?? {};
  useEffect(() => { if (state.savedAt) toast("Company saved"); }, [state.savedAt]);
  const err = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  const upload = async (file: File) => {
    setUploading(true);
    const path = `${values.id}/${Date.now()}.${EXT[file.type]}`;
    const { error } = await createClient().storage.from("logos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    const saved = !error && (await setLogo(path)).ok;
    setUploading(false);
    if (!saved) return toast("The logo didn't upload. Try again.");
    setLogoUrl(createClient().storage.from("logos").getPublicUrl(path).data.publicUrl);
    toast("Logo saved");
  };

  const removeLogo = async () => {
    if (!(await askConfirm({ title: "Remove the logo?", confirm: "Remove logo", danger: true }))) return;
    if ((await setLogo(null)).ok) { setLogoUrl(null); toast("Logo removed"); }
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-card font-bold">Logo</h2>
        <div className="flex items-center gap-4">
          <CompanyLogo name={values.name} src={logo} size={72} />
          {logo && canEdit ? <Button variant="ghost" onClick={removeLogo}>Remove logo</Button> : null}
        </div>
        {canEdit ? (
          <FileDrop label="Upload a logo" accept={LOGO_TYPES} maxBytes={1024 * 1024} onFile={upload} disabled={uploading}
            hint={uploading ? "Uploading" : "Square works best. PNG, JPG, WebP or SVG, up to 1 MB"} />
        ) : null}
      </section>

      <form onSubmit={keepValues(action)} className="flex flex-col gap-6 border-t border-border pt-6" noValidate>
        <h2 className="text-card font-bold">Details</h2>
        <fieldset disabled={!canEdit} className="flex flex-col gap-6">
          <Field label="Company name" htmlFor="name" error={e.name}>
            <input id="name" name="name" defaultValue={values.name} required maxLength={120} className={inputClass} {...err("name")} />
          </Field>
          <Field label="Address on Ocelot" htmlFor="slug" error={e.slug}>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-meta text-muted">joinocelot.com/companies/</span>
              <input id="slug" name="slug" defaultValue={values.slug} required maxLength={60} className={inputClass} {...err("slug")} />
            </div>
          </Field>
          <Field label="Website" htmlFor="website" error={e.website}>
            <input id="website" name="website" defaultValue={values.website} placeholder="example.com" className={inputClass} {...err("website")} />
          </Field>
          <Field label="About" htmlFor="about" error={e.about}>
            <textarea id="about" name="about" defaultValue={values.about} maxLength={2000} className={textAreaClass} {...err("about")} />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Size" htmlFor="size" error={e.size}>
              <Select id="size" name="size" options={SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] }))} defaultValue={values.size} placeholder="Choose a size" disabled={!canEdit} />
            </Field>
            <Field label="Industry" htmlFor="industry" error={e.industry}>
              <input id="industry" name="industry" defaultValue={values.industry} maxLength={80} placeholder="Software" className={inputClass} {...err("industry")} />
            </Field>
          </div>
          <Field label="Office cities" htmlFor="office_places" error={e.office_places}>
            <Select id="office_places" name="office_places" multiple options={cityOptions} defaultValue={values.office_places} placeholder="Choose cities" disabled={!canEdit} />
          </Field>
        </fieldset>
        {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
        {canEdit ? <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">{pending ? "Saving" : "Save company"}</Button> : null}
      </form>
    </div>
  );
}
