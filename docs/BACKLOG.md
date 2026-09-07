# ToolBots Backlog — v1.1 and beyond

Prioritized roadmap. Effort: **S** ≤ half a bot-day · **M** ≈ 1–2 bot-days · **L** = multi-day
or needs design review. The owner is the bot role accountable for delivery (see docs/BOTS.md);
every item still lands as a PR reviewed and merged by the Chief of Staff.

## P1 — operational foundations

| Item | Effort | Owner | Notes |
|---|---|---|---|
| Cloudflare Web Analytics snippet on all pages | S | Ops bot | Cookieless beacon from the Cloudflare dashboard (token placeholder: `<beacon-token>`). Add to `index.html`, every `tools/*/index.html`, and `404.html`. Install after the Cloudflare cutover. Verify it sets no cookies and no local storage — the "no tracking" claim must stay true. |
| External uptime monitor with alerting | S | Ops bot | UptimeRobot free tier: two monitors — `https://toolbots.xyz/` and `https://toolbots.xyz/tools/json/` — 5-minute interval, alert on failure to the Ops bot's channel. API key stays out of the repo (`<your-monitor-key>`). Full plan: docs/OPS-RUNBOOK.md → Monitoring plan. |

## P2 — new tools

Each follows the add-a-tool protocol in docs/BOTS.md (template page → JSON-LD + `tbInit` →
registry/sitemap/footer → PR). All are client-side by definition; input never leaves the page.

| Tool | Effort | Owner | Notes |
|---|---|---|---|
| URL encoder/decoder | S | Builder bot | `encodeURIComponent` / `decodeURIComponent`; component vs full-URI mode; handle the `+` vs `%20` ambiguity explicitly. |
| Lorem ipsum generator | S | Builder bot | Paragraph / sentence / word count controls; optional deterministic seed for reproducible filler. |
| Markdown preview | M | Builder bot | Parse a practical subset (headings, lists, emphasis, code, links, tables) to HTML client-side. Escape all user text before rendering — never inject raw input via `innerHTML`. |
| Cron expression explainer | M | Builder bot | Human-readable description of 5-field (and `@`-shortcut) expressions + the next N run times in the viewer's local time. |
| Diff checker | M | Builder bot | Line diff via LCS; side-by-side and inline views; adds/removes/changes. |
| Timestamp converter | S | Builder bot | Unix seconds/millis ⇄ ISO 8601, UTC and viewer-local, live "now" clock. |
| Regex tester | M | Builder bot | Pattern + flags + test text with highlighted matches and capture groups. Cap input size and match attempts so catastrophic backtracking can't freeze the tab. |
| JWT decoder | S | Builder bot | **Decode-only**: base64url-decode the header and payload for inspection. No signature verification — out of scope by policy, and there is no server to verify anything. Nothing the user pastes leaves the browser. |

## P2 — site features

| Item | Effort | Owner | Notes |
|---|---|---|---|
| Open Graph share images per tool | M | Builder bot | Static 1200×630 `og:image` per tool page, generated once and committed as files, plus `og:title`/`og:description` tags. No dynamic image-generation service — that would be a server. |

## P3 — later

| Item | Effort | Owner | Notes |
|---|---|---|---|
| PWA / offline support | L | Builder bot | Service worker + web manifest. Tools already run client-side, so offline mode is natural: precache the shell and tool pages, cache-first for assets. Needs care so a stale service worker never masks a deploy (see rollback in docs/OPS-RUNBOOK.md). |
| Dark/light toggle | M | Builder bot | `assets/css/style.css` is dark-first via CSS variables. Add a light variable set, respect `prefers-color-scheme` by default, persist the toggle in `localStorage` (functional storage only — not tracking). |
| Tool deep-linking with query params (`?input=`) | S | Builder bot | Shareable prefill: on load, decode a URI-encoded payload into the tool's input element. **Implement it in the URL fragment only** (e.g. `/tools/base64/#input=...`): fragments are never sent to any server — no CDN logs, no access logs, nothing hits a server. Never put tool input in the query string itself; query strings are visible to edge/origin logs, and this project promises tool input touches no server. |

## Not planned (by policy)

- Accounts, sign-up, or collecting user data of any kind
- Any server-side processing of tool input
- Ads or paid placements
- Selling or sharing data — there is no data
