import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/supabase/server";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function Welcome({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { user } = await currentUser();
  if (!user) redirect("/login?next=/welcome");
  const next = safeNext((await searchParams).next);
  return (
    <div className="mx-auto max-w-[720px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">Welcome to Ocelot</h1>
      <div className="mt-8"><WelcomeForm next={next} /></div>
    </div>
  );
}
