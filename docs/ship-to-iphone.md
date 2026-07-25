# Getting Atlas onto your iPhone (and onto a domain), cheaply

The goal: Atlas on your home screen, full-screen, no Safari chrome, its own icon —
without writing an iOS app or paying Apple $99/year. That is exactly what a
**PWA + "Add to Home Screen"** gives you, and it is what you did before with a
webclip. This document is the whole path: what is already done in the code, what
you have to buy, and the exact steps.

---

## 1 · What I already changed in the code

These were genuinely broken, not cosmetic:

- **`public/manifest.webmanifest` did not exist.** `layout.tsx` pointed at it, so
  the browser fetched it and got a 404 — the app was **not installable at all**.
  Written now, with `display: standalone` (no browser UI), `start_url: /today`,
  the brand colours, and app shortcuts.
- **The icons were SVG-only.** iOS *ignores* SVG apple-touch-icons; a home-screen
  install would have shown a blank or letter tile. Rasterised to PNG:
  `apple-touch-icon.png` (180², opaque — iOS does not respect transparency and
  would have composited it on white), plus 192/512 and a 512 maskable for Android.
- **`apple-touch-icon` was never declared.** Added, along with `formatDetection`
  (stops iOS turning numbers in your journal into phone links) and OpenGraph tags.

`viewportFit: 'cover'`, `appleWebApp.capable`, the safe-area CSS and the service
worker were already right — that work was done back in the PWA phase.

> The service worker registers **production-only** (`ServiceWorkerRegistrar`), so
> offline support and the standalone feel only appear on the deployed site, never
> on `localhost:3000`. That is deliberate; don't "fix" it.

---

## 2 · The domain

You floated `atlas.ai`. Two problems, and I'd rather say so before you spend:

1. **`.ai` is expensive** — typically **$70–$130/year**, versus ~$10–15 for `.com`.
   It renews at that price forever.
2. **`atlas.ai` is almost certainly already owned.** "Atlas" is a very common
   product name and there are existing companies using it. A two-word premium
   `.ai` on the aftermarket runs into the tens of thousands.

**You do not need `.ai` for SEO.** Google has stated for years that generic TLDs
carry no ranking advantage — a `.com` and a `.ai` with identical content rank the
same. What actually moves SEO is: the site being crawlable, fast, having real
content pages, and earning links. A domain contributes mainly through *brand
memorability* and *click-through*, not ranking.

### What actually helps SEO here

Atlas is currently a **pure app shell** — every route is behind auth. Google has
nothing to index. No domain fixes that. If SEO matters to you, the lever is a
**public marketing page** at `/` (what it is, screenshots, pricing) with the app
at `/today` behind login. That single change is worth more than any TLD choice.

### Domain recommendation

Pick a **brandable, short, `.com`** if one is free; otherwise a clean `.app`.
`.app` is worth calling out: it is Google-run and **HTTPS-only at the browser
level** (HSTS preloaded), which is a genuine security perk for an app like this
and signals "this is software" to a human reading the URL.

| Option | Typical cost/yr | Notes |
|---|---|---|
| `<brand>.com` | ~$11 | Best default. Most trusted, best click-through. |
| `<brand>.app` | ~$14 | HTTPS enforced by the TLD. Reads as an app. Great fit. |
| `<brand>.so` / `.io` | ~$30–60 | Startup-flavoured, pricier, no SEO benefit. |
| `atlas.ai` | $70–130+ *if available at all* | Almost certainly taken; likely 5 figures. |

Because bare "atlas" is taken everywhere, use a **compound**: `atlaslife.app`,
`useatlas.app`, `atlasos.app`, `heyatlas.app`, `atlasdaily.com`. Compounds are
standard practice (`useplaid`, `getlinear`) and cost nothing extra.

**Where to buy:** **Cloudflare Registrar** — it sells at wholesale cost with **no
markup and no first-year gimmick**, includes WHOIS privacy free, and you are
going to want Cloudflare DNS anyway. Namecheap and Porkbun are fine alternatives.
Avoid GoDaddy: cheap year one, expensive renewals, aggressive upsells.

> **Check availability yourself before committing** — I can't verify live registry
> state from here, and availability changes daily.

---

## 3 · Hosting: the cheap, correct setup

You already have Docker Compose + Caddy planned in `docs/architecture.md`. Costs,
current as of the searches below:

