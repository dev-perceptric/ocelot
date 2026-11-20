// Copies every file in the given buckets from Supabase Cloud to the self-hosted Supabase, keeping each path
// (resumes/<user id>/<file>, logos/<org id>/<file>), so the storage access rules keep working. Run by
// deploy/ocelot-move/move-from-cloud.sh; safe to run again (it overwrites). Needs CLOUD_URL, CLOUD_SERVICE_KEY, NEW_URL and
// NEW_SERVICE_KEY in the environment. Uses only Supabase's Storage HTTP API, so it needs no packages.
const { CLOUD_URL, CLOUD_SERVICE_KEY, NEW_URL, NEW_SERVICE_KEY } = process.env;
if (!CLOUD_URL || !CLOUD_SERVICE_KEY || !NEW_URL || !NEW_SERVICE_KEY) throw new Error("Set CLOUD_URL, CLOUD_SERVICE_KEY, NEW_URL and NEW_SERVICE_KEY.");
const auth = (key) => ({ apikey: key, authorization: `Bearer ${key}` });

async function list(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${CLOUD_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...auth(CLOUD_SERVICE_KEY), "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`List ${bucket}/${prefix}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await list(bucket, path))); // a folder
      else files.push({ path, type: item.metadata?.mimetype ?? "application/octet-stream", cache: item.metadata?.cacheControl });
    }
    if (page.length < 1000) return files;
  }
}

const encode = (path) => path.split("/").map(encodeURIComponent).join("/");

for (const bucket of process.argv.slice(2)) {
  const files = await list(bucket, "");
  let copied = 0;
  for (const f of files) {
    const got = await fetch(`${CLOUD_URL}/storage/v1/object/${bucket}/${encode(f.path)}`, { headers: auth(CLOUD_SERVICE_KEY) });
    if (!got.ok) throw new Error(`Download ${bucket}/${f.path}: ${got.status}`);
    const headers = { ...auth(NEW_SERVICE_KEY), "content-type": f.type, "x-upsert": "true" };
    if (f.cache) headers["cache-control"] = `max-age=${f.cache.replace(/\D/g, "") || 3600}`;
    const put = await fetch(`${NEW_URL}/storage/v1/object/${bucket}/${encode(f.path)}`, { method: "POST", headers, body: Buffer.from(await got.arrayBuffer()) });
    if (!put.ok) throw new Error(`Upload ${bucket}/${f.path}: ${put.status} ${await put.text()}`);
    copied++;
  }
  console.log(`${bucket}: ${copied} of ${files.length} files copied.`);
}
