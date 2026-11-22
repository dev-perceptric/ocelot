"use client";

import {
  ArrowLeftRight, Briefcase, Building2, ChevronsUpDown, Contact, CreditCard, Database, FileText, Flag, History, Inbox,
  LayoutDashboard, ListTodo, LogOut, Mail, Network, Search, Settings, Shapes, ShieldCheck, SquareKanban, UserRound, Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { Floating } from "@/components/Floating";

const ICONS = {
  dashboard: LayoutDashboard, search: Search, tracker: SquareKanban, tasks: ListTodo, resume: FileText, profile: UserRound,
  settings: Settings, jobs: Briefcase, applicants: Users, company: Building2, team: Contact, billing: CreditCard,
  agency: Network, review: ShieldCheck, reports: Flag, sources: Database, people: UserRound, queue: Inbox, emails: Mail,
  audit: History, parts: Shapes,
} satisfies Record<string, LucideIcon>;

// One page in the sidebar. exact: only that address counts as open (an overview whose pages sit under it).
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; section?: string; exact?: boolean };

export function SideNav({ nav }: { nav: NavItem[] }) {
  const path = usePathname();
  // The longest matching address is the open page, so /employer/agency/team doesn't also light up /employer/agency.
  const open = nav
    .filter((n) => (n.exact ? path === n.href : path === n.href || path.startsWith(`${n.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const sections: { title?: string; items: NavItem[] }[] = [];
  for (const n of nav) {
    const last = sections[sections.length - 1];
    if (last && last.title === n.section) last.items.push(n);
    else sections.push({ title: n.section, items: [n] });
  }
  return (
    <nav aria-label="Workspace" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-5 md:overflow-y-auto md:px-0">
      {sections.map((s, i) => (
        <div key={s.title ?? i} className="flex gap-1 md:flex-col md:gap-0.5">
          {s.title ? <p className="hidden px-3 pb-1 text-label font-bold uppercase tracking-wide text-muted md:block">{s.title}</p> : null}
          {s.items.map((n) => {
            const Icon = ICONS[n.icon];
            const on = n.href === open;
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-3 whitespace-nowrap px-3 text-body rounded-[var(--radius-control)] ${on ? "bg-brand font-bold text-ink" : "text-ink hover:bg-canvas"}`}>
                <Icon size={18} strokeWidth={on ? 2.25 : 1.75} aria-hidden className="shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// The person at the bottom of the sidebar: their email, and a menu with Settings, the other side of Ocelot and Log out.
// compact: just the initial, for the phone top bar.
export function AccountBox({ email, switchTo, compact = false }: { email: string; switchTo?: { href: string; label: string }; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const row = "flex min-h-11 w-full items-center gap-3 px-4 text-left text-body hover:bg-canvas focus:bg-canvas focus:outline-none";
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-haspopup="menu"
        aria-label={compact ? `Account: ${email}` : undefined}
        className={compact ? "flex items-center hover:opacity-85" : "flex w-full items-center gap-3 border border-border p-2 text-left hover:bg-canvas rounded-[var(--radius-control)]"}>
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center bg-ink text-body font-bold uppercase text-surface rounded-[var(--radius-control)]">
          {email.slice(0, 1) || "?"}
        </span>
        {compact ? null : <span className="min-w-0 flex-1 truncate text-meta">{email}</span>}
        {compact ? null : <ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />}
      </button>
      <Floating anchor={anchor} open={open} onClose={close} matchWidth={!compact} align={compact ? "end" : "start"} id={id} role="menu" label="Account">
        <div className="py-1">
          <Link role="menuitem" href="/app/settings" className={row} onClick={close}><Settings size={18} strokeWidth={1.75} aria-hidden />Account settings</Link>
          {switchTo ? (
            <Link role="menuitem" href={switchTo.href} className={row} onClick={close}><ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden />{switchTo.label}</Link>
          ) : null}
          <form action="/auth/signout" method="post">
            <button role="menuitem" type="submit" className={row}><LogOut size={18} strokeWidth={1.75} aria-hidden />Log out</button>
          </form>
        </div>
      </Floating>
    </>
  );
}
