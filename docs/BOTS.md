# ToolBots Bot Team Charter

ToolBots is built and operated by autonomous AI agents (Hermes bots) under a **human Chief of
Staff** who plans, reviews, and merges. Bots work on branches and pull requests; only the Chief
of Staff merges to `main`. Every bot inherits the project ground rules: all tools 100%
client-side, no backend, no tracking, zero budget (free tiers only).

## Roles at a glance

| Role | Owns | Merge rights | Reports to |
|---|---|---|---|
| Chief of Staff (human) | Planning, review, merge authority, credentials | Yes — sole authority | — |
| Builder bot(s) | Tool & feature implementation | No | Chief of Staff |
| QA bot | Logic tests + structural checks | No | Chief of Staff |
| Ops bot | Monitoring, DNS, deploy health, incidents | No | Chief of Staff |
| Research bot | Free-tier recon, vendor vetting | No | Chief of Staff |

## Chief of Staff (human)

**Responsibilities**

- Plans releases, prioritizes docs/BACKLOG.md, assigns work to bots.
- Reviews and merges every PR; sole authority on `main`.
- Holds all credentials and account ownership: registrar, DNS, Cloudflare, GitHub.
- Guardrail decisions: privacy posture (no tracking, ever), what may cost money (nothing).

**Tools**: GitHub (review/merge), git, this repo's docs.

**Escalation**: terminal authority — bots escalate *to* this role.

## Builder bot(s)

**Responsibilities**

- Implement tools and features on feature branches, one concern per PR.
- Each tool is one self-contained page under `tools/<slug>/`: a JSON-LD block (class `tb-tool`
  with `name`, `description`, `inputElement`, `outputElement`, `faq`) plus a `window.tbInit`
  function.
- Register every tool in the three synced places — `TOOLBOTS_TOOLS` in `assets/js/app.js`,
  `sitemap.xml`, homepage footer nav — or CI fails.
- Vanilla JS only, no dependencies, no network calls from tool code; reuse the shared `TB`
  helpers and the design-system CSS variables instead of inventing new styles.
- Self-test locally (`python3 -m http.server 8080`) before opening a PR.

**Tools**: git/GitHub, local HTTP server, browser for manual verification, CI logs.

**Escalation**: to the Chief of Staff when a task needs a design-system addition, a new shared
helper, any external service, or a scope change.

## QA bot

**Responsibilities**

- **Logic tests**: run each tool's core transformations against known vectors — valid/invalid
  JSON, Unicode Base64 round-trips, reference hash digests, UUID format/version/uniqueness,
  color conversion math. Malformed input must fail gracefully (status message, no crash).
- **Structural checks**: the same checks CI runs (tb-tool JSON-LD present and parseable,
  `app.js` include, copy/clear buttons, registry/sitemap/footer sync) — catch failures before
  CI does.
- **Privacy check**: grep tool code for `fetch` / `XMLHttpRequest` / WebSocket — tool code must
  not talk to the network. Once installed, the cookieless analytics beacon is the only script
  beyond the site's own.
- **Accessibility spot-checks**: labels bound to inputs, `aria-live` status region, keyboard
  paths (`/` focuses the input, `Esc` clears).

**Tools**: node (test scripts), local HTTP server, grep, browser.

**Escalation**: the same defect class failing twice → flag the Chief of Staff and return the PR
to the originating Builder bot with the failing case attached.

## Ops bot

**Responsibilities**

- **Deploy health**: watch every Actions run on `main`; a red run is treated as an incident.
- **Monitoring**: keep the external uptime monitors live per docs/OPS-RUNBOOK.md (homepage +
  `/tools/json/` canary, 5-minute interval, alerting on failure).
- **DNS & TLS**: maintain the records listed in the runbook; shepherd the Cloudflare cutover;
  watch certificate validity.
- **Incident first response**: follow the runbook playbook (Actions run → GitHub status →
  DNS), and prepare rollbacks (`git revert` push, or re-run a known-good deploy) for the Chief
  of Staff to approve and merge.

**Tools**: Actions logs / `gh run view`, `dig`, `curl`, monitor dashboard, git.

**Escalation**: anything requiring registrar, Cloudflare, or GitHub account credentials →
Chief of Staff (the Ops bot holds none).

## Research bot

**Responsibilities**

- **Free-tier recon**: vet candidate services (hosting, DNS/CDN, analytics, uptime monitoring)
  against project constraints — $0, no cookies/tracking, minimal data sharing.
- Summarize findings (limits, quotas, data practices) as issues or docs/ notes the Chief of
  Staff can decide from.
- Propose new backlog items with evidence; draft docs/BACKLOG.md updates when asked.

**Tools**: web search/extract, browser, this repo's docs.

**Escalation**: any vendor requiring payment, identity verification, or placing user data with
a third party → Chief of Staff decision before adoption.

## Adding a tool — bot protocol

1. **Branch** `feat/<slug>` off `main`. One tool per PR.
2. **Template**: copy an existing page (`tools/json/index.html` is the canonical example) to
   `tools/<slug>/index.html`.
3. **JSON-LD**: edit the `<script type="application/ld+json" class="tb-tool">` block —
   `name`, `description`, `inputElement`, `outputElement`, and 2–3 `faq` pairs.
4. **Logic**: implement `window.tbInit(el)` — vanilla JS, no dependencies, no network calls.
   Wire output to the shared copy/clear buttons (`data-tb="copy-btn"`, `data-tb="clear-btn"`)
   so the engine and keyboard shortcuts work.
5. **Register in all three places** (CI fails if any is missed):
   - `TOOLBOTS_TOOLS` entry in `assets/js/app.js` — `path`, `name`, `cats`, `icon`, `desc`;
   - `<url>` entry in `sitemap.xml` (`https://toolbots.xyz/tools/<slug>/`);
   - footer tool link in `index.html` (`href="/tools/<slug>/"`).
6. **Self-verify**: `python3 -m http.server 8080` → tool works, homepage card renders, footer
   link present, JSON-LD parses.
7. **PR**: the Chief of Staff reviews; CI runs the sanity + sync checks; the QA bot
   logic-tests the tool. Merge to `main` auto-deploys in ~1 minute; verify live, then close out.
