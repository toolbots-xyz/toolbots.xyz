/* Canonical URL regression gate (task t_a84f720c, fix/absolute-canonicals).
   Run: node tests/canonical-urls.mjs   (exit 0 = pass, 1 = failures)

   Self-contained (no git history, no baselines). For every tool page:
   1. Exactly one <link rel="canonical"> in <head>.
   2. Its href is the exact absolute self URL https://toolbots.xyz/tools/<slug>/
      — never relative (./ or empty) and never another page's URL.
   3. The URL path exists on disk (guards future renames).
   Homepage must carry an absolute canonical to the site root. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = ['base64', 'color', 'hash', 'json', 'text-case', 'uuid', 'jwt'];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

console.log('\n== canonicals: absolute self URLs on every tool page ==');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const tags = [...head.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"\s*>/g)].map((m) => m[1]);

  test(`exactly one canonical link (${t}): ${tags.length}`, () => {
    assert.equal(tags.length, 1, 'expected exactly one <link rel="canonical"> in head');
  });

  test(`canonical is exact absolute self URL (${t})`, () => {
    assert.equal(tags[0], `https://toolbots.xyz/tools/${t}/`, `canonical must be https://toolbots.xyz/tools/${t}/`);
    assert.ok(!/^\.{0,2}\//.test(tags[0]), 'relative canonical not allowed');
  });

  test(`canonical path exists on disk (${t})`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, `tools/${t}/index.html`)), 'canonical target missing');
  });
}

test('homepage canonical is absolute site root', () => {
  const head = read('index.html').match(/<head>([\s\S]*?)<\/head>/)[1];
  const tags = [...head.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"\s*>/g)].map((m) => m[1]);
  assert.equal(tags.length, 1, 'homepage must have exactly one canonical');
  assert.equal(tags[0], 'https://toolbots.xyz/');
});

console.log(`\n===== canonical-urls: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
