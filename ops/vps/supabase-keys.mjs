// Prints fresh secrets for Ocelot's self-hosted Supabase (/docker/sb-ocelot/.env), one KEY=value line each.
// Run it anywhere with Node 22, or on the server with Docker:
//   docker run --rm -v "$PWD/ops/vps:/w:ro" node:22-alpine node /w/supabase-keys.mjs
// Then replace the same lines in /docker/sb-ocelot/.env (docs/setup.md, "3. Ocelot's Supabase on the VPS").
// ANON_KEY is public (it goes into the browser build); everything else stays on the server.
import { createHmac, randomBytes } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const secret = (bytes) => randomBytes(bytes).toString("base64url");
const hex = (bytes) => randomBytes(bytes).toString("hex");

const jwtSecret = secret(48);
const sign = (role) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ role, iss: "supabase", iat: now, exp: now + 10 * 365 * 24 * 3600 }));
  const sig = createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};

const lines = {
  POSTGRES_PASSWORD: hex(24),
  JWT_SECRET: jwtSecret,
  ANON_KEY: sign("anon"),
  SERVICE_ROLE_KEY: sign("service_role"),
  DASHBOARD_PASSWORD: secret(18),
  SECRET_KEY_BASE: secret(48),
  VAULT_ENC_KEY: hex(16),
  PG_META_CRYPTO_KEY: secret(24),
  LOGFLARE_PUBLIC_ACCESS_TOKEN: secret(24),
  LOGFLARE_PRIVATE_ACCESS_TOKEN: secret(24),
};
for (const [k, v] of Object.entries(lines)) console.log(`${k}=${v}`);
