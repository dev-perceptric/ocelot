import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { AccountBox, SideNav, type NavItem } from "./WorkspaceNav";

export type { NavItem };

// The signed-in shell, one per side of Ocelot: job search (/app), hiring (/employer) and admin (/admin). A sidebar on
// desktop with icons, sections and the person's account at the bottom; a top bar with a scrolling row on phones.
// Each side shows only its own pages; the account menu switches between job search and hiring.
export function Workspace({ nav, email, top, space, switchTo, children }: {
  nav: NavItem[];
  email: string;
  top?: React.ReactNode; // above the nav, e.g. the company switcher
  space: string; // which side this is: "Job search", "Hiring", "Admin"
  switchTo?: { href: string; label: string }; // the other side, in the account menu
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[256px_1fr]">
      <aside className="flex flex-col gap-5 border-b border-border bg-surface px-4 py-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r md:py-5">
        <div className="flex items-center justify-between gap-3 px-2">
          <Link href="/" aria-label="Ocelot home"><Wordmark className="text-[18px]" /></Link>
          <span className="ml-auto whitespace-nowrap bg-canvas px-2 py-0.5 text-label font-bold text-muted rounded-[var(--radius-control)] md:ml-0">{space}</span>
          <div className="md:hidden"><AccountBox email={email} switchTo={switchTo} compact /></div>
        </div>
        {top ? <div className="px-1">{top}</div> : null}
        <SideNav nav={nav} />
        <div className="mt-auto hidden md:block">
          <AccountBox email={email} switchTo={switchTo} />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}
