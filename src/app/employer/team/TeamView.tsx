"use client";

import { useActionState, useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Menu, type MenuItem } from "@/components/Menu";
import { Modal } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, CompanyLogo, Field, inputClass, Table, Tag, Td, Th } from "@/components/ui";
import type { Role } from "@/lib/org";
import { cancelInvite, changeRole, invite, removeMember, type InviteState } from "./actions";

type Member = { user_id: string; role: Role; full_name: string | null; email: string };
type Invite = { id: string; email: string; role: string; expires_at: string };

const ROLE_NAME: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function TeamView({ me, myRole, company, members, invites }: { me: string; myRole: Role; company: string; members: Member[]; invites: Invite[] }) {
  const [open, setOpen] = useState(false);
  const manage = myRole === "owner" || myRole === "admin";
  const owners = members.filter((m) => m.role === "owner").length;

  const run = async (p: Promise<{ ok: boolean; message?: string }>, done: string) => {
    const r = await p;
    toast(r.ok ? done : r.message ?? "That didn't work. Try again.");
  };

  const actions = (m: Member): MenuItem[] => {
    const self = m.user_id === me;
    const name = m.full_name || m.email;
    const items: MenuItem[] = [];
    const canTouch = myRole === "owner" || (myRole === "admin" && m.role !== "owner");
    if (canTouch && !self) {
      for (const r of (myRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"]) as Role[]) {
        if (r !== m.role) items.push({ label: `Make ${ROLE_NAME[r].toLowerCase()}`, onSelect: () => run(changeRole(m.user_id, r), `${name} is now ${ROLE_NAME[r].toLowerCase()}`) });
      }
      items.push({
        label: "Remove from company", danger: true,
        onSelect: async () => {
          if (await askConfirm({ title: `Remove ${name}?`, body: `They lose access to ${company}'s jobs and applicants.`, confirm: "Remove member", danger: true })) {
            await run(removeMember(m.user_id), `${name} was removed`);
          }
        },
      });
    }
    if (self && m.role === "owner" && owners > 1) {
      items.push({ label: "Step down to admin", onSelect: () => run(changeRole(m.user_id, "admin"), "You're now an admin") });
    }
    if (self) {
      items.push({
        label: "Leave company", danger: true,
        disabled: m.role === "owner" && owners === 1,
        onSelect: async () => {
          if (await askConfirm({ title: `Leave ${company}?`, body: "You lose access to its jobs and applicants until someone invites you again.", confirm: "Leave company", danger: true })) {
            await run(removeMember(m.user_id), "You left the company");
          }
        },
      });
    }
    return items;
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Team</h1>
        {manage ? <Button onClick={() => setOpen(true)}>Invite people</Button> : null}
      </div>

      <Table label="Members">
        <thead><tr><Th>Member</Th><Th>Role</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {members.map((m) => {
            const items = actions(m);
            return (
              <tr key={m.user_id}>
                <Td>
                  <span className="flex items-center gap-3">
                    <CompanyLogo name={m.full_name || m.email} size={32} />
                    <span className="flex flex-col">
                      <span className="font-bold">{m.full_name || m.email}{m.user_id === me ? " (you)" : ""}</span>
                      {m.full_name ? <span className="text-meta text-muted">{m.email}</span> : null}
                    </span>
                  </span>
                </Td>
                <Td><Tag>{ROLE_NAME[m.role]}</Tag></Td>
                <Td>{items.length ? <Menu label={`Actions for ${m.full_name || m.email}`} items={items} /> : null}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {owners === 1 && myRole === "owner" ? <p className="-mt-6 text-meta text-muted">To leave, make someone else an owner first.</p> : null}

      {manage && invites.length ? (
        <section>
          <h2 className="mb-3 text-card font-bold">Open invites</h2>
          <Table label="Open invites">
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Expires</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}</Td>
                  <Td><Tag tone="warning">{ROLE_NAME[i.role]}, invited</Tag></Td>
                  <Td className="text-meta">{new Date(i.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Td>
                  <Td><Menu label={`Actions for invite to ${i.email}`} items={[{ label: "Cancel invite", danger: true, onSelect: () => run(cancelInvite(i.id), "Invite cancelled") }]} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}

      {manage ? <InviteDialog open={open} onClose={() => setOpen(false)} company={company} /> : null}
    </div>
  );
}

function InviteDialog({ open, onClose, company }: { open: boolean; onClose: () => void; company: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(invite, {});
  // A result stays on screen until it's dismissed; the next send gives a new result object.
  const [dismissed, setDismissed] = useState<InviteState | null>(null);
  const [round, setRound] = useState(0);
  const fresh = state !== dismissed;
  const sent = fresh ? state.sentTo : undefined;
  const error = fresh ? state.error : undefined;
  const again = () => { setDismissed(state); setRound((r) => r + 1); };
  const close = () => { onClose(); again(); };

  return (
    <Modal open={open} onClose={close} title={`Invite people to ${company}`} footer={
      sent ? (
        <>
          <Button variant="ghost" onClick={again}>Invite another</Button>
          <Button onClick={close}>Done</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" form="invite-form" disabled={pending} aria-busy={pending}>{pending ? "Sending" : "Send invite"}</Button>
        </>
      )
    }>
      {sent ? (
        <p role="status">We emailed <strong>{sent}</strong> a link to join. It works for 7 days.</p>
      ) : (
        <form id="invite-form" key={round} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="invite-email" error={error}>
            <input id="invite-email" name="email" type="email" required autoFocus className={inputClass}
              aria-invalid={Boolean(error)} aria-describedby={error ? "invite-email-error" : undefined} />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select id="invite-role" name="role" defaultValue="member" options={[
              { value: "member", label: "Member: jobs and applicants" },
              { value: "admin", label: "Admin: also company settings and team" },
            ]} />
          </Field>
        </form>
      )}
    </Modal>
  );
}
