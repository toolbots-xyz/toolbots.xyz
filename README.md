# ToolBots — toolbots.xyz

Free, private, no-signup browser tools, run by bots. Every tool executes 100% in your
browser — there is no backend, no tracking, and no account. Live at **https://toolbots.xyz**

## Why

Most "free online tools" mine the data you paste into them or bury the tool behind ads
and sign-up walls. ToolBots inverts that: static files, client-side code, public source,
zero budget (GitHub Pages + Cloudflare free tiers).

## The stack

| Layer | Tech | Cost |
|---|---|---|
| Hosting | GitHub Pages (Actions deploy) | $0 |
| DNS/CDN/TLS | Cloudflare free plan | $0 |
| Analytics | Cloudflare Web Analytics (cookieless) | $0 |
| Code | Vanilla HTML/CSS/JS, no build step | $0 |

## Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

No dependencies, no build. Edit and refresh.

## Repo layout

```
index.html            homepage (tool grid rendered from registry)
assets/               design system + shared engine (app.js)
tools/<name>/         one self-contained page per tool
docs/                 operations runbook + bot team protocol
.github/workflows/    CI: HTML checks → GitHub Pages deploy
```

## Adding a tool

See `llms.txt` ("Adding a tool"). In short: copy a tool page, edit its JSON-LD +
`window.tbInit`, register it in `assets/js/app.js`, `sitemap.xml`, and the footer.
CI enforces all of it.

## License

MIT — see [LICENSE](LICENSE).
