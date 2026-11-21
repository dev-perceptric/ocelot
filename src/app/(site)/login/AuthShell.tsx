import { Bookmark, Briefcase, ListChecks, Search, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { signInWithGoogle } from "./actions";

// The frame around Log in, Sign up and the password pages: the form on the right, and on a wide screen a panel on the
// left saying what an account is for (for employers when they're headed to the employer side).
const SEEKER = {
  title: <>Land your next <span className="highlight text-ink">dream job.</span></>,
  points: [
    { icon: Search, line: "Search marketing, sales and customer success jobs" },
    { icon: Bookmark, line: "Save jobs from Ocelot and anywhere else" },
    { icon: ListChecks, line: "Track every application, from saved to signed offer" },
  ],
};
const EMPLOYER = {
  title: <>Meet your next <span className="highlight text-ink">great hire.</span></>,
  points: [
    { icon: Briefcase, line: "Post a job in a few minutes" },
    { icon: Users, line: "Applicants, stages and notes in one workspace" },
    { icon: ListChecks, line: "Bring your team, or run many clients as an agency" },
  ],
};

export function AuthShell({ next, children }: { next: string; children: React.ReactNode }) {
  const side = next.startsWith("/employer") ? EMPLOYER : SEEKER;
  return (
    <div className="grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <aside className="hidden flex-col justify-center bg-ink px-12 py-16 text-surface lg:flex xl:px-20">
        <p className="max-w-[480px] text-display-sm font-black">{side.title}</p>
        <ul className="mt-10 flex max-w-[440px] flex-col gap-5">
          {side.points.map(({ icon: Icon, line }) => (
            <li key={line} className="flex items-start gap-3 text-body">
              <span className="flex size-9 shrink-0 items-center justify-center bg-brand text-ink rounded-[var(--radius-control)]"><Icon size={18} strokeWidth={2} aria-hidden /></span>
              <span className="pt-1.5">{line}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex justify-center px-5 py-12 md:py-16 lg:items-center">
        <div className="w-full max-w-[420px]">
          {children}
          <p className="mt-8 text-meta text-muted">
            By continuing, you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy</Link> page.
          </p>
        </div>
      </div>
    </div>
  );
}

// Continue with Google, and the line under it. Shows only once Google is switched on for Ocelot's sign-in server.
export function GoogleSignIn({ next }: { next: string }) {
  return (
    <>
      <form action={signInWithGoogle} className="mt-8">
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="outline" className="w-full">
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-meta text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />or use your email<span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

function GoogleMark() {
  // Google's own colors, required by their brand rules for the sign-in button.
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />{/* ui-rules: allow */}
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />{/* ui-rules: allow */}
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />{/* ui-rules: allow */}
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />{/* ui-rules: allow */}
    </svg>
  );
}
