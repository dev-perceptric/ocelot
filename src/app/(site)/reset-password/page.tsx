import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { AuthShell } from "../login/AuthShell";
import { ResetForm } from "../login/PasswordForms";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

// The link in the reset email signs the person in (through /auth/callback) and lands here.
export default async function ResetPassword() {
  const { user } = await currentUser();
  return (
    <AuthShell next="/app">
      <h1 className="text-title font-bold">Set a new password</h1>
      {user ? (
        <>
          <p className="mt-2 text-body text-muted">For {user.email}.</p>
          <ResetForm />
        </>
      ) : (
        <>
          <p className="mt-2 text-body text-muted">This link has expired or was already used.</p>
          <p className="mt-6 text-body"><Link href="/forgot-password" className="font-bold underline">Send a new link</Link></p>
        </>
      )}
    </AuthShell>
  );
}
