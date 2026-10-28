import Link from "next/link";
import { Wordmark } from "@/components/ui";

export function SiteHeader() {
  return (
    <header className="bg-brand">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
        <Link href="/" className="text-ink">
          <Wordmark className="text-[20px]" />
        </Link>
        <nav className="flex items-center gap-1 text-meta font-bold sm:gap-4 sm:text-body">
          <Link href="/jobs" className="px-2 py-2 hover:underline">Find jobs</Link>
          <Link href="/app" className="px-2 py-2 hover:underline">My search</Link>
          <Link href="/for-employers" className="hidden px-2 py-2 hover:underline sm:inline">For employers</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-10 text-meta text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <Wordmark className="text-ink" />
        <nav className="flex flex-wrap gap-4">
          <Link href="/jobs" className="hover:text-ink">Find jobs</Link>
          <Link href="/for-employers" className="hover:text-ink">For employers</Link>
          <Link href="/login" className="hover:text-ink">Log in</Link>
        </nav>
        <p>joinocelot.com</p>
      </div>
    </footer>
  );
}
