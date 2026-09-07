# ToolBots Operations Runbook

Operational procedures for **toolbots.xyz** — a static, fully client-side tool site with no
backend. Audience: the Ops bot and the human Chief of Staff.

**Invariants (never break these):**

- Every tool runs 100% client-side. No backend, no tracking, no cookies, no accounts.
- Zero budget: GitHub Pages + Cloudflare free tiers only. Never introduce a paid dependency.
- All changes reach production through CI (`.github/workflows/deploy.yml`). Nobody bypasses CI.

## System overview

| Layer | Tech | Cost | Owner |
|---|---|---|---|
| Hosting | GitHub Pages (Actions deploy) | $0 | Ops bot |
| DNS/CDN | Cloudflare free plan (planned cutover; DNS currently at DreamHost) | $0 | Ops bot |
| TLS | GitHub Pages cert now; Cloudflare edge cert after cutover | $0 | Ops bot |
| Analytics | Cloudflare Web Analytics (cookieless) — **not yet installed** | $0 | Ops bot |
| Domain | toolbots.xyz — registered at eNom via DreamHost, paid through 2027 | prepaid | Chief of Staff |

- Production URL: `https://toolbots.xyz` (the `CNAME` file pins the custom domain).
- Source: `https://github.com/toolbots-xyz/toolbots.xyz` — branch `main` **is** production.
- Pipeline: `.github/workflows/deploy.yml` — a `check` job (HTML sanity + consistency), then a
  `deploy` job (configure-pages → upload-pages-artifact → deploy-pages). Concurrency group
  `pages` cancels superseded runs.

## Deployment flow

1. Merge a PR to `main` (merge authority: Chief of Staff).
2. Actions triggers automatically on push to `main`; manual trigger via *Run workflow*.
3. `check` job (blocks deploy on failure):
   - every `tools/*/index.html` has a parseable JSON-LD block (class `tb-tool`), includes
     `assets/js/app.js`, and contains `copy-btn` + `clear-btn` elements;
   - the registry (`TOOLBOTS_TOOLS` in `assets/js/app.js`), `sitemap.xml`, and the homepage
     footer nav agree on the exact same tool list, and every registered path exists on disk.
4. `deploy` job publishes the whole repo as the Pages artifact. Live in ~1 minute.
5. Verify: open the changed URL and hard-refresh (Cmd/Ctrl+Shift+R). Pages are cache-friendly —
   a stale browser cache looks exactly like "nothing happened".

## Rollback

**Preferred — revert the commit:**

```bash
git revert <bad-commit-sha>
git push origin main        # CI redeploys the previous state
```

Works for any regression because deploys are stateless: the artifact is the repo itself.

**Emergency — redeploy an older run without touching git:**

Actions tab → last known-good *Deploy to GitHub Pages* run → **Re-run jobs** (the `deploy`
job). A run is pinned to its commit SHA, so this republishes the old content. Caveat: the repo
still contains the bad code — the next push to `main` overwrites this. Use only as a stopgap
while preparing the revert.

## DNS records

**Current phase — direct GitHub Pages** (records managed at DreamHost):

| Type | Name | Value | Notes |
|---|---|---|---|
| A | @ | 185.199.108.153 | GitHub Pages apex (1 of 4) |
| A | @ | 185.199.109.153 | GitHub Pages apex (2 of 4) |
| A | @ | 185.199.110.153 | GitHub Pages apex (3 of 4) |
| A | @ | 185.199.111.153 | GitHub Pages apex (4 of 4) |
| CNAME | www | toolbots-xyz.github.io | www alias |

**After the Cloudflare cutover** (free plan):

1. Add toolbots.xyz to Cloudflare; it imports the records above.
2. Keep the four apex A records and the www CNAME; set them **proxied** (orange cloud).
3. SSL/TLS mode: **Full (strict)** once the Pages certificate for toolbots.xyz is active
   (**Full** during first issuance).
