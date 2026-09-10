/* Durable FAQ gate for all tool pages (task t_7013783f, seo/faq-recovery-v2).
   Run: node tests/faq-consistency.mjs   (exit 0 = pass, 1 = failures)

   Self-contained by design: NO git history, NO baselines, NO cross-file
   byte-identity audits — safe on shallow CI checkouts and unaffected by
   future legitimate feature work. Enforces, per tool page:
   1. Every JSON-LD block parses (tb-tool AND FAQPage).
   2. The FAQPage JSON-LD mirrors the visible FAQ source (the tb-tool `faq`
      array the engine renders verbatim) EXACTLY — same questions, answers,
      and order. No cloaking in either direction.
   3. 3–5 FAQ entries per tool, non-empty strings, no duplicate questions.
   4. A privacy question ("...upload/store...") is answered "No.".
   5. The FAQ render target ([data-tb="faq"]) and static FAQ heading exist.
   A built-in negative fixture (deliberately mismatched FAQPage) MUST fail
   the same comparison the real pages go through — proving the gate bites. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = ['base64', 'color', 'hash', 'json', 'text-case', 'uuid'];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

/* ---------- extraction + comparison (single source of truth for the gate) ---------- */

const ldJsonBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const tbToolMeta = (html) =>
  JSON.parse(html.match(/<script type="application\/ld\+json" class="tb-tool">([\s\S]*?)<\/script>/)[1]);

const faqPageBlock = (html) =>
  ldJsonBlocks(html).map((b) => JSON.parse(b)).find((o) => o['@type'] === 'FAQPage') || null;

/* normalized [question, answer] pairs from each FAQ source */
const visiblePairs = (html) => tbToolMeta(html).faq.map(([q, a]) => [q, a]);
const markupPairs = (html) => {
  const fp = faqPageBlock(html);
  return fp ? fp.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]) : null;
};

/* exact agreement: same questions, answers, AND order */
const faqAgrees = (html) => {
  const v = visiblePairs(html), m = markupPairs(html);
  if (!m) return { ok: false, reason: 'no FAQPage JSON-LD block' };
  if (m.length !== v.length) return { ok: false, reason: `entry count differs: visible ${v.length} vs markup ${m.length}` };
  for (let i = 0; i < v.length; i++) {
    if (v[i][0] !== m[i][0]) return { ok: false, reason: `question ${i + 1} differs` };
    if (v[i][1] !== m[i][1]) return { ok: false, reason: `answer ${i + 1} differs` };
  }
  return { ok: true };
};

/* ---------- per-tool gates ---------- */

console.log('\n== faq: JSON-LD validity, visible/markup agreement, privacy ==');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);
  const blocks = ldJsonBlocks(html);

  test(`all ld+json blocks parse (${t}): ${blocks.length} blocks`, () => {
    assert.ok(blocks.length >= 2, 'expected tb-tool + FAQPage blocks');
    for (const b of blocks) JSON.parse(b); // throws on invalid
  });

  test(`FAQPage block present with schema.org context (${t})`, () => {
    const fp = faqPageBlock(html);
    assert.ok(fp, 'no FAQPage JSON-LD found');
    assert.strictEqual(fp['@context'], 'https://schema.org');
    assert.ok(Array.isArray(fp.mainEntity) && fp.mainEntity.length > 0, 'mainEntity missing/empty');
    for (const q of fp.mainEntity) {
      assert.strictEqual(q['@type'], 'Question', 'mainEntity entry not a Question');
      assert.strictEqual(q.acceptedAnswer['@type'], 'Answer', 'acceptedAnswer not an Answer');
    }
  });

  test(`visible FAQ and FAQPage JSON-LD match exactly (${t})`, () => {
    const r = faqAgrees(html);
    assert.ok(r.ok, r.reason);
  });

  test(`3-5 FAQ entries, non-empty, no duplicates (${t}): ${visiblePairs(html).length}`, () => {
    const v = visiblePairs(html);
    assert.ok(v.length >= 3 && v.length <= 5, 'faq length outside 3..5');
    const seen = new Set();
    for (const [q, a] of v) {
      assert.equal(typeof q, 'string'); assert.equal(typeof a, 'string');
      assert.ok(q.length > 0 && a.length > 0, 'empty question/answer');
      assert.ok(!seen.has(q), `duplicate question: ${q}`);
      seen.add(q);
    }
  });

  test(`privacy question answered "No." (${t})`, () => {
    const hit = visiblePairs(html).find(([q, a]) => /upload|store/i.test(q) && /^No\./.test(a));
    assert.ok(hit, 'no privacy Q ("...upload/store...") answered "No."');
  });

  test(`FAQ render target + heading present (${t})`, () => {
    assert.ok(html.includes('data-tb="faq"'), 'missing [data-tb=faq] render target');
    assert.ok(/<h2>\s*FAQ\s*<\/h2>/.test(html), 'missing static FAQ heading');
  });
}

/* ---------- negative fixture: the gate MUST fail on a mismatch ---------- */

console.log('\n== faq: negative fixtures (gate must bite) ==');
const FIXTURE_TMPL = (faqAnswer, schemaAnswer) => `<!doctype html><html><head>
<script type="application/ld+json" class="tb-tool">
{"name":"X","description":"d","inputElement":"i","outputElement":"o","faq":[
["Is base64 encryption?","${faqAnswer}"],
["Does this tool upload my text?","No. It runs in your browser."]]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"Is base64 encryption?","acceptedAnswer":{"@type":"Answer","text":"${schemaAnswer}"}},
{"@type":"Question","name":"Does this tool upload my text?","acceptedAnswer":{"@type":"Answer","text":"No. It runs in your browser."}}]}
</script>
</head><body><div class="tool-docs"><h2>FAQ</h2><div data-tb="faq"></div></div></body></html>`;

test('negative fixture: altered FAQPage answer is flagged', () => {
  const bad = FIXTURE_TMPL('It is reversible.', 'It is REVERSIBLE and secret.');
  const r = faqAgrees(bad);
  assert.ok(!r.ok, 'mismatched fixture passed the gate');
  assert.match(r.reason, /answer 1 differs/);
});

test('negative fixture: missing question in FAQPage is flagged', () => {
  const bad = FIXTURE_TMPL('Same.', 'Same.').replace(
    /,\s*\{"@type":"Question","name":"Does this tool upload my text\?"[\s\S]*?\}\]/, ']');
  const r = faqAgrees(bad);
  assert.ok(!r.ok, 'missing-entry fixture passed the gate');
  assert.match(r.reason, /entry count differs/);
});

test('negative fixture: reordered questions are flagged (order matters)', () => {
  const fp = JSON.parse(ldJsonBlocks(FIXTURE_TMPL('Same.', 'Same.'))[1]);
  fp.mainEntity.reverse();
  const reordered = FIXTURE_TMPL('Same.', 'Same.').replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    '<script type="application/ld+json">' + JSON.stringify(fp) + '</script>');
  const r = faqAgrees(reordered);
  assert.ok(!r.ok, 'reordered fixture passed the gate');
  assert.match(r.reason, /question 1 differs/);
});

console.log(`\n===== faq-consistency: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
