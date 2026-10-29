"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { askConfirm, askText } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { publish, sendBack } from "../actions";

export function ReviewButtons({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = (r: { ok: boolean; message?: string }, text: string) => {
    toast(r.ok ? text : r.message ?? "That didn't work.");
    if (r.ok) router.push("/admin/review");
  };
  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={pending} aria-busy={pending} onClick={async () => {
        if (await askConfirm({ title: `Publish ${title}?`, body: "It goes live for 30 days and the company gets an email.", confirm: "Publish" })) {
          start(async () => done(await publish(id), "Published"));
        }
      }}>Publish</Button>
      <Button variant="outline" disabled={pending} onClick={async () => {
        const note = await askText({ title: "Send back for an update", label: "What needs to change (the company sees this)", confirm: "Send back" });
        if (note) start(async () => done(await sendBack(id, note), "Sent back"));
      }}>Send back</Button>
    </div>
  );
}
