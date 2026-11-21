"use client";

import { useActionState, useEffect, useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { FileDrop } from "@/components/FileDrop";
import { keepValues } from "@/components/forms";
import { toast } from "@/components/Toast";
import { Button, CompanyLogo, Field, inputClass, textAreaClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";
import { saveAgency, setAgencyLogo, type AgencyState } from "./actions";

type Values = { id: string; name: string; slug: string; website: string; about: string; logo_url: string | null };

const LOGO_TYPES = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "image/svg+xml": "SVG" };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export function AgencyForm({ values, canEdit }: { values: Values; canEdit: boolean }) {
  const [state, action, pending] = useActionState<AgencyState, FormData>(saveAgency, {});
  const [logo, setLogoUrl] = useState(values.logo_url);
  const [uploading, setUploading] = useState(false);
  const e = state.errors ?? {};
  useEffect(() => { if (state.savedAt) toast("Agency saved"); }, [state.savedAt]);
  const err = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true, "aria-describedby": `agency-${k}-error` } : {});

  const upload = async (file: File) => {
    setUploading(true);
    const path = `agencies/${values.id}/${Date.now()}.${EXT[file.type]}`;
    const { error } = await createClient().storage.from("logos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    const saved = !error && (await setAgencyLogo(path)).ok;
    setUploading(false);
    if (!saved) return toast("The logo didn't upload. Try again.");
    setLogoUrl(createClient().storage.from("logos").getPublicUrl(path).data.publicUrl);
    toast("Logo saved");
  };

  const removeLogo = async () => {
    if (!(await askConfirm({ title: "Remove the logo?", confirm: "Remove logo", danger: true }))) return;
    if ((await setAgencyLogo(null)).ok) { setLogoUrl(null); toast("Logo removed"); }
  };

  return (
    <section className="flex max-w-[760px] flex-col gap-10 border-t border-border pt-8">
      <div className="flex flex-col gap-4">
        <h2 className="text-card font-bold">Agency logo</h2>
        <div className="flex items-center gap-4">
          <CompanyLogo name={values.name} src={logo} size={72} />
          {logo && canEdit ? <Button variant="ghost" onClick={removeLogo}>Remove logo</Button> : null}
        </div>
        {canEdit ? (
          <FileDrop label="Upload a logo" accept={LOGO_TYPES} maxBytes={1024 * 1024} onFile={upload} disabled={uploading}
            hint={uploading ? "Uploading" : "Square works best. PNG, JPG, WebP or SVG, up to 1 MB"} />
        ) : null}
      </div>

      <form onSubmit={keepValues(action)} className="flex flex-col gap-6" noValidate>
        <h2 className="text-card font-bold">Agency details</h2>
        <fieldset disabled={!canEdit} className="flex flex-col gap-6">
          <Field label="Agency name" htmlFor="agency-name" error={e.name}>
            <input id="agency-name" name="name" defaultValue={values.name} required maxLength={120} className={inputClass} {...err("name")} />
          </Field>
          <Field label="Address on Ocelot" htmlFor="agency-slug" error={e.slug}>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-meta text-muted">joinocelot.com/agencies/</span>
              <input id="agency-slug" name="slug" defaultValue={values.slug} required maxLength={60} className={inputClass} {...err("slug")} />
            </div>
          </Field>
          <Field label="Website" htmlFor="agency-website" error={e.website}>
            <input id="agency-website" name="website" defaultValue={values.website} placeholder="example.com" className={inputClass} {...err("website")} />
          </Field>
          <Field label="About" htmlFor="agency-about" error={e.about}>
            <textarea id="agency-about" name="about" defaultValue={values.about} maxLength={2000} className={textAreaClass} {...err("about")} />
          </Field>
        </fieldset>
        {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
        {canEdit ? <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">{pending ? "Saving" : "Save agency"}</Button> : null}
      </form>
    </section>
  );
}
