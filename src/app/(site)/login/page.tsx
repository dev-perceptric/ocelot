import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  return (
    <div className="mx-auto max-w-[440px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">Log in or sign up</h1>
      {error ? <p className="mt-4 text-meta text-danger">That link has expired. Send a new one.</p> : null}
      <div className="mt-8">
        <LoginForm next={safe} />
      </div>
    </div>
  );
}
