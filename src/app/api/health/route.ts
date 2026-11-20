// Docker checks this to know the app is up (deploy/ocelot-web/docker-compose.yml).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
