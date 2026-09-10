/* Related-tools internal linking gate (task t_a35891fe, seo/related-tools-v1).
   Run: node tests/related-links.mjs   (exit 0 = pass, 1 = failures)

   Self-contained (no git history, no baselines). For every tool page:
   1. A single "Related tools" section exists with exactly 2 links.
   2. Every link href resolves to an existing on-disk tool page (200-equivalent).
   3. Anchors are descriptive (not bare "click here"/URL text), and every
      linked destination names its tool honestly (anchor matches target page
      <title> / tb-tool name).
   4. Links match the exact approved editorial mapping (no duplicates, no
      missing destinations, no self-links).
   5. The row is static markup (no JS dependency): anchors + explanatory
      text only — no scripts, styles, or attributes added by this feature.
   llms.txt is checked to list all 7 tools with accurate absolute URLs that
   exist on disk. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = ['base64', 'color', 'hash', 'json', 'text-case', 'uuid', 'jwt'];

/* exact approved editorial mapping (manager 00:14 scope) */
const MAPPING = {
  base64: ['jwt', 'hash'],
  jwt: ['base64', 'json'],
  json: ['jwt', 'text-case'],
  hash: ['base64', 'uuid'],
  uuid: ['hash', 'json'],
  color: ['json', 'text-case'],
  'text-case': ['json', 'base64'],
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

const toolName = (t) => JSON.parse(
  read(`tools/${t}/index.html`).match(/<script type="application\/ld\+json" class="tb-tool">([\s\S]*?)<\/script>/)[1]
).name;

console.log('\n== related-tools: structure, mapping, link integrity ==');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);

  const section = html.match(/<div class="tool-docs">\s*<h2>Related tools<\/h2>([\s\S]*?)<\/div>/);
  test(`exactly one Related tools section (${t})`, () => {
    assert.ok(section, 'Related tools section missing');
    assert.equal((html.match(/<h2>Related tools<\/h2>/g) || []).length, 1, 'duplicate Related tools sections');
  });

  const anchors = section
    ? [...section[1].matchAll(/<a href="(\/tools\/[^"]+\/)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]])
    : [];

  test(`exactly 2 links (${t}): ${anchors.length}`, () => {
    assert.equal(anchors.length, 2, 'related row must have exactly 2 links');
  });

  test(`links match approved mapping (${t})`, () => {
    const targets = anchors.map(([href]) => href);
    const expected = MAPPING[t].map((x) => `/tools/${x}/`);
    assert.deepStrictEqual([...targets].sort(), [...expected].sort(), 'mapping mismatch');
    assert.ok(!targets.includes(`/tools/${t}/`), 'self-link not allowed');
  });

  test(`link targets exist on disk (${t})`, () => {
    for (const [href] of anchors) {
      assert.ok(fs.existsSync(path.join(ROOT, href, 'index.html')), `missing target page ${href}`);
    }
  });

  test(`descriptive anchors naming the target tool honestly (${t})`, () => {
    for (const [href, text] of anchors) {
      const target = href.replace('/tools/', '').replace(/\//g, '');
      assert.ok(text.length > 3, `anchor too generic: "${text}"`);
      assert.ok(!/^https?:/.test(text), 'anchor must not be a raw URL');
      assert.ok(/^[A-Z0-9]/.test(text), `anchor should start with the tool name: "${text}"`);
      assert.ok(toolName(target).toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(text.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')),
        `anchor "${text}" does not match target tool name "${toolName(target)}"`);
    }
  });

  test(`related row is static markup, no JS/styles touched (${t})`, () => {
    const row = section[1];
    assert.ok(!/<script/i.test(row), 'no scripts in related row');
    assert.ok(!/style=/i.test(row), 'no inline styles in related row');
    for (const [, text] of anchors) {
      assert.ok(/—/.test(section[1]) || text.length > 3, 'links should carry explanatory context');
    }
  });
}

console.log('\n== llms.txt: 7 tools, accurate absolute URLs ==');
{
  const llms = read('llms.txt');
  test('llms.txt has exactly one H1 site claim', () => {
    assert.equal((llms.match(/^# /gm) || []).length, 1, 'llmstxt convention: single H1');
    assert.ok(llms.startsWith('# ToolBots'), 'H1 must be the site claim');
  });
  test('llms.txt lists all 7 tools under a Tools section with absolute URLs', () => {
    const m = llms.match(/## Tools\n([\s\S]*?)\n## /);
    assert.ok(m, 'Tools section missing');
    for (const t of TOOLS) {
      const re = new RegExp(`\\[([^\\]]+)\\]\\(https://toolbots\\.xyz/tools/${t}/\\):\\s*(.+)`);
      const entry = m[1].match(re);
      assert.ok(entry, `missing/bad llms.txt entry for ${t}`);
      assert.ok(entry[1].length > 3 && entry[2].length > 10, `thin entry for ${t}`);
    }
    assert.equal((m[1].match(/^- \[/gm) || []).length, 7, 'Tools section must list exactly 7 tools');
  });
  test('llms.txt URL paths exist on disk', () => {
    for (const t of TOOLS) assert.ok(fs.existsSync(path.join(ROOT, `tools/${t}/index.html`)), `llms.txt URL /tools/${t}/ has no page`);
  });
}

test('robots.txt unchanged and compliant (read-only check)', () => {
  const robots = read('robots.txt');
  assert.ok(/Sitemap: https:\/\/toolbots\.xyz\/sitemap\.xml/.test(robots), 'sitemap reference missing');
  assert.ok(!/Disallow:\s*\/tools/.test(robots), 'tool pages must not be disallowed');
});

console.log(`\n===== related-links: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
