"use server";

import { requireAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/env";
import { samples } from "@/lib/email/samples";
import { queueEmail } from "@/lib/email/send";

// Sends a sample to the admin's own address through the real queue, worker and Resend.
export async function sendSample(kind: string): Promise<{ ok: boolean; message: string }> {
  const { user } = await requireAdmin();
  const sample = samples(SITE_URL).find((s) => s.kind === kind);
  if (!sample || !user.email) return { ok: false, message: "Unknown email." };
  await queueEmail({ to: user.email, userId: user.id, kind: `sample_${kind}`, email: { ...sample.email, subject: `[Sample] ${sample.email.subject}` } });
  return { ok: true, message: `Queued for ${user.email}. It sends within a minute.` };
}