| Piece | Choice | Cost |
|---|---|---|
| Server | **Hetzner CX22** (2 vCPU, 4 GB RAM) | **~$5.39/mo** |
| DNS + TLS | Cloudflare (free tier) + Caddy auto-HTTPS | **$0** |
| Database | Postgres in the same Compose stack | **$0** |
| Domain | `.com` / `.app` | ~$1/mo amortised |
| **Total** | | **≈ $6.50/mo** |

**Hetzner over DigitalOcean**: the comparable DigitalOcean droplet is ~$18/mo for
*less* RAM, and Hetzner includes 20 TB egress versus DO's 1 TB. For a single-tenant
app this is a 70% saving with no real downside.

**4 GB RAM matters here specifically.** The embedding model (`LocalEmbedder`) is
loaded **in-process** and is ~110 MB of weights plus runtime overhead. A 1 GB box
will OOM. Do not economise below CX22.

> **Bake the model into the Docker image or pre-warm it on boot.** Otherwise the
> first request on a cold box downloads ~110 MB before it can answer. This is
> already flagged in `CLAUDE.md` under deployment.

---

## 4 · Exact steps (do these in order)

### A. Buy the domain
1. Check your shortlist at Cloudflare Registrar.
2. Buy it. Enable WHOIS privacy (free).
3. Point the nameservers at Cloudflare (automatic if you buy there).

### B. Get a server
1. Create a Hetzner Cloud account → new project → **CX22**, Ubuntu 24.04,
   location closest to you (Ashburn/Hillsboro for North America).
2. Add your SSH key during creation. **Never enable password login.**
3. Note the IPv4 address.

### C. DNS
In Cloudflare DNS for your domain:
- `A` record, name `@`, value = your server IP, **proxy ON** (orange cloud).
- `A` record, name `api`, value = same IP, **proxy ON**.

> Proxy ON gives you free DDoS protection and hides the origin IP. Caddy still
> needs to answer ACME challenges — use Cloudflare's **Full (strict)** SSL mode
> so both ends are encrypted.

### D. Deploy
On the server:
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/rileyhins17/Atlas.git && cd Atlas
```
Then create `.env` on the server (**never commit it**) with a fresh
`SESSION_SECRET`, `APP_ENCRYPTION_KEY`, the Postgres credentials, your
`GOOGLE_*` and `PLAID_*` keys, and:
```
WEB_ORIGIN=https://yourdomain.app
NEXT_PUBLIC_API_URL=https://api.yourdomain.app
ATLAS_DOMAIN=yourdomain.app
```
Then `docker compose up -d` and `pnpm --filter @atlas/db exec prisma migrate deploy`.

> **Rotate every secret** for production. The Plaid production secret in
> particular was pasted into a chat transcript and must not be reused.

### E. Put it on your iPhone
1. Open **Safari** (it must be Safari — Chrome on iOS cannot install PWAs).
2. Go to `https://yourdomain.app` and sign in.
3. Share button → **Add to Home Screen** → Add.
4. You now have an Atlas icon that opens full-screen with no browser chrome.

### F. Turn on notifications (optional but this is the payoff)
iOS supports web push **only for installed PWAs**, iOS 16.4+. After step E:
Settings → Proactive AI → **Enable notifications** → allow. Your daily brief then
arrives as a real push notification. This is the one thing that makes it feel like
an actual app rather than a bookmark.

---

## 5 · Honest limits of the PWA route

- **Install is manual.** iOS shows no install prompt; you must use the Share
  sheet. Fine for you; a real funnel cost if you sell this.
- **No App Store presence.** No discovery, no "download on the App Store".
- **Push requires the install first**, and the user must not delete the icon.
- **Background sync is unreliable** on iOS. Anything time-critical must be driven
  server-side (the proactive sweep already is — good).

If Atlas ever needs App Store distribution, the same web app wraps in Capacitor
with days of work, not months. Worth doing only once real users ask.

---

## Sources

- [Hetzner vs DigitalOcean 2026 comparison](https://betterstack.com/community/guides/web-servers/digitalocean-vs-hetzner/)
- [Cloud VPS cost comparison 2026](https://apicalculators.com/blog/cloud-vps-cost-comparison-2026)
- [5 cheap ways to host Postgres in 2026](https://sliplane.io/blog/5-cheap-ways-to-host-postgres)
