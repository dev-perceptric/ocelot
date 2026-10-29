"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { askConfirm, askText, Modal } from "@/components/Dialog";
import { FileDrop } from "@/components/FileDrop";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Table, Tag, Td, Th } from "@/components/ui";
import { RESUME_EXT, RESUME_MAX, RESUME_TYPES, fileSize, type ResumeType } from "@/lib/resumes";
import { createClient } from "@/lib/supabase/browser";
import { addResume, deleteResume, renameResume, setCardResume } from "./actions";

export type Resume = { id: string; name: string; mime_type: string; size_bytes: number; created_at: string; used: number };

export function UploadResume({ userId, label = "Upload résumé" }: { userId: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.${RESUME_EXT[file.type as ResumeType]}`;
    const { error } = await createClient().storage.from("resumes").upload(path, file, { contentType: file.type });
    const r = error ? { ok: false, message: "That file didn't upload. Try again." } : await addResume(path, file.name);
    setBusy(false);
    if (!r.ok) return toast(r.message ?? "That file didn't upload. Try again.");
    setOpen(false);
    toast("Résumé uploaded");
    router.refresh();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Upload a résumé">
        <FileDrop label="Résumé file" accept={RESUME_TYPES} maxBytes={RESUME_MAX} onFile={upload} disabled={busy}
          hint={busy ? "Uploading" : undefined} />
      </Modal>
    </>
  );
}

export function ResumeTable({ resumes }: { resumes: Resume[] }) {
  const router = useRouter();
  const rename = async (r: Resume) => {
    const name = await askText({ title: "Rename résumé", label: "Name", initial: r.name, confirm: "Save name" });
    if (name === null) return;
    const res = await renameResume(r.id, name);
    toast(res.ok ? "Name saved" : res.message ?? "That didn't save. Try again.");
    if (res.ok) router.refresh();
  };
  const remove = async (r: Resume) => {
    const ok = await askConfirm({
      title: `Delete ${r.name}?`,
      body: r.used ? `It's picked on ${r.used === 1 ? "1 job" : `${r.used} jobs`} in your tracker. Those cards will show no résumé.` : undefined,
      confirm: "Delete résumé", danger: true,
    });
    if (!ok) return;
    const res = await deleteResume(r.id);
    toast(res.ok ? "Résumé deleted" : res.message ?? "That didn't delete. Try again.");
    if (res.ok) router.refresh();
  };

  return (
    <Table label="Résumés">
      <thead>
        <tr><Th>Name</Th><Th>Type</Th><Th className="hidden sm:table-cell">Size</Th><Th className="hidden sm:table-cell">Added</Th><Th className="hidden md:table-cell">Used on</Th><Th><span className="sr-only">Actions</span></Th></tr>
      </thead>
      <tbody>
        {resumes.map((r) => (
          <tr key={r.id}>
            <Td><a href={`/app/resumes/${r.id}/download`} className="font-bold underline-offset-2 hover:underline">{r.name}</a></Td>
            <Td><Tag>{RESUME_TYPES[r.mime_type as ResumeType] ?? "File"}</Tag></Td>
            <Td className="hidden text-meta sm:table-cell">{fileSize(r.size_bytes)}</Td>
            <Td className="hidden text-meta sm:table-cell">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
            <Td className="hidden text-meta md:table-cell">{r.used ? (r.used === 1 ? "1 job" : `${r.used} jobs`) : ""}</Td>
            <Td className="w-12 text-right">
              <Menu label={`Actions for ${r.name}`} items={[
                { label: "Download", onSelect: () => { window.open(`/app/resumes/${r.id}/download`, "_self"); } },
                { label: "Rename", onSelect: () => rename(r) },
                { label: "Delete", onSelect: () => remove(r), danger: true },
              ]} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// On a tracker card: which résumé went with this job.
export function CardResume({ itemId, value, resumes }: { itemId: string; value: string | null; resumes: { id: string; name: string }[] }) {
  const [current, setCurrent] = useState(value ?? "");
  const pick = async (picked: string | null) => {
    const next = picked ?? "";
    const before = current;
    setCurrent(next);
    const r = await setCardResume(itemId, next || null);
    if (!r.ok) { setCurrent(before); toast(r.message ?? "That didn't save. Try again."); }
    else toast("Résumé saved");
  };
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`resume-${itemId}`} className="text-meta font-bold">Résumé used</label>
      <Select id={`resume-${itemId}`} value={current} onChange={pick} placeholder="None"
        options={[{ value: "", label: "None" }, ...resumes.map((r) => ({ value: r.id, label: r.name }))]} />
      {current ? <a href={`/app/resumes/${current}/download`} className="text-meta underline">Download</a> : null}
    </div>
  );
}
