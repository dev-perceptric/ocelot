import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-24 md:px-8">
        <h1 className="text-section-sm font-bold md:text-section">This page isn&apos;t here.</h1>
        <p className="mt-4 text-body">The job may have closed, or the link has a typo.</p>
        <ButtonLink href="/jobs" className="mt-8">Find jobs</ButtonLink>
      </main>
      <SiteFooter />
    </div>
  );
}
