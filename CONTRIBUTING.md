# Contributing to ToolBots

Free, private, no-signup browser tools. Two hard rules before anything else:

1. **Client-side only.** Every computation happens in the user's browser. No backend, no
   network calls from tool code, no uploads.
2. **No tracking.** No cookies, no fingerprints; the only analytics will be the cookieless
   Cloudflare Web Analytics beacon. No dependencies — vanilla HTML/CSS/JS.

## Repo layout

```
index.html                     homepage — tool grid rendered from the registry in app.js
assets/css/style.css           design system (dark-first, CSS variables)
assets/js/app.js               shared engine: TOOLBOTS_TOOLS registry, TB helpers, bootstrap
assets/img/favicon.svg         icon
tools/<name>/                  one self-contained page per tool (JSON-LD + window.tbInit)
docs/                          ops runbook, bot charter, backlog
404.html  robots.txt  sitemap.xml  llms.txt  CNAME
.github/workflows/deploy.yml   CI: HTML sanity checks → GitHub Pages deploy
```

## Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

No build step, no dependencies, nothing to install. Edit files and refresh. Use the local
server rather than `file://` — clipboard APIs and absolute asset paths behave correctly.

## Adding a tool — checklist

- [ ] Copy an existing page (`tools/json/index.html`) to `tools/<slug>/index.html`
- [ ] Edit the JSON-LD block (class `tb-tool`): `name`, `description`, `inputElement`,
      `outputElement`, 2–3 `faq` pairs
- [ ] Implement `window.tbInit(el)` in vanilla JS; wire the shared copy/clear buttons
      (`data-tb="copy-btn"`, `data-tb="clear-btn"`)
- [ ] Register in **all three** places (CI fails if any is out of sync):
      - `TOOLBOTS_TOOLS` in `assets/js/app.js`
      - `sitemap.xml`
      - footer tool nav in `index.html`
- [ ] Test locally: tool works, homepage card renders, footer link present, invalid input
      fails gracefully
- [ ] No network calls in tool code (grep for `fetch` / `XMLHttpRequest`)

## Code style

- **Vanilla JS** (ES2020+), no frameworks, no libraries, no build step. Reuse the shared
  helpers (`TB.copy`, `TB.sha`, `TB.uuidv4`, `TB.el`) instead of reinventing them.
- **HTML**: semantic elements; one self-contained page per tool. The JSON-LD block is the
  source of truth for the tool's metadata — the engine renders the title, lede, and FAQ from it.
- **CSS**: use the design system's custom properties from `:root` in `style.css`
  (`--bg`, `--panel`, `--cyan`, `--radius`, …). Dark-first; never hardcode colors.
- **Accessibility**: labels bound to inputs, `aria-live` status line, skip link, keyboard
  support (`/` focuses the input, `Esc` clears).
- **Privacy by construction**: tool input must never leave the page — nothing in the query
  string, no beacons from tool logic.

## Commit style

Conventional commits:

```
feat(tools/regex): add match highlighting
fix(json): clamp reported error position
docs: update ops runbook rollback steps
chore(ci): tighten sanity checks
```

`type(scope): summary` — types: `feat`, `fix`, `docs`, `refactor`, `chore`. Imperative mood,
lowercase, ≤ 72 characters. One logical change per commit.

## PR checklist

- [ ] CI green (sanity checks + registry/sitemap/footer sync)
- [ ] Registry, sitemap, and footer nav updated together
- [ ] Client-side only — no backend, no network calls, no uploads
- [ ] No tracking, cookies, or new third-party scripts
- [ ] Tool logic verified locally on `python3 -m http.server 8080`
- [ ] JSON-LD valid; FAQ present; page renders correctly without JS
- [ ] Conventional commit messages

Roadmap priorities → docs/BACKLOG.md · Operations → docs/OPS-RUNBOOK.md · How the bot team
works → docs/BOTS.md
