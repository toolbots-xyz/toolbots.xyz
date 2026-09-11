/* Focused gate for the JWT worked examples (task t_9010d08c, seo/jwt-examples-v1).
   Run: node tests/jwt-examples.mjs   (exit 0 = pass, 1 = failures)

   Self-contained. Loads the REAL shipped decoder (tools/jwt/logic.js) and:
   1. Extracts the three literal tokens from the page's static <pre> blocks.
   2. Decodes example 1 (HS256 synthetic signature): exact header/payload,
      signatureB64 round-trip, NOT unsecured; expected claims rows (iat/exp ->
      exact UTC strings) via the real claimsInfo.
   3. Decodes example 2 (alg:none, empty signature): exact header/payload,
      unsecured === true, empty signatureB64; iat row exact.
   4. Negative example: invalid signature syntax MUST reject with the exact
      error text quoted on the page.
   5. Status-line strings the page promises (✓ … signature NOT verified /
      ⚠ UNSECURED token … / ✗ Segment 3 …) are consistent with the decoder's
      real behavior (unsecured flag + thrown messages).
   6. Guarantees the page claims are synthetic: no real-looking emails, no
      long random secrets; documented UTC stamps are fixed (2025-01-01/02). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(ROOT, 'tools/jwt/logic.js')).href);
const J = globalThis.TBJWT;

const html = fs.readFileSync(path.join(ROOT, 'tools/jwt/index.html'), 'utf8');
let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
};

const pres = [...html.matchAll(/<pre>([^<]+)<\/pre>/g)].map((m) => m[1]);
const examples = pres.filter((p) => p.split('.').length === 3 || p.endsWith('.'));
const [tok1, tok2, tok3] = examples;

console.log('\n== jwt-examples: page contains exactly three literal example tokens ==');
test('three <pre> example tokens present in static docs', () => {
  assert.equal(examples.length, 3, `expected 3 example tokens, found ${examples.length}`);
});
test('tokens 1-2 are pure base64url/JWT shape; token 3 is intentionally malformed (documented rejection)', () => {
  for (const tok of [tok1, tok2]) {
    assert.ok(!/[<>"']/.test(tok), `HTML artifact inside token: ${tok.slice(0, 30)}…`);
    for (const seg of tok.split('.')) assert.match(seg, /^[A-Za-z0-9_-]*$/, `non-base64url segment: ${seg.slice(0, 20)}…`);
  }
  // token 3 carries an intentionally invalid signature ($$) that MUST be rejected
  assert.ok(tok3.includes('not$$valid$$base64url$$sig'), 'negative token literal changed');
  assert.throws(() => J.decode(tok3), /Segment 3 \(signature\) is not valid Base64URL/);
});
test('no production files other than static docs changed is out of scope here; tokens marked synthetic on page', () => {
  assert.ok(html.includes('synthetic — safe to paste'), 'synthetic disclaimer missing');
  assert.ok(html.includes('Decode does not verify a\n      signature or grant any authorization'), 'decode-is-not-verification disclaimer missing');
});

console.log('\n== jwt-examples: example 1 (HS256 synthetic signature) decodes exactly ==');
const r1 = J.decode(tok1);
test('header is exactly {"alg":"HS256","typ":"JWT"}', () => {
  assert.deepStrictEqual(r1.header, { alg: 'HS256', typ: 'JWT' });
});
test('payload is exactly the documented synthetic object', () => {
  assert.deepStrictEqual(r1.payload, { sub: 'example-toolbot', name: 'Synthetic Example', iat: 1735689600, exp: 1735776000 });
});
test('signature decodes to the synthetic literal; token is NOT flagged unsecured', () => {
  assert.equal(r1.unsecured, false);
  assert.equal(Buffer.from(r1.signatureB64, 'base64url').toString(), 'synthetic-signature-not-verified-do-not-trust');
});
test('claimsInfo rows match documented UTC values (iat/exp, one day apart)', () => {
  const rows = J.claimsInfo(r1.payload);
  assert.deepStrictEqual(rows.map((r) => r.key), ['iat', 'exp']);
  assert.match(rows[0].detail, /2025-01-01 00:00:00 UTC/);
  assert.match(rows[1].detail, /2025-01-02 00:00:00 UTC/);
});
test('page promises "signature NOT verified" status — decoder provides unsecured=false for that path', () => {
  assert.ok(html.includes('signature NOT verified'));
  assert.equal(r1.unsecured, false);
});

console.log('\n== jwt-examples: example 2 (alg none, unsecured) decodes exactly ==');
const r2 = J.decode(tok2);
test('header is exactly {"alg":"none"}', () => {
  assert.deepStrictEqual(r2.header, { alg: 'none' });
});
test('payload is exactly the documented unsecured object', () => {
  assert.deepStrictEqual(r2.payload, { sub: 'unsecured-demo', note: 'structurally complete, cryptographically unsecured', iat: 1735689600 });
});
test('unsecured === true and signature empty; page warns UNSECURED', () => {
  assert.equal(r2.unsecured, true);
  assert.equal(r2.signatureB64, '');
  assert.ok(html.includes('UNSECURED token'), 'page must carry the unsecured warning');
});
test('iat row matches documented UTC value', () => {
  const rows = J.claimsInfo(r2.payload);
  assert.deepStrictEqual(rows.map((r) => r.key), ['iat']);
  assert.match(rows[0].detail, /2025-01-01 00:00:00 UTC/);
});

console.log('\n== jwt-examples: negative example rejects with the exact documented error ==');
test('invalid-signature token throws the exact page-quoted message', () => {
  let msg = null;
  try { J.decode(tok3); } catch (e) { msg = e.message; }
  assert.ok(msg, 'expected rejection');
  assert.equal(msg, 'Segment 3 (signature) is not valid Base64URL. (Syntax is checked here — authenticity is never verified by this tool.)');
  assert.ok(html.includes('Segment 3 (signature) is not valid Base64URL'), 'page must quote the rejection');
});

console.log(`\n===== jwt-examples: ${passed} passed, ${failed} failed =====`);
if (failed > 0) { console.log('Failed:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