4. Enable **Always Use HTTPS** and HSTS (below).
5. At DreamHost, replace the nameservers with the two Cloudflare-assigned nameservers
   (`<cloudflare-ns-1>`, `<cloudflare-ns-2>`). Registration stays at eNom/DreamHost — only
   DNS moves.
6. Propagation is usually minutes; allow up to 24–48 h. Verify with `dig +short toolbots.xyz`
   (should return Cloudflare edge IPs).
7. If Pages domain verification fails while proxied, flip the records to DNS-only (grey cloud),
   re-verify in Pages settings, then re-proxy.

## HTTPS enforcement + HSTS

- GitHub Pages: enable **Enforce HTTPS** in Settings → Pages once the certificate is issued;
  `http://` requests then redirect to `https://`.
- HSTS: GitHub Pages does **not** send HSTS for custom domains. After the Cloudflare cutover,
  enable it under SSL/TLS → Edge Certificates: start at `max-age=86400` (no preload), then
  raise (2592000 → 31536000) once stable. Do not enable preload without a deliberate decision —
  HSTS is hard to walk back.

## Incident playbook

### Site down (any URL not returning 200)

Check in this order:

1. **Last Actions run** — did `check` or `deploy` fail? A red run is the most common cause.
   Fix forward (new commit) or roll back (above).
2. **GitHub status** — `https://www.githubstatus.com/` (Pages / Actions incidents). If GitHub
   is down, wait; there is nothing to operate.
3. **DNS** — `dig +short toolbots.xyz A` should return one of the four Pages IPs (direct
   phase) or Cloudflare edge IPs (post-cutover). Nothing or a wrong IP → DNS problem: check the
   record set and, post-cutover, whether the zone got paused in Cloudflare.
4. **HTTP** — `curl -sI https://toolbots.xyz/` and `curl -sI https://toolbots.xyz/tools/json/`.
   A 404 that GitHub Pages itself serves often means a lapsed custom-domain verification in
   Settings → Pages — re-verify the domain.
5. Escalate to the Chief of Staff if unresolved after 30 minutes. No user data is ever at risk
   (the site is static and stateless) — say so plainly in any status note.

### Tool broken (site up, tool misbehaves)

1. Reproduce at the live URL; note the browser and the exact input.
2. Reproduce locally: `python3 -m http.server 8080` from the repo root, then open
   `http://localhost:8080/tools/<name>/`.
3. Branch `hotfix/<tool>-<what>` off `main`; make the minimal fix.
4. Verify locally: the tool works **and** the CI-relevant pieces are intact (`tb-tool` JSON-LD
   parses, `app.js` included, copy/clear buttons present).
5. PR → CI green → merge → live in ~1 minute → re-test at the live URL.

## Monitoring plan

- External uptime monitor (UptimeRobot free tier — see docs/BACKLOG.md, P1) with two monitors:

  | Monitor | URL | Expect |
  |---|---|---|
  | Homepage | `https://toolbots.xyz/` | HTTP 200 |
  | Canary tool page | `https://toolbots.xyz/tools/json/` | HTTP 200 |

  5-minute interval; alerts to the Ops bot's channel. The canary catches "site up, tool page
  broken" — a homepage-only check misses that.
- Monitor API keys are secrets: configure them in the monitor dashboard or CI secrets, never in
  the repo (use the `<your-monitor-key>` placeholder in any config snippet).
- Daily Ops bot sweep: last CI run green · monitors green · DNS resolves · certificate valid.
- The footer status dot is hand-maintained copy, not a live indicator.

## Change management — the sync rule

The tool list lives in three places and they must always agree:

1. `TOOLBOTS_TOOLS` registry in `assets/js/app.js`
2. `sitemap.xml`
3. Footer tool nav in `index.html`

CI enforces this: a registry entry missing from the sitemap, the footer, or disk fails the
`check` job and blocks deploy. Adding or removing a tool is therefore one PR touching all three
(plus the tool's page directory) — never edit one of them in isolation.
