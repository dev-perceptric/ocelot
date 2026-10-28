import Link from "next/link";
import { Wordmark } from "@/components/ui";

// The signed-in shell: a 240px sidebar on desktop, a top bar on phones.
export function Workspace({ nav, email, children }: {
  nav: { href: string; label: string }[];
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-6 border-b border-border bg-surface p-5 md:min-h-screen md:border-b-0 md:border-r">
        <Link href="/"><Wordmark className="text-[18px]" /></Link>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap px-3 py-2 text-body font-bold hover:bg-canvas rounded-[var(--radius-control)]">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 text-meta text-muted md:flex">
          <span className="truncate">{email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="underline hover:text-ink">Log out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}
