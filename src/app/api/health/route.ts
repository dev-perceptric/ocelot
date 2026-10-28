// Fly checks this to know the app is up.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
