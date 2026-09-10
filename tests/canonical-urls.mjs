/* Canonical URL regression gate — CI-wired (task t_7a8e580c, seo/canonical-ci-v1).
   Run: node tests/canonical-urls.mjs   (exit 0 = pass, 1 = failures)

   Self-contained (no git history, no baselines). Scope is DERIVED from the
   shipped tool registry (TOOLBOTS_TOOLS in assets/js/app.js), not a frozen
   list, so pending tool additions are covered automatically.

   Gates, per registered tool page:
   1. Exactly one <link rel="canonical"> in <head>.
   2. Its href is the exact absolute self URL https://toolbots.xyz/tools/<slug>/
      — never relative (./ or empty) and never another page's URL.
   3. The URL path exists on disk (guards future renames).
   Homepage must carry an absolute canonical to the site root.

   A built-in negative fixture (synthetic HTML with a relative canonical,
   never touching production pages) MUST fail the same check — proving the
   gate bites in CI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* derive tool slugs from the shipped registry (single source of truth) */
const appJs = read('assets/js/app.js');
const reg = appJs.match(/TOOLBOTS_TOOLS = \[([\s\S]*?)\];/);
assert.ok(reg, 'TOOLBOTS_TOOLS registry not found in assets/js/app.js');
const TOOLS = [...reg[1].matchAll(/path: '([^']+)'/g)].map((m) => m[1].replace(/^tools\/|\/$/g, ''));
console.log(`registry-derived tools (${TOOLS.length}): ${TOOLS.join(', ')}`);

let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

/* ---------- the check itself (single source of truth for fixture reuse) ---------- */

const canonicalsOf = (head) => [...head.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"\s*>/g)].map((m) => m[1]);

const canonicalResult = (head, slug) => {
  const tags = canonicalsOf(head);
  if (tags.length !== 1) return { ok: false, reason: `expected exactly one canonical link, found ${tags.length}` };
  if (tags[0] !== `https://toolbots.xyz/tools/${slug}/`) {
    return { ok: false, reason: `canonical must be https://toolbots.xyz/tools/${slug}/, got "${tags[0]}"` };
  }
  return { ok: true };
};

console.log('\n== canonicals: absolute self URLs on every registered tool page ==');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];

  test(`exactly one canonical link, exact absolute self URL (${t})`, () => {
    const r = canonicalResult(head, t);
    assert.ok(r.ok, r.reason);
  });

  test(`canonical path exists on disk (${t})`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, `tools/${t}/index.html`)), 'canonical target missing');
  });
}

test('homepage canonical is absolute site root', () => {
  const head = read('index.html').match(/<head>([\s\S]*?)<\/head>/)[1];
  const tags = canonicalsOf(head);
  assert.equal(tags.length, 1, 'homepage must have exactly one canonical');
  assert.equal(tags[0], 'https://toolbots.xyz/');
});

/* ---------- negative fixtures: the gate MUST bite (no production edits) ---------- */

console.log('\n== canonicals: negative fixtures (synthetic, production untouched) ==');
const headWith = (href) => `<!doctype html><html><head><meta charset="utf-8"><link rel="canonical" href="${href}"><title>t</title></head><body></body></html>`;

test('negative fixture: relative canonical (./) is flagged', () => {
  const r = canonicalResult(headWith('./').match(/<head>([\s\S]*?)<\/head>/)[1], 'json');
  assert.ok(!r.ok, 'relative canonical passed the gate');
  assert.match(r.reason, /canonical must be/);
});

test('negative fixture: empty canonical is flagged', () => {
  const r = canonicalResult(headWith('').match(/<head>([\s\S]*?)<\/head>/)[1], 'json');
  assert.ok(!r.ok, 'empty canonical passed the gate');
});

test('negative fixture: wrong absolute URL (another page) is flagged', () => {
  const r = canonicalResult(headWith('https://toolbots.xyz/tools/hash/').match(/<head>([\s\S]*?)<\/head>/)[1], 'json');
  assert.ok(!r.ok, 'cross-page canonical passed the gate');
});

test('negative fixture: duplicate canonicals are flagged', () => {
  const head = headWith('https://toolbots.xyz/tools/json/').replace('</head>',
    '<link rel="canonical" href="https://toolbots.xyz/tools/json/"></head>');
  const r = canonicalResult(head.match(/<head>([\s\S]*?)<\/head>/)[1], 'json');
  assert.ok(!r.ok, 'duplicate canonicals passed the gate');
  assert.match(r.reason, /exactly one canonical/);
});

console.log(`\n===== canonical-urls: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
