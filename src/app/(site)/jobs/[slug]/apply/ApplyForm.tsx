"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { keepValues } from "@/components/forms";
import { Select } from "@/components/Select";
import { Button, Field, inputClass, textAreaClass } from "@/components/ui";
import { UploadResume } from "@/app/app/resumes/ResumeParts";
import { applyToJob, type ApplyState } from "./actions";

type Question = { id: string; prompt: string; required: boolean };

export function ApplyForm({ slug, userId, email, profile, resumes, questions }: {
  slug: string; userId: string; email: string; profile: { full_name: string; phone: string };
  resumes: { id: string; name: string }[]; questions: Question[];
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyToJob, {});
  // A newly uploaded résumé arrives first in the list; pick it.
  const [seen, setSeen] = useState(resumes[0]?.id ?? "");
  const [resume, setResume] = useState(resumes[0]?.id ?? "");
  if ((resumes[0]?.id ?? "") !== seen) { setSeen(resumes[0]?.id ?? ""); setResume(resumes[0]?.id ?? ""); }
  const e = state.errors ?? {};
  const err = (k: string) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form onSubmit={keepValues(action)} className="mt-8 flex flex-col gap-6" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <section className="flex flex-col gap-4 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
        <h2 className="text-card font-bold">You</h2>
        <Field label="Full name" htmlFor="full_name" error={e.full_name}>
          <input id="full_name" name="full_name" defaultValue={profile.full_name} maxLength={120} autoComplete="name" className={inputClass} {...err("full_name")} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone" error={e.phone}>
          <input id="phone" name="phone" type="tel" defaultValue={profile.phone} autoComplete="tel" className={inputClass} {...err("phone")} />
        </Field>
        <p className="text-meta text-muted">The company also gets {email} and your <Link href="/app/profile" className="underline">profile</Link>: headline, city, experience, languages and links.</p>
      </section>

      <section className="flex flex-col gap-3 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
        <h2 className="text-card font-bold">Résumé</h2>
        {resumes.length ? (
          <Field label="Résumé to send" htmlFor="resume" error={e.resume}>
            <Select id="resume" name="resume" value={resume} onChange={(v) => setResume(v ?? "")} invalid={Boolean(e.resume)}
              options={resumes.map((r) => ({ value: r.id, label: r.name }))} />
          </Field>
        ) : e.resume ? <p id="resume-error" className="text-meta text-danger">{e.resume}</p> : null}
        <div><UploadResume userId={userId} label={resumes.length ? "Upload another" : "Upload résumé"} variant="outline" /></div>
      </section>

      {questions.length ? (
        <section className="flex flex-col gap-4 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
          <h2 className="text-card font-bold">Questions from the company</h2>
          {questions.map((q) => (
            <Field key={q.id} label={q.required ? q.prompt : `${q.prompt} (optional)`} htmlFor={`q_${q.id}`} error={e[`q_${q.id}`]}>
              <textarea id={`q_${q.id}`} name={`q_${q.id}`} rows={4} maxLength={2000} className={textAreaClass} {...err(`q_${q.id}`)} />
            </Field>
          ))}
        </section>
      ) : null}

      <Field label="Note to the company (optional)" htmlFor="note" error={e.note}>
        <textarea id="note" name="note" rows={5} maxLength={3000} className={textAreaClass} {...err("note")} />
      </Field>

      {state.error ? <p className="text-body text-danger" role="alert">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Sending" : "Send application"}</Button></div>
    </form>
  );
}
