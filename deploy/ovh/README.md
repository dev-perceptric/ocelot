# Moving from Hostinger to OVH

Every app moves from the Hostinger KVM 2 (`45.90.109.7`) to the OVH SYS-1 in Beauharnois, Canada
(`ns529529.ip-149-56-19.net`, `149.56.19.140`: Xeon-E 2136, 6 cores / 12 threads, 32 GB ECC, 2 × 512 GB NVMe in
RAID 1, Ubuntu 26.04 LTS). Same folders, same compose files, same volumes. Traefik still runs on the host network.

## Steps

1. **OVH setup** (once): `ssh ubuntu@149.56.19.140`, then
   `curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/ovh/setup.sh -o setup.sh && sudo bash setup.sh`
2. **Lower DNS TTLs now** (Namecheap records to 1 min), so the switch spreads fast.
3. **On Hostinger**: `bash /root/move.sh key`, paste the line it prints on OVH, then `bash /root/move.sh copy`.
4. **Cutover**: `bash /root/move.sh cutover`. Stops the apps on Hostinger, copies the last changes, starts them on
   OVH and checks every site on OVH. Every site should say `same`.
5. **Switch DNS** (below). Then watch the sites for a day.
6. **After a day**: start autodeploy on OVH, point the blazed-kitty GitHub deploy at OVH, set up backups and the
   uptime check, then ask Hostinger for the refund (before Dec 8, 2026).

`bash /root/move.sh rollback` undoes step 4 at any point.

## DNS records to point at 149.56.19.140

| Where the DNS lives | Records |
|---|---|
| Cloudflare | `blazedkitty.com`, `www` (keep the orange cloud on) |
| Namecheap | `morningtelos.com`: `@`, `www`, `chat`, `db` |
| Namecheap | `capybaroar.com`: `@`, `www`, `app`, `db` |
| Namecheap | `tryomniscient.com`: `app`, `db` |
| Namecheap | `pulsearr.com`: `app`, `db` |
| Namecheap | `joinocelot.com`: `@`, `www`, `db` (Ocelot stays stopped; moved so the records are ready) |
| Hostinger DNS | `arrowsterr.com`: `app`, `db` |
| Hostinger DNS | `tryclaritia.com`: `app`, `db` |
| Hostinger DNS | `magpiereply.com`: `app`, `agent`, `db` |

The bare domains of arrowsterr, tryclaritia, tryomniscient, magpiereply and pulsearr point at Hostinger website
hosting, not the VPS. Leave them alone.

## Running cost

| | Before (Hostinger KVM 2) | After (OVH SYS-1) |
|---|---|---|
| Server | $242.60 for the term (refund requested) | SYS-1 price on the OVH invoice (check) |
| Everything else | unchanged | unchanged |

The same at Beta and Growth for now: one server runs every app. Cloudflare, R2, Resend and Stripe don't change.
