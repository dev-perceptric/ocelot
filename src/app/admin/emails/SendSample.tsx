"use client";

import { useTransition } from "react";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { sendSample } from "./actions";

export function SendSample({ kind }: { kind: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" disabled={pending} aria-busy={pending}
      onClick={() => start(async () => toast((await sendSample(kind)).message))}>
      {pending ? "Queuing" : "Send to me"}
    </Button>
  );
}
