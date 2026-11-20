// Grey shapes that hold a page's layout while it loads, so nothing jumps when the data arrives. Never a spinner.
const block = "animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]";

function CardSkeleton() {
  return (
    <div className="flex gap-4 border border-border bg-surface p-5 rounded-[var(--radius-card)] md:p-6">
      <div className={`size-11 shrink-0 ${block}`} />
      <div className="flex flex-1 flex-col gap-2">
        <div className={`h-6 w-2/3 ${block}`} />
        <div className={`h-5 w-1/2 ${block}`} />
        <div className="flex gap-2"><div className={`h-6 w-16 ${block}`} /><div className={`h-6 w-20 ${block}`} /></div>
        <div className={`h-4 w-16 ${block}`} />
      </div>
    </div>
  );
}

// Find jobs and the role and place pages.
export function JobListSkeleton() {
  return (
    <div role="status" aria-label="Loading jobs" className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      <div className={`h-10 w-56 ${block}`} />
      <div className="mt-6 flex max-w-[860px] flex-col gap-3 sm:flex-row">
        <div className={`h-12 flex-1 ${block}`} />
        <div className={`h-12 sm:w-56 ${block}`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, i) => <div key={i} className={`h-11 w-24 ${block}`} />)}</div>
      <div className={`mt-5 h-5 w-32 ${block}`} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid content-start gap-4">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
        <div className="hidden h-[70vh] border border-border bg-surface p-8 rounded-[var(--radius-card)] lg:block">
          <div className={`h-8 w-3/4 ${block}`} />
          <div className={`mt-4 h-5 w-1/2 ${block}`} />
          <div className="mt-6 flex gap-3"><div className={`h-11 w-48 ${block}`} /><div className={`h-11 w-32 ${block}`} /></div>
          <div className="mt-8 flex flex-col gap-3">{Array.from({ length: 8 }, (_, i) => <div key={i} className={`h-5 ${block}`} style={{ width: `${95 - (i % 4) * 12}%` }} />)}</div>
        </div>
      </div>
    </div>
  );
}

// A job page.
export function JobPageSkeleton() {
  return (
    <div role="status" aria-label="Loading job" className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-center gap-3"><div className={`size-10 ${block}`} /><div className={`h-5 w-40 ${block}`} /></div>
          <div className={`mt-4 h-10 w-3/4 ${block}`} />
          <div className={`mt-3 h-5 w-1/2 ${block}`} />
          <div className="mt-10 flex flex-col gap-3">{Array.from({ length: 10 }, (_, i) => <div key={i} className={`h-5 ${block}`} style={{ width: `${95 - (i % 4) * 12}%` }} />)}</div>
        </div>
        <div className="flex h-fit flex-col gap-3 border border-border bg-surface p-6 rounded-[var(--radius-card)]">
          <div className={`h-11 ${block}`} /><div className={`h-11 ${block}`} /><div className={`h-4 w-24 ${block}`} />
        </div>
      </div>
    </div>
  );
}
