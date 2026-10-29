import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function Goodbye() {
  return (
    <div className="mx-auto max-w-[560px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">Your account is deleted.</h1>
      <p className="mt-4 text-body">We removed your profile, tracker and files. Good luck with your next move.</p>
      <ButtonLink href="/jobs" className="mt-8">Find jobs</ButtonLink>
    </div>
  );
}
