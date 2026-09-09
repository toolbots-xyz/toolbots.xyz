/* Privacy regression negative fixtures — proves the privacy gate actually bites.
   Run: node tests/privacy-negative.mjs   (exit 0 = gate working, 1 = gate is broken)
   Each BAD fixture must produce violations; each CLEAN fixture must produce none. */
import assert from 'node:assert/strict';
import { resourceViolations, includesAppJs, SITE_ORIGIN } from './lib/privacy.mjs';

const BASE = `${SITE_ORIGIN}/tools/json/index.html`;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
}

console.log('\n== privacy fixtures: scanner must FLAG these ==');

test('protocol-relative script src is caught (//evil.example/x.js)', () => {
  const v = resourceViolations('<script src="//evil.example/x.js"></script>', BASE);
  assert.ok(v.length > 0, 'protocol-relative URL bypassed the gate');
  assert.match(v[0], /evil\.example/);
});

test('single-quoted external script is caught', () => {
  const v = resourceViolations("<script src='https://evil.example/x.js'></script>", BASE);
  assert.ok(v.length > 0, 'single-quoted external URL bypassed the gate');
  assert.match(v[0], /evil\.example/);
});

test('mixed-case scheme/host script is caught (HTTPS://EVIL.example)', () => {
  const v = resourceViolations('<SCRIPT SRC="HTTPS://EVIL.EXAMPLE/X.JS" DEFER></SCRIPT>', BASE);
  assert.ok(v.length > 0, 'mixed-case external URL bypassed the gate');
  assert.match(v[0], /evil\.example/i);
});

test('external stylesheet <link> is caught', () => {
  const v = resourceViolations('<link rel="stylesheet" href="https://cdn.evil.example/style.css">', BASE);
  assert.ok(v.length > 0, 'external stylesheet bypassed the gate');
  assert.match(v[0], /cdn\.evil\.example/);
});

test('external tracking-pixel <img> is caught', () => {
  const v = resourceViolations('<img src="//pix.evil.example/1x1.gif" alt="">', BASE);
  assert.ok(v.length > 0, 'external image bypassed the gate');
  assert.match(v[0], /pix\.evil\.example/);
});

test('external <iframe> is caught', () => {
  const v = resourceViolations('<iframe src="//ads.evil.example/frame"></iframe>', BASE);
  assert.ok(v.length > 0, 'external iframe bypassed the gate');
});

test('external <object data> and <source src> are caught', () => {
  const v = resourceViolations('<object data="https://evil.example/o.dat"></object><source src="//evil.example/v.mp4">', BASE);
  assert.ok(v.length === 2, `expected 2 violations, got ${v.length}`);
});

test('analytics beacon with mixed-case host + data-cf-beacon is caught twice over', () => {
  const html = '<script defer src="https://static.CloudflareInsights.com/beacon.min.js" data-cf-beacon=\'{"token": "x"}\'></script>';
  const v = resourceViolations(html, BASE);
  assert.ok(v.length > 0, 'beacon bypassed the gate');
  assert.match(v.join(' '), /CloudflareInsights/i);
});

console.log('== privacy fixtures: scanner must NOT flag these ==');

test('canonical link to site origin is exempt (metadata, not a load)', () => {
  const v = resourceViolations('<link rel="canonical" href="https://toolbots.xyz/">', BASE);
  assert.strictEqual(v.length, 0, `canonical link wrongly flagged: ${v.join('; ')}`);
});

test('alternate/search metadata links are exempt', () => {
  const v = resourceViolations('<link rel="alternate" href="https://toolbots.xyz/llms.txt"><link rel="search" href="https://elsewhere.example/search">', BASE);
  assert.strictEqual(v.length, 0, `metadata links wrongly flagged: ${v.join('; ')}`);
});

test('anchor navigation to GitHub is exempt (not a resource load)', () => {
  const v = resourceViolations('<a href="https://github.com/toolbots-xyz/toolbots.xyz">Source</a>', BASE);
  assert.strictEqual(v.length, 0, `anchor wrongly flagged: ${v.join('; ')}`);
});

test('same-origin script and stylesheet pass', () => {
  const v = resourceViolations('<link rel="stylesheet" href="/assets/css/style.css"><script src="/assets/js/app.js" defer></script>', BASE);
  assert.strictEqual(v.length, 0, `same-origin resources wrongly flagged: ${v.join('; ')}`);
});

test('relative script resolves against page path to site origin', () => {
  const v = resourceViolations('<script src="logic.js"></script>', BASE);
  assert.strictEqual(v.length, 0, `relative script wrongly flagged: ${v.join('; ')}`);
});

test('includesAppJs: relative app.js include is detected', () => {
  assert.ok(includesAppJs('<script src="assets/js/app.js" defer></script>', `${SITE_ORIGIN}/index.html`));
  assert.ok(includesAppJs('<script src="/assets/js/app.js" defer></script>', `${SITE_ORIGIN}/tools/json/index.html`));
  assert.ok(!includesAppJs('<script src="logic.js"></script>', BASE));
});

console.log(`\n===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('GATE IS BROKEN — a fixture escaped the scanner:'); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
