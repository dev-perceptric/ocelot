"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { askConfirm, askText, Modal, tell } from "@/components/Dialog";
import { FileDrop } from "@/components/FileDrop";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import {
  Button, Checkbox, CompanyLogo, Empty, Field, IconButton, inputClass, Loading, RadioCards, Table, Tag, Td, textAreaClass, Th,
} from "@/components/ui";
import { CITIES } from "@/lib/places";
import { CURRENCIES, ROLES, categoryName } from "@/lib/taxonomy";

// Every shared part on one page, for checking the look and keyboard use. Admin only.
export function Parts() {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<string[]>(["ho-chi-minh-city"]);

  return (
    <div className="flex flex-col gap-12">
      <h1 className="text-title font-bold">Parts</h1>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Find jobs</Button>
          <Button variant="secondary">Post a job</Button>
          <Button variant="outline">Save job</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Remove member</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Edit"><Pencil size={20} strokeWidth={1.75} aria-hidden /></IconButton>
          <Menu label="More actions" items={[
            { label: "Edit", onSelect: () => toast("Edit picked") },
            { label: "Duplicate", onSelect: () => toast("Duplicate picked") },
            { label: "Delete", danger: true, onSelect: () => toast("Delete picked") },
          ]} />
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Job title" htmlFor="p-title"><input id="p-title" className={inputClass} placeholder="Marketing Manager" /></Field>
          <Field label="Job title" htmlFor="p-title-err" error="Add a job title.">
            <input id="p-title-err" className={`${inputClass} border-danger`} aria-invalid aria-describedby="p-title-err-error" />
          </Field>
          <Field label="Role" htmlFor="p-role">
            <Select id="p-role" options={ROLES.map((r) => ({ value: r.slug, label: r.name, group: categoryName(r.category) }))} placeholder="Choose a role" />
          </Field>
          <Field label="Currency" htmlFor="p-cur">
            <Select id="p-cur" options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue="USD" />
          </Field>
          <Field label="Office cities" htmlFor="p-cities">
            <Select id="p-cities" multiple value={cities} onChange={setCities} options={CITIES.map((c) => ({ value: c.slug, label: c.name }))} />
          </Field>
          <Field label="About the role" htmlFor="p-about"><textarea id="p-about" className={textAreaClass} /></Field>
          <div className="flex flex-col">
            <Checkbox id="p-check" label="Open to remote" defaultChecked />
            <Switch id="p-switch" label="Weekly digest" />
          </div>
          <FileDrop label="Logo" accept={{ "image/png": "PNG", "image/jpeg": "JPG", "image/svg+xml": "SVG" }} maxBytes={1024 * 1024} onFile={(f) => toast(`Picked ${f.name}`)} />
        </div>
        <div className="mt-6">
          <RadioCards name="intent" legend="What brings you to Ocelot?" options={[
            { value: "candidate", label: "Find a job", line: "Search roles and track every application." },
            { value: "employer", label: "Hire for my company", line: "Post roles and manage applicants." },
          ]} />
        </div>
      </Section>

      <Section title="Dialogs and messages">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>Open dialog</Button>
          <Button variant="outline" onClick={async () => toast((await askConfirm({ title: "Remove Ana from Acme?", body: "She loses access to jobs and applicants.", confirm: "Remove member", danger: true })) ? "Removed" : "Kept")}>Confirm</Button>
          <Button variant="outline" onClick={async () => { const v = await askText({ title: "Rename company", label: "Company name", initial: "Acme" }); if (v) toast(`Renamed to ${v}`); }}>Ask for text</Button>
          <Button variant="outline" onClick={() => tell({ title: "Invite sent", body: "We emailed ana@acme.test a link to join." })}>Tell</Button>
          <Button variant="outline" onClick={() => toast("Saved")}>Toast</Button>
        </div>
        <Modal open={open} onClose={() => setOpen(false)} title="Invite a teammate" footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { setOpen(false); toast("Invite sent"); }}>Send invite</Button>
          </>
        }>
          <Field label="Email" htmlFor="p-invite"><input id="p-invite" type="email" className={inputClass} /></Field>
        </Modal>
      </Section>

      <Section title="Status tags">
        <div className="flex flex-wrap gap-2">
          <Tag>Saved</Tag><Tag tone="info">Applied</Tag><Tag tone="progress">Interviewing</Tag><Tag tone="success">Accepted</Tag>
          <Tag tone="warning">Pending review</Tag><Tag tone="danger">Suspended</Tag><Tag>Rejected</Tag><Tag tone="brand">Promoted listing</Tag>
        </div>
      </Section>

      <Section title="Table and logos">
        <Table label="Members">
          <thead><tr><Th>Member</Th><Th>Role</Th><Th className="w-12"><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            <tr>
              <Td><span className="flex items-center gap-3"><CompanyLogo name="Ana Tran" size={32} />Ana Tran</span></Td>
              <Td><Tag>Owner</Tag></Td>
              <Td><Menu label="Actions for Ana Tran" items={[{ label: "Change role" }, { label: "Remove", danger: true }]} /></Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section title="Loading and empty">
        <div className="grid gap-6 md:grid-cols-2">
          <Loading />
          <Empty title="Your next move starts here." line="Save a job or add one you found elsewhere." action={<Button>Add a job</Button>} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-card font-bold">{title}</h2>
      {children}
    </section>
  );
}
