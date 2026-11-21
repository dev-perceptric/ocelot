"use client";

import { useActionState, useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Menu, type MenuItem } from "@/components/Menu";
import { Modal } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, CompanyLogo, Field, inputClass, Table, Tag, Td, Th } from "@/components/ui";

// The team list for a company or an agency. Roles run from most to least access: the first is the owner.
export type TeamRole = { value: string; label: string; hint: string };
export type TeamMember = { user_id: string; role: string; full_name: string | null; email: string };
export type TeamInvite = { id: string; email: string; role: string; expires_at: string };
type Result = { ok: boolean; message?: string };
export type InviteState = { error?: string; sentTo?: string };
export type TeamActions = {
  invite: (s: InviteState, f: FormData) => Promise<InviteState>;
  cancelInvite: (id: string) => Promise<Result>;
  changeRole: (userId: string, role: string) => Promise<Result>;
  removeMember: (userId: string) => Promise<Result>;
};

export function TeamView({ me, myRole, place, kind, access, roles, members, invites, actions, intro }: {
  me: string;
  myRole: string | null;     // null: they see the list but can't change it
  place: string;             // the company or agency name
  kind: "company" | "agency";
  access: string;            // what members lose when they leave, like "jobs and applicants"
  roles: TeamRole[];
  members: TeamMember[];
  invites: TeamInvite[];
  actions: TeamActions;
  intro?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [owner, admin] = [roles[0].value, roles[1].value];
  const name = (v: string) => roles.find((r) => r.value === v)?.label ?? v;
  const manage = myRole === owner || myRole === admin;
  const owners = members.filter((m) => m.role === owner).length;

  const run = async (p: Promise<Result>, done: string) => {
    const r = await p;
    toast(r.ok ? done : r.message ?? "That didn't work. Try again.");
  };

  const menu = (m: TeamMember): MenuItem[] => {
    if (!myRole) return [];
    const self = m.user_id === me;
    const who = m.full_name || m.email;
    const items: MenuItem[] = [];
    const canTouch = myRole === owner || (myRole === admin && m.role !== owner);
    if (canTouch && !self) {
      for (const r of roles.filter((r) => myRole === owner || r.value !== owner)) {
        if (r.value !== m.role) items.push({ label: `Make ${r.label.toLowerCase()}`, onSelect: () => run(actions.changeRole(m.user_id, r.value), `${who} is now ${r.label.toLowerCase()}`) });
      }
      items.push({
        label: `Remove from ${kind}`, danger: true,
        onSelect: async () => {
          if (await askConfirm({ title: `Remove ${who}?`, body: `They lose access to ${place}'s ${access}.`, confirm: "Remove member", danger: true })) {
            await run(actions.removeMember(m.user_id), `${who} was removed`);
          }
        },
      });
    }
    if (self && m.role === owner && owners > 1) {
      items.push({ label: "Step down to admin", onSelect: () => run(actions.changeRole(m.user_id, admin), "You're now an admin") });
    }
    if (self) {
      items.push({
        label: `Leave ${kind}`, danger: true,
        disabled: m.role === owner && owners === 1,
        onSelect: async () => {
          if (await askConfirm({ title: `Leave ${place}?`, body: `You lose access to its ${access} until someone invites you again.`, confirm: `Leave ${kind}`, danger: true })) {
            await run(actions.removeMember(m.user_id), `You left the ${kind}`);
          }
        },
      });
    }
    return items;
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">{kind === "agency" ? "Agency team" : "Team"}</h1>
        {manage ? <Button onClick={() => setOpen(true)}>Invite people</Button> : null}
      </div>
      {intro}

      <Table label="Members">
        <thead><tr><Th>Member</Th><Th>Role</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {members.map((m) => {
            const items = menu(m);
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
                <Td><Tag>{name(m.role)}</Tag></Td>
                <Td>{items.length ? <Menu label={`Actions for ${m.full_name || m.email}`} items={items} /> : null}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {owners === 1 && myRole === owner ? <p className="-mt-6 text-meta text-muted">To leave, make someone else an owner first.</p> : null}

      {manage && invites.length ? (
        <section>
          <h2 className="mb-3 text-card font-bold">Open invites</h2>
          <Table label="Open invites">
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Expires</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}</Td>
                  <Td><Tag tone="warning">{name(i.role)}, invited</Tag></Td>
                  <Td className="text-meta">{new Date(i.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Td>
                  <Td><Menu label={`Actions for invite to ${i.email}`} items={[{ label: "Cancel invite", danger: true, onSelect: () => run(actions.cancelInvite(i.id), "Invite cancelled") }]} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}

      {manage ? <InviteDialog open={open} onClose={() => setOpen(false)} place={place} roles={roles.slice(1)} invite={actions.invite} /> : null}
    </div>
  );
}

function InviteDialog({ open, onClose, place, roles, invite }: {
  open: boolean; onClose: () => void; place: string; roles: TeamRole[]; invite: TeamActions["invite"];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(invite, {});
  // A result stays on screen until it's dismissed; the next send gives a new result object.
  const [dismissed, setDismissed] = useState<InviteState | null>(null);
  const [round, setRound] = useState(0);
  const fresh = state !== dismissed;
  const sent = fresh ? state.sentTo : undefined;
  const error = fresh ? state.error : undefined;
  const again = () => { setDismissed(state); setRound((r) => r + 1); };
  const close = () => { onClose(); again(); };
  const lowest = roles[roles.length - 1].value;

  return (
    <Modal open={open} onClose={close} title={`Invite people to ${place}`} footer={
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
            <Select id="invite-role" name="role" defaultValue={lowest}
              options={[...roles].reverse().map((r) => ({ value: r.value, label: `${r.label}: ${r.hint}` }))} />
          </Field>
        </form>
      )}
    </Modal>
  );
}
