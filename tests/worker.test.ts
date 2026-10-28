import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain JavaScript worker, no types
import { makeWorker } from "../scripts/worker.mjs";

type Call = { url: string; body: unknown };

// A fake Supabase and Resend: records every call and answers Resend with the given status.
function fake(resendStatus: number, tasks: unknown[]) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { body?: string }) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.endsWith("/rpc/claim_queue")) return new Response(JSON.stringify(tasks));
    if (url.endsWith("/rpc/expire_jobs")) return new Response("0");
    if (url.includes("api.resend.com")) return new Response(JSON.stringify(resendStatus === 200 ? { id: "re_1" } : { message: "nope" }), { status: resendStatus });
    return new Response("", { status: 201 });
  };
  const worker = makeWorker({ url: "https://db.test", key: "k", resendKey: "re_key", fetchImpl, log: { log() {}, error() {} } });
  return { worker, calls, finish: () => calls.filter((c) => c.url.endsWith("/rpc/finish_queue")).map((c) => c.body), logs: () => calls.filter((c) => c.url.endsWith("/email_log")).map((c) => c.body) };
}

const task = { id: 7, kind: "email", attempts: 1, payload: { to: "a@b.c", user_id: null, kind: "team_invite", subject: "Hi", html: "<p>Hi</p>", text: "Hi", headers: { "List-Unsubscribe": "<x>" } } };

test("a sent email is logged and finished", async () => {
  const f = fake(200, [task]);
  await f.worker.tick();
  const resend = f.calls.find((c) => c.url.includes("api.resend.com"))!.body as Record<string, unknown>;
  assert.deepEqual(resend.headers, { "List-Unsubscribe": "<x>" });
  assert.deepEqual(f.finish(), [{ p_id: 7 }]);
  assert.equal((f.logs()[0] as { status: string; resend_id: string }).status, "sent");
  assert.equal((f.logs()[0] as { resend_id: string }).resend_id, "re_1");
});

test("Resend down: try again later", async () => {
  const f = fake(503, [task]);
  await f.worker.tick();
  const [fin] = f.finish() as { p_final: boolean; p_error: string }[];
  assert.equal(fin.p_final, false);
  assert.match(fin.p_error, /resend 503/);
  assert.deepEqual(f.logs(), []);
});

test("a bad address stops right away and is logged as failed", async () => {
  const f = fake(422, [task]);
  await f.worker.tick();
  assert.equal((f.finish()[0] as { p_final: boolean }).p_final, true);
  assert.equal((f.logs()[0] as { status: string }).status, "failed");
});

test("rate limited: try again later", async () => {
  const f = fake(429, [task]);
  await f.worker.tick();
  assert.equal((f.finish()[0] as { p_final: boolean }).p_final, false);
});

test("the fifth failure is the last", async () => {
  const f = fake(503, [{ ...task, attempts: 5 }]);
  await f.worker.tick();
  assert.equal((f.finish()[0] as { p_final: boolean }).p_final, true);
});

test("an unknown task kind stops right away", async () => {
  const f = fake(200, [{ ...task, kind: "mystery" }]);
  await f.worker.tick();
  assert.equal((f.finish()[0] as { p_final: boolean }).p_final, true);
});
