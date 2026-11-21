"use client";

import { useActionState, useState } from "react";
import { askConfirm, Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Menu, type MenuItem } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { Button, CompanyLogo, Empty, Field, inputClass, Table, Tag, Td, Th } from "@/components/ui";
import type { AgencyRole } from "@/lib/agency";
import { addClient, askClient, deleteClient, openClient, removeClient, type ClientState } from "./actions";

export type Client = { id: string; name: string; slug: string; logo_url: string | null; liveJobs: number; ownTeam: boolean };
export type ClientRequest = { id: string; org_name: string; created_at: string; answered_at: string | null; accepted: boolean | null };

export function AgencyClients({ agency, role, clients, requests, suspended }: {
  agency: string; role: AgencyRole; clients: Client[]; requests: ClientRequest[]; suspended: boolean;
}) {
  const [open, setOpen] = useState(false);
  const manage = (role === "owner" || role === "admin") && !suspended;

  const run = async (p: Promise<{ ok: boolean; message?: string }>, done: string) => {
    const r = await p;
    toast(r.ok ? done : r.message ?? "That didn't work. Try again.");
  };

  const menu = (c: Client): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Open", onSelect: () => void openClient(c.id) }];
    if (c.ownTeam && (role === "owner" || role === "admin")) {
      items.push({
        label: "Remove from clients", danger: true,
        onSelect: async () => {
          if (await askConfirm({ title: `Remove ${c.name}?`, body: `Your agency loses access to ${c.name}'s jobs and applicants right away. The company and its jobs stay with its own team.`, confirm: "Remove client", danger: true })) {
            await run(removeClient(c.id), `${c.name} is no longer a client`);
          }
        },
      });
    }
    if (!c.ownTeam && role === "owner") {
      items.push({
        label: "Delete client", danger: true,
        onSelect: async () => {
          if (await askConfirm({ title: `Delete ${c.name}?`, body: `This deletes the company page, its jobs and the applications sent to them. Candidates keep their own tracker cards. This can't be undone.`, confirm: "Delete client", danger: true })) {
            await run(deleteClient(c.id), `${c.name} was deleted`);
          }
        },
      });
    }
    return items;
  };

  const waiting = requests.filter((r) => !r.answered_at);
  const answered = requests.filter((r) => r.answered_at);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-card font-bold">Clients</h2>
        {manage ? <Button onClick={() => setOpen(true)}>Add a client</Button> : null}
      </div>

      {clients.length ? (
        <Table label="Clients">
          <thead><tr><Th>Company</Th><Th>Team</Th><Th>Live jobs</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <Td>
                  <button type="button" onClick={() => void openClient(c.id)} className="flex items-center gap-3 text-left font-bold hover:underline">
                    <CompanyLogo name={c.name} src={c.logo_url} size={32} />
                    {c.name}
                  </button>
                </Td>
                <Td><Tag>{c.ownTeam ? "Has its own team" : "Run by your agency"}</Tag></Td>
                <Td>{c.liveJobs}</Td>
                <Td><Menu label={`Actions for ${c.name}`} items={menu(c)} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty title="No clients yet" line={`Add the companies ${agency} hires for. Each one gets its own company page and jobs.`} />
      )}

      {waiting.length || answered.length ? (
        <ul className="flex flex-col gap-2">
          {waiting.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-body"><Tag tone="warning">Waiting</Tag>{r.org_name} hasn&apos;t answered yet.</li>
          ))}
          {answered.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-body">
              {r.accepted ? <Tag tone="success">Accepted</Tag> : <Tag>Declined</Tag>}
              {r.org_name} {r.accepted ? "said yes." : "said no."}
            </li>
          ))}
        </ul>
      ) : null}

      {manage ? <AddClientDialog open={open} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function AddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newState, newAction, newPending] = useActionState<ClientState, FormData>(addClient, {});
  const [askState, askAction, askPending] = useActionState<ClientState, FormData>(askClient, {});
  const [dismissed, setDismissed] = useState<ClientState[]>([]);
  const [round, setRound] = useState(0);
  const state = mode === "new" ? newState : askState;
  const fresh = !dismissed.includes(state);
  const done = fresh ? state.done : undefined;
  const error = fresh ? state.error : undefined;
  const pending = mode === "new" ? newPending : askPending;
  const again = () => { setDismissed((d) => [...d, newState, askState]); setRound((r) => r + 1); };
  const close = () => { onClose(); again(); };

  return (
    <Modal open={open} onClose={close} title="Add a client" footer={
      done ? (
        <>
          <Button variant="ghost" onClick={again}>Add another</Button>
          <Button onClick={close}>Done</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" form="client-form" disabled={pending} aria-busy={pending}>
            {mode === "new" ? (pending ? "Adding" : "Add client") : (pending ? "Sending" : "Send request")}
          </Button>
        </>
      )
    }>
      {done ? <p role="status">{done}</p> : (
        <div className="flex flex-col gap-5">
          <div className="flex gap-2" role="group" aria-label="Kind of client">
            <Button variant={mode === "new" ? "secondary" : "outline"} aria-pressed={mode === "new"} onClick={() => setMode("new")}>New company</Button>
            <Button variant={mode === "existing" ? "secondary" : "outline"} aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Already on Ocelot</Button>
          </div>
          {mode === "new" ? (
            <form id="client-form" key={`new-${round}`} onSubmit={keepValues(newAction)} className="flex flex-col gap-4" noValidate>
              <p className="text-meta text-muted">Your agency runs this company page. You can fill in its details after.</p>
              <Field label="Company name" htmlFor="client-name" error={error}>
                <input id="client-name" name="name" required maxLength={120} autoFocus className={inputClass}
                  aria-invalid={Boolean(error)} aria-describedby={error ? "client-name-error" : undefined} />
              </Field>
            </form>
          ) : (
            <form id="client-form" key={`ask-${round}`} onSubmit={keepValues(askAction)} className="flex flex-col gap-4" noValidate>
              <p className="text-meta text-muted">The company&apos;s owner gets an email and decides. Nothing changes until they say yes.</p>
              <Field label="Company page address" htmlFor="client-address" error={error}>
                <input id="client-address" name="address" required autoFocus placeholder="joinocelot.com/companies/example-co" className={inputClass}
                  aria-invalid={Boolean(error)} aria-describedby={error ? "client-address-error" : undefined} />
              </Field>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
