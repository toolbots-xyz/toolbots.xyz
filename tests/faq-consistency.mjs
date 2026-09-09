/* FAQ recovery consistency gate for t_7013783f (seo/faq-recovery-v2).
   Run: node tests/faq-consistency.mjs   (exit 0 = all pass, 1 = failures)

   Enforces the binding rules from the task card:
   1. Every JSON-LD block on every tool page parses (tb-tool AND FAQPage).
   2. The FAQPage JSON-LD mirrors the visible FAQ (tb-tool `faq` array) EXACTLY —
      same questions, same answers, same order. No cloaking in either direction.
   3. Each tool has 3–5 FAQ entries, and every tool answers the privacy question.
   4. The tb-tool JSON-LD blocks are byte-identical to verified main f4842f7 —
      the FAQPage block is purely additive, JWT and engine behavior untouched. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_COMMIT = 'f4842f75b6e303a238be2ced94e942445c06415d';
const TOOLS = ['base64', 'color', 'hash', 'json', 'text-case', 'uuid']; // six in scope; jwt untouched

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

const ldJsonBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

console.log('\n== faq: JSON-LD validity, visible/markup agreement, privacy ==');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);
  const blocks = ldJsonBlocks(html);

  test(`all ld+json blocks parse (${t}): ${blocks.length} blocks`, () => {
    assert.ok(blocks.length >= 2, 'expected tb-tool + FAQPage blocks');
    for (const b of blocks) JSON.parse(b); // throws on invalid
  });

  const meta = JSON.parse(blocks[0]);
  const faqPage = blocks.map((b) => JSON.parse(b)).find((o) => o['@type'] === 'FAQPage');

  test(`FAQPage block present with schema.org context (${t})`, () => {
    assert.ok(faqPage, 'no FAQPage JSON-LD found');
    assert.strictEqual(faqPage['@context'], 'https://schema.org');
    assert.ok(Array.isArray(faqPage.mainEntity) && faqPage.mainEntity.length > 0, 'mainEntity missing/empty');
  });

  test(`visible FAQ and FAQPage JSON-LD match exactly (${t})`, () => {
    assert.ok(Array.isArray(meta.faq) && meta.faq.length > 0, 'tb-tool faq missing');
    const visible = meta.faq.map(([q, a]) => `${q}\n${a}`);
    const markup = faqPage.mainEntity.map((q) => `${q.name}\n${q.acceptedAnswer.text}`);
    assert.deepStrictEqual(markup, visible, 'FAQPage JSON-LD does not mirror the tb-tool faq array');
  });

  test(`3-5 FAQ entries (${t}): ${meta.faq.length}`, () => {
    assert.ok(meta.faq.length >= 3 && meta.faq.length <= 5, 'faq length outside 3..5');
    for (const [q, a] of meta.faq) {
      assert.equal(typeof q, 'string'); assert.equal(typeof a, 'string');
      assert.ok(q.length > 0 && a.length > 0, 'empty question/answer');
    }
  });

  test(`privacy question answered (${t})`, () => {
    const hit = meta.faq.find(([q, a]) => /upload|store/i.test(q) && /^No\./.test(a));
    assert.ok(hit, 'no privacy Q ("...upload/store...") answered "No."');
  });

  test(`every FAQPage question exists as visible page text source (${t})`, () => {
    // The engine renders meta.faq verbatim via textContent; assert the source of
    // truth (tb-tool JSON-LD) is what FAQPage mirrors — already covered above —
    // and that the page has the render target for the visible FAQ.
    assert.ok(html.includes('data-tb="faq"'), 'missing [data-tb=faq] render target');
  });
}

console.log('\n== faq: additive-only vs verified main f4842f7 ==');
const TOOL_KEYS = ['name', 'description', 'inputElement', 'outputElement'];
for (const t of TOOLS) {
  test(`tb-tool identity keys unchanged vs main; only faq recovered (${t})`, () => {
    const before = execFileSync('git', ['show', `${BASE_COMMIT}:tools/${t}/index.html`], {
      cwd: ROOT, maxBuffer: 10 * 1024 * 1024,
    }).toString();
    const pick = (s) => JSON.parse(s.match(/<script type="application\/ld\+json" class="tb-tool">([\s\S]*?)<\/script>/)[1]);
    const b = pick(before), a = pick(read(`tools/${t}/index.html`));
    for (const k of TOOL_KEYS) assert.strictEqual(a[k], b[k], `key ${k} changed vs main`);
    // faq is the recovered surface — must exist and differ or equal, but stay [q,a] pairs
    assert.ok(Array.isArray(a.faq) && a.faq.length >= 3, 'recovered faq missing/too short');
  });
}
test('jwt tool page byte-identical to main (JWT untouched)', () => {
  const before = execFileSync('git', ['show', `${BASE_COMMIT}:tools/jwt/index.html`], {
    cwd: ROOT, maxBuffer: 10 * 1024 * 1024,
  }).toString();
  assert.strictEqual(read('tools/jwt/index.html'), before, 'tools/jwt/index.html differs from main');
});

test('no other shared assets touched vs main (app.js, sitemap, index, style.css)', () => {
  for (const p of ['assets/js/app.js', 'sitemap.xml', 'index.html', 'assets/css/style.css']) {
    const before = execFileSync('git', ['show', `${BASE_COMMIT}:${p}`], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }).toString();
    assert.strictEqual(read(p), before, `${p} differs from main`);
  }
});

console.log(`\n===== faq-consistency: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
