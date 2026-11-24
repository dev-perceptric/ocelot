import { ButtonLink } from "@/components/ui";

// The "not here" message, shared by the site's 404 (inside the site layout) and the root 404 (which adds its own
// header and footer).
export function NotFoundBody() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-24 md:px-8">
      <h1 className="text-section-sm font-bold md:text-section">This page isn&apos;t here.</h1>
      <p className="mt-4 text-body">The job may have closed, or the link has a typo.</p>
      <ButtonLink href="/jobs" className="mt-8">Find jobs</ButtonLink>
    </div>
  );
}
