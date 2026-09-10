#!/bin/bash
# Local replay of the CI `check` job's HTML sanity checks (deploy.yml lines 33-66).
set -e
cd "$(dirname "$0")/.." || exit 1
fail=0
for f in tools/*/index.html; do
  grep -q 'class="tb-tool"' "$f" || { echo "MISSING tb-tool JSON-LD: $f"; fail=1; }
  grep -q 'assets/js/app.js' "$f" || { echo "MISSING app.js include: $f"; fail=1; }
  grep -q 'data-tb="copy-btn"' "$f" || { echo "MISSING copy-btn: $f"; fail=1; }
  grep -q 'data-tb="clear-btn"' "$f" || { echo "MISSING clear-btn: $f"; fail=1; }
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8').match(/<script type=\"application\/ld\+json\" class=\"tb-tool\">([\s\S]*?)<\/script>/)[1])" || { echo "BAD JSON-LD: $f"; fail=1; }
done
if grep -nEi '<(script|img|iframe|source|track|embed)[^>]*\ssrc\s*=\s*("|\x27)?(https?:)?//|<object[^>]*\sdata\s*=\s*("|\x27)?(https?:)?//' index.html 404.html tools/*/index.html; then
  echo "NON-SAME-ORIGIN RESOURCE REFERENCE FOUND (privacy regression)"; fail=1
fi
node -e "
  const fs = require('fs');
  const reg = fs.readFileSync('assets/js/app.js','utf8').match(/TOOLBOTS_TOOLS = \[([\s\S]*?)\];/)[1];
  const paths = [...reg.matchAll(/path: '([^']+)'/g)].map(m => m[1]);
  const sm = fs.readFileSync('sitemap.xml','utf8');
  const idx = fs.readFileSync('index.html','utf8');
  for (const p of paths) {
    if (!fs.existsSync(p + 'index.html')) { console.error('registry path missing on disk: ' + p); process.exit(1); }
    if (!sm.includes('toolbots.xyz/' + p)) { console.error('sitemap missing: ' + p); process.exit(1); }
  }
  const foot = idx.match(/<nav class=\"footer-col\" aria-label=\"Tools\">([\s\S]*?)<\/nav>/)[1];
  for (const p of paths) if (!foot.includes('href=\"/' + p + '\"')) { console.error('footer missing: ' + p); process.exit(1); }
  console.log('registry/sitemap/footer consistent:', paths.length, 'tools');
"
[ $fail -eq 0 ] && echo "All checks passed." || exit 1
