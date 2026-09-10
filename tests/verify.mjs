/* ToolBots QA suite — structural consistency + logic tests.
   Run: node tests/verify.mjs   (exit 0 = all pass, 1 = failures) */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---------- tiny harness ---------- */
let passed = 0, failed = 0, group = '';
const failures = [];
const line = (s) => console.log(s);
function startGroup(name) { group = name; line(`\n== ${name} ==`); }
function test(name, fn) {
  try { fn(); passed++; line(`  PASS  ${name}`); }
  catch (e) { failed++; failures.push(`${group} :: ${name}`); line(`  FAIL  ${name}\n        ${e && e.message ? e.message.split('\n')[0] : e}`); }
}

const TOOLS = ['json', 'base64', 'hash', 'text-case', 'uuid', 'color', 'jwt', 'cron'];
const TOOL_PATHS = TOOLS.map((t) => `tools/${t}/`);

/* ================= STRUCTURE ================= */

startGroup('structure: JSON-LD tool metadata');
for (const t of TOOLS) {
  test(`JSON-LD parses & has required keys (${t})`, () => {
    const html = read(`tools/${t}/index.html`);
    const m = html.match(/<script type="application\/ld\+json" class="tb-tool">([\s\S]*?)<\/script>/);
    assert.ok(m, 'tb-tool JSON-LD script tag not found');
    const meta = JSON.parse(m[1]); // throws if invalid
    for (const k of ['name', 'description', 'inputElement', 'outputElement']) {
      assert.ok(typeof meta[k] === 'string' && meta[k].length > 0, `key ${k} missing/empty`);
    }
    assert.ok(Array.isArray(meta.faq), 'faq is not an array');
    assert.ok(meta.faq.length > 0, 'faq is empty');
    for (const pair of meta.faq) {
      assert.ok(Array.isArray(pair) && pair.length === 2 &&
        typeof pair[0] === 'string' && typeof pair[1] === 'string',
        'faq entries must be [question, answer] string pairs');
    }
  });
}

startGroup('structure: app.js registry ↔ disk');
{
  const appJs = read('assets/js/app.js');
  const m = appJs.match(/TOOLBOTS_TOOLS = \[([\s\S]*?)\];/);
  assert.ok(m, 'TOOLBOTS_TOOLS not found in assets/js/app.js');
  const regPaths = [...m[1].matchAll(/path: '([^']+)'/g)].map((x) => x[1]);
  test('registry lists exactly the 8 tool paths', () => {
    assert.deepStrictEqual([...regPaths].sort(), [...TOOL_PATHS].sort());
    assert.strictEqual(regPaths.length, 8);
  });
  for (const p of regPaths) {
    test(`registry path exists on disk with index.html: ${p}`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, p, 'index.html')), `missing ${p}index.html`);
    });
  }
}

startGroup('structure: sitemap.xml');
{
  const sm = read('sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  test('sitemap has homepage <loc>', () => {
    assert.ok(locs.includes('https://toolbots.xyz/'), `homepage loc missing; got ${JSON.stringify(locs)}`);
  });
  for (const t of TOOLS) {
    test(`sitemap has <loc> for /tools/${t}/`, () => {
      assert.ok(locs.includes(`https://toolbots.xyz/tools/${t}/`));
    });
  }
}

startGroup('structure: homepage footer nav');
{
  const idx = read('index.html');
  const fm = idx.match(/<nav class="footer-col" aria-label="Tools">([\s\S]*?)<\/nav>/);
  assert.ok(fm, 'homepage footer Tools nav not found');
  for (const t of TOOLS) {
    test(`footer nav links to /tools/${t}/`, () => {
      assert.ok(fm[1].includes(`href="/tools/${t}/"`), `footer link missing for ${t}`);
    });
  }
}

startGroup('structure: homepage asset references');
test('index.html references assets/js/app.js', () => {
  assert.ok(read('index.html').includes('assets/js/app.js'));
});
test('index.html references assets/css/style.css', () => {
  assert.ok(read('index.html').includes('assets/css/style.css'));
});
test('assets/js/app.js exists on disk', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/js/app.js')));
});
test('assets/css/style.css exists on disk', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/css/style.css')));
});

startGroup('structure: tool page includes & buttons');
for (const t of TOOLS) {
  const html = read(`tools/${t}/index.html`);
  test(`references /assets/js/app.js (${t})`, () => {
    assert.ok(html.includes('src="/assets/js/app.js"'), 'missing app.js script include');
  });
  test(`has data-tb="copy-btn" (${t})`, () => {
    assert.ok(html.includes('data-tb="copy-btn"'));
  });
  test(`has data-tb="clear-btn" (${t})`, () => {
    assert.ok(html.includes('data-tb="clear-btn"'));
  });
}

startGroup('structure: deploy.yml is valid YAML');
test('deploy.yml parses as YAML (pyyaml via uv, else js-yaml, else skip)', () => {
  const wf = path.join(ROOT, '.github/workflows/deploy.yml');
  assert.ok(fs.existsSync(wf), 'deploy.yml missing');
  const parseCmds = [
    ['python3', ['-c', 'import yaml,sys; yaml.safe_load(open(sys.argv[1])); print("yaml-ok")', wf]],
    ['uv', ['run', '--with', 'pyyaml', 'python3', '-c', 'import yaml,sys; yaml.safe_load(open(sys.argv[1])); print("yaml-ok")', wf]],
    ['node', ['-e', 'const y=require("js-yaml"); y.load(require("fs").readFileSync(process.argv[1],"utf8")); console.log("yaml-ok")', wf]],
  ];
  for (const [cmd, args] of parseCmds) {
    try {
      const out = execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      assert.ok(out.includes('yaml-ok'));
      line(`        (validated with ${cmd})`);
      return;
    } catch (e) {
      const errText = String((e && e.stderr) || '') + String((e && e.stdout) || '') + String((e && e.message) || '');
      const isNotFound = e && (e.code === 'ENOENT' || e.code === 'MODULE_NOT_FOUND');
      const isMissingModule = errText.includes('ModuleNotFoundError') || errText.includes('Cannot find module');
      if (isNotFound || isMissingModule) continue;    // parser unavailable → try next
      throw e;                                        // parser ran and rejected the YAML → real failure
    }
  }
  line('        (SKIPPED: no YAML parser available — pyyaml, uv+pyyaml, and js-yaml all unavailable)');
});

/* ================= LOGIC ================= */

startGroup('logic: loading logic.js modules');
await import(pathToFileURL(path.join(ROOT, 'tools/text-case/logic.js')).href);
await import(pathToFileURL(path.join(ROOT, 'tools/base64/logic.js')).href);
await import(pathToFileURL(path.join(ROOT, 'tools/color/logic.js')).href);
await import(pathToFileURL(path.join(ROOT, 'tools/jwt/logic.js')).href);
await import(pathToFileURL(path.join(ROOT, 'tools/cron/logic.js')).href);
const C = globalThis.TBTextCase, B = globalThis.TBBase64, K = globalThis.TBColor, W = globalThis.TBJWT, CR = globalThis.TBCron;
test('namespaces exported on globalThis', () => {
  assert.ok(C && B && K && W && CR, 'TBTextCase/TBBase64/TBColor/TBJWT/TBCron must all be defined');
});

startGroup('logic: text-case');
test("title('the quick brown fox') === 'The Quick Brown Fox'", () => {
  assert.strictEqual(C.title('the quick brown fox'), 'The Quick Brown Fox');
});
test("camel('hello world-test') === 'helloWorldTest'", () => {
  assert.strictEqual(C.camel('hello world-test'), 'helloWorldTest');
});
test("snake('HelloWorld') === 'hello_world'", () => {
  assert.strictEqual(C.snake('HelloWorld'), 'hello_world');
});
test("kebab('CONSTANT CASE') === 'constant-case'", () => {
  assert.strictEqual(C.kebab('CONSTANT CASE'), 'constant-case');
});
test("pascal('foo bar') === 'FooBar'", () => {
  assert.strictEqual(C.pascal('foo bar'), 'FooBar');
});
test("sentence('hello there. how ARE you') === 'Hello there. How are you'", () => {
  assert.strictEqual(C.sentence('hello there. how ARE you'), 'Hello there. How are you');
});
test('upper sanity', () => {
  assert.strictEqual(C.upper('foo Bar baz'), 'FOO BAR BAZ');
});
test('lower sanity', () => {
  assert.strictEqual(C.lower('FOO Bar baz'), 'foo bar baz');
});
test("constant sanity: constant('hello world') === 'HELLO_WORLD'", () => {
  assert.strictEqual(C.constant('hello world'), 'HELLO_WORLD');
});
test("unicode: camel('café au lait') === 'caféAuLait'", () => {
  assert.strictEqual(C.camel('café au lait'), 'caféAuLait');
});

startGroup('logic: base64');
test("encode('hello') === 'aGVsbG8='", () => {
  assert.strictEqual(B.encode('hello'), 'aGVsbG8=');
});
test("decode('aGVsbG8=') === 'hello'", () => {
  assert.strictEqual(B.decode('aGVsbG8='), 'hello');
});
test("round-trip 'héllo ✓ 日本語'", () => {
  const s = 'héllo ✓ 日本語';
  assert.strictEqual(B.decode(B.encode(s)), s);
});
test("urlSafeEncode replaces '+' with '-' ('!!>' → 'ISE-')", () => {
  const u = B.urlSafeEncode('!!>');            // btoa('!!>') === 'ISE+'
  assert.strictEqual(u, 'ISE-');
  assert.ok(!u.includes('+') && !u.includes('/') && !u.includes('='));
});
test("urlSafeEncode replaces '/' with '_' ('!!?' → 'ISE_')", () => {
  const u = B.urlSafeEncode('!!?');            // btoa('!!?') === 'ISE/'
  assert.strictEqual(u, 'ISE_');
});
test("urlSafeEncode('!!>!!?') === 'ISE-ISE_' (both specials in one output)", () => {
  assert.strictEqual(B.urlSafeEncode('!!>!!?'), 'ISE-ISE_');
});
test('url-safe round-trip (incl. padding stripped, whitespace tolerated)', () => {
  const s = '!!>?? ~~ héllo ✓ 日本語 +++///___---';
  assert.strictEqual(B.urlSafeDecode(B.urlSafeEncode(s)), s);
  assert.strictEqual(B.decode(B.urlSafeEncode(s)), s); // decode auto-detects -/_
});
test('decode tolerates whitespace in standard base64', () => {
  assert.strictEqual(B.decode('aGVs\nbG8 ='), 'hello');
});

startGroup('logic: color');
test("hex2rgb('#22d3ee') deep-equals {r:34,g:211,b:238}", () => {
  assert.deepStrictEqual(K.hex2rgb('#22d3ee'), { r: 34, g: 211, b: 238 });
});
test("hex2rgb('#abc') expands to {r:170,g:187,b:204}", () => {
  assert.deepStrictEqual(K.hex2rgb('#abc'), { r: 170, g: 187, b: 204 });
});
test("hex2rgb accepts bare hex without '#' and returns null on garbage", () => {
  assert.deepStrictEqual(K.hex2rgb('22d3ee'), { r: 34, g: 211, b: 238 });
  assert.strictEqual(K.hex2rgb('nothex'), null);
});
test('rgb2hsl({r:34,g:211,b:238}) → h≈188 (±1) — see anomaly note: spec vector said 187', () => {
  const { h } = K.rgb2hsl({ r: 34, g: 211, b: 238 });
  assert.ok(Math.abs(h - 188) <= 1, `h=${h}, expected ≈188`);
});
test('rgb2hsl({r:34,g:211,b:238}) → s≈86 (±1) — see anomaly note: spec vector said 79', () => {
  const { s } = K.rgb2hsl({ r: 34, g: 211, b: 238 });
  assert.ok(Math.abs(s - 86) <= 1, `s=${s}, expected ≈86`);
});
test('rgb2hsl({r:34,g:211,b:238}) → l≈53 (±1) — see anomaly note: spec vector said 49', () => {
  const { l } = K.rgb2hsl({ r: 34, g: 211, b: 238 });
  assert.ok(Math.abs(l - 53) <= 1, `l=${l}, expected ≈53`);
});
test('contrastRatio of #000 vs #fff === 21 (±0.01)', () => {
  const r = K.contrastRatio(K.luminance({ r: 0, g: 0, b: 0 }), K.luminance({ r: 255, g: 255, b: 255 }));
  assert.ok(Math.abs(r - 21) <= 0.01, `ratio=${r}`);
});
test("toHex(hex2rgb('#FF0000')) === '#ff0000'", () => {
  assert.strictEqual(K.toHex(K.hex2rgb('#FF0000')), '#ff0000');
});
test('mix sanity: 50% of red toward white → {r:255,g:128,b:128}', () => {
  assert.deepStrictEqual(K.mix({ r: 255, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5), { r: 255, g: 128, b: 128 });
});
test('round-trip hex → rgb → hex for 20 random colors', () => {
  for (let i = 0; i < 20; i++) {
    const rgb = { r: Math.floor(Math.random() * 256), g: Math.floor(Math.random() * 256), b: Math.floor(Math.random() * 256) };
    const hex = K.toHex(rgb);
    assert.match(hex, /^#[0-9a-f]{6}$/);
    assert.deepStrictEqual(K.hex2rgb(hex), rgb, `round-trip failed for ${hex}`);
  }
});

/* ---------- jwt ---------- */
startGroup('logic: jwt');
/* canonical jwt.io example token (HS256; decode-only — no secret involved) */
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const b64urlObj = (o) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const H = b64urlObj({ alg: 'HS256', typ: 'JWT' });
test('decodes the canonical example token', () => {
  const r = W.decode(JWT_TOKEN);
  assert.deepStrictEqual(r.header, { alg: 'HS256', typ: 'JWT' });
  assert.deepStrictEqual(r.payload, { sub: '1234567890', name: 'John Doe', iat: 1516239022 });
  assert.strictEqual(r.signatureB64, 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  assert.strictEqual(r.headerB64, JWT_TOKEN.split('.')[0]);
});
test('tolerates Bearer prefix, whitespace, and newlines', () => {
  const r = W.decode('Bearer\t\n ' + JWT_TOKEN.slice(0, 40) + '\n  ' + JWT_TOKEN.slice(40) + ' ');
  assert.deepStrictEqual(r.header, { alg: 'HS256', typ: 'JWT' });
});
test('decodes unicode payloads (UTF-8: emoji, CJK, combining marks)', () => {
  const payload = { name: 'é🎉中文e\u0301', note: '制限あり 🔐' };
  const token = b64urlObj({ alg: 'HS256', typ: 'JWT' }) + '.' + b64urlObj(payload) + '.' + 'A'.repeat(43);
  const r = W.decode(token);
  assert.deepStrictEqual(r.payload, payload);
});
test('rejects missing/extra segments with actionable message', () => {
  assert.throws(() => W.decode('onlyone'), /expected header\.payload\.signature.*got 1/s);
  assert.throws(() => W.decode('a.b'), /got 2/);
  assert.throws(() => W.decode('a.b.c.d'), /got 4/);
  const jwe = 'v.' + b64urlObj({ alg: 'HS256' }) + '.x.y.z';
  assert.throws(() => W.decode(jwe), /got 5|JWE/);
});
test('rejects invalid base64url per segment', () => {
  const h = b64urlObj({ alg: 'HS256' });
  assert.throws(() => W.decode(h.replace('e', '!!') + '.' + h + '.sig'), /Segment 1 .*not valid Base64URL/);
  assert.throws(() => W.decode(h + '.' + 'not@valid!' + '.sig'), /Segment 2 .*not valid Base64URL/);
});
test('rejects empty segments', () => {
  assert.throws(() => W.decode('..sig'), /Segment 1 .*is empty/);
  const h = b64urlObj({ alg: 'HS256' });
  assert.throws(() => W.decode(h + '.' + '' + '.sig'), /Segment 2 .*is empty/);
});
test('rejects invalid JSON and non-object JSON', () => {
  const badB64 = (s) => Buffer.from(s).toString('base64url');
  const SIG = 'A'.repeat(43); // real-length signature so validation reaches the JSON checks
  assert.throws(() => W.decode(badB64('not-json') + '.' + b64urlObj({ a: 1 }) + '.' + SIG), /Header is not valid JSON/);
  assert.throws(() => W.decode(b64urlObj({ alg: 'HS256' }) + '.' + badB64('[1,2,3]') + '.' + SIG), /Payload must be a JSON object/);
  assert.throws(() => W.decode(b64urlObj({ alg: 'HS256' }) + '.' + badB64('"str"') + '.' + SIG), /Payload must be a JSON object/);
});
test('oversized input is rejected without decoding', () => {
  const big = 'e'.repeat(1000001);
  assert.throws(() => W.decode(big), /Token too large/);
});
test('signature syntax is base64url-strict; no guessed plausibility bounds', () => {
  assert.throws(() => W.decode(H + '.e30.%%%'), /Segment 3 .*not valid Base64URL/);
  assert.throws(() => W.decode(H + '.e30.a'), /Segment 3 .*not valid Base64URL/); // 1 char = incomplete b64
  // short-but-valid signatures decode (decode-only; no authenticity judgement)
  const shortSig = W.decode(H + '.e30.ab');
  assert.strictEqual(shortSig.signatureB64, 'ab');
  assert.strictEqual(shortSig.unsecured, false);
  // very long (still valid base64url) signature decodes; the 1M input cap is the only size bound
  const longSig = 'A'.repeat(4100);
  const long = W.decode(H + '.e30.' + longSig);
  assert.strictEqual(long.signatureB64, longSig);
  // a real-length HS256 signature still decodes fine
  const r = W.decode(H + '.e30.' + Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'));
  assert.strictEqual(r.unsecured, false);
});
test('empty signature policy: rejected unless header declares alg "none"', () => {
  assert.throws(() => W.decode(H + '.e30.'), /empty signature is only valid for unsecured tokens with alg "none"/);
  const r = W.decode(b64urlObj({ alg: 'none' }) + '.e30.');
  assert.strictEqual(r.unsecured, true);
  assert.strictEqual(r.signatureB64, '');
  assert.deepStrictEqual(r.header, { alg: 'none' });
});
test('alg:none contradiction: nonempty signature with alg "none" is malformed', () => {
  assert.throws(() => W.decode(b64urlObj({ alg: 'none' }) + '.e30.' + 'A'.repeat(43)),
    /alg "none" .*but the token carries a signature/);
  // even a short nonempty signature contradicts alg:none
  assert.throws(() => W.decode(b64urlObj({ alg: 'none' }) + '.e30.ab'),
    /alg "none" .*but the token carries a signature/);
});
test('short valid byte-signature round-trips (e.g. 16 bytes) without plausibility gating', () => {
  const sig16 = Buffer.from(new Uint8Array(16).fill(0x2a)).toString('base64url');
  const r = W.decode(H + '.' + b64urlObj({ ok: 1 }) + '.' + sig16);
  assert.strictEqual(r.signatureB64, sig16);
  assert.strictEqual(r.unsecured, false);
  // single valid byte (1 char padded to 2 b64url chars is invalid; 2 chars = 1 byte) is fine syntactically
  const oneByte = Buffer.from([0xff & 0x7f]).toString('base64url'); // 'AQ' style, 2 chars
  const r1 = W.decode(H + '.e30.' + oneByte);
  assert.strictEqual(r1.unsecured, false);
});
test('invalid UTF-8 in payload or header is fatal (no silent U+FFFD)', () => {
  const ff = Buffer.from([0xff]).toString('base64url');
  assert.throws(() => W.decode(H + '.' + ff + '.sig'), /Segment 2 \(payload\) is not valid UTF-8/);
  assert.throws(() => W.decode(ff + '.' + b64urlObj({ a: 1 }) + '.s'), /Segment 1 \(header\) is not valid UTF-8/);
  const mixed = Buffer.concat([Buffer.from('{"a":"x"}', 'utf8'), Buffer.from([0xff])]).toString('base64url');
  assert.throws(() => W.decode(H + '.' + mixed + '.s'), /not valid UTF-8/);
});
test('boundary: token just under the 1,000,000-char input limit decodes fine', () => {
  // header (~43) + payload b64url (~998,680) + sig (43) + 2 dots ≈ 998,768 total
  const payload = { pad: 'x'.repeat(749000) };
  const tok = b64urlObj({ alg: 'HS256' }) + '.' + b64urlObj(payload) + '.' + 'A'.repeat(43);
  assert.ok(tok.length < 1000000 && tok.length > 990000, `token length ${tok.length} not in boundary range`);
  const r = W.decode(tok);
  assert.strictEqual(typeof r.payload.pad, 'string');
});
test('claimsInfo renders iat/nbf/exp rows with UTC detail; skips absent; flags non-numeric', () => {
  const rows = W.claimsInfo({ iat: 1516239022, exp: 'soon', nbf: 1516239022 });
  assert.deepStrictEqual(rows.map((r) => r.key), ['iat', 'nbf', 'exp']);
  assert.match(rows[0].detail, /2018-01-18 01:30:22 UTC/);
  assert.strictEqual(rows[2].detail, 'not a NumericDate (seconds)');
});
test('claimsInfo returns [] for payloads without timestamp claims', () => {
  assert.deepStrictEqual(W.claimsInfo({ sub: 'x' }), []);
  assert.deepStrictEqual(W.claimsInfo(null), []);
});
test('humanSpan formats spans sanely', () => {
  assert.strictEqual(W.humanSpan(0), '1 sec');
  assert.strictEqual(W.humanSpan(90 * 1000), '2 min');
  assert.strictEqual(W.humanSpan(2 * 3600 * 1000), '2 hours');
  assert.strictEqual(W.humanSpan(3 * 86400 * 1000), '3 days');
});

/* ---------- cron ---------- */
startGroup('logic: cron');
/* fixtures F1-F15 per research contract (t_e2690da2, primary sources:
   OpenBSD/Debian crontab(5) + cronie cron.c/entry.c) */
const dec = (t) => CR.decode(t);
const rej = (t) => { try { dec(t); } catch (e) { return e; } throw new Error('expected rejection for ' + t); };

test('F1: */5 * * * * -> every 5 minutes', () => {
  const r = dec('*/5 * * * *');
  assert.match(r.description.combined, /minutes 0, 5, 10, .*55/);
  assert.match(r.description.combined, /every day/);
});
test('F2: 0 9-17 * * 1-5 -> inclusive ranges, weekdays', () => {
  const r = dec('0 9-17 * * 1-5');
  assert.match(r.description.combined, /from 09 through 17/);
  assert.match(r.description.combined, /Monday.*Friday/s);
});
test('F3: 0 12 * * 0 -> Sunday (0)', () => {
  assert.match(dec('0 12 * * 0').description.combined, /Sunday/);
});
test('F4: 0 12 * * 7 -> 7 == Sunday, same schedule as F3', () => {
  assert.match(dec('0 12 * * 7').description.combined, /Sunday/);
  assert.match(dec('0 12 * * 7').description.notes.join(' '), /7 in day-of-week|normalized/);
});
test('F5: 30 4 1,15 * 5 -> OR semantics (OpenBSD verbatim example)', () => {
  const r = dec('30 4 1,15 * 5');
  assert.match(r.description.combined, /04:30/);
  assert.match(r.description.combined, /day-of-month 1, 15 OR day-of-week Friday/);
  assert.ok(r.description.notes.some((n) => /OR caution|UNION/.test(n)));
});
test('F6: */45 * * * * -> minutes {0,45} with non-span caution', () => {
  const r = dec('*/45 * * * *');
  assert.match(r.description.combined, /minutes 0, 45/);
  assert.ok(r.description.notes.some((n) => /resets every hour|NOT once every 45/.test(n)));
});
test('F7: 0 0 */2 * * -> odd days, starred anchoring note', () => {
  const r = dec('0 0 */2 * *');
  assert.match(r.description.combined, /day-of-month is 1, 3, 5/);
  assert.ok(r.description.notes.some((n) => /anchors at the field minimum/.test(n)));
});
test('F8: 0 0 */2 * 1 -> AND semantics (star-step still counts as starred)', () => {
  const r = dec('0 0 */2 * 1');
  assert.match(r.description.combined, /day-of-month is 1, 3, 5.*AND day-of-week is Monday/);
  assert.ok(r.description.notes.some((n) => /AND semantics/.test(n)));
  assert.doesNotMatch(r.description.combined, /OR/);
});
test('F9: 0 0 1-15 * 1 -> OR semantics (explicit range is restricted)', () => {
  const r = dec('0 0 1-15 * 1');
  assert.match(r.description.combined, /day-of-month 1, 2, .*15 OR day-of-week Monday/);
  assert.ok(r.description.notes.some((n) => /OR caution|UNION/.test(n)));
});
test('full-range DOM + restricted DOW -> OR union yields every calendar day (0 0 1-31 * 1)', () => {
  const r = dec('0 0 1-31 * 1');
  // explicit 1-31 is RESTRICTED (does not start with *), so OR with Monday = every day
  assert.match(r.description.combined, /every calendar day \(all of 1-31\) OR day-of-week Monday/);
  // and the expansion must preserve the semantics
  const re = dec(r.expanded);
  assert.strictEqual(re.description.combined, r.description.combined);
});
test('original-vs-expanded round trips preserve semantics (day-rule cases)', () => {
  const cases = ['0 0 */2 * 1', '0 0 1-15 * 1', '0 0 1-31 * 1', '30 4 1,15 * 5',
    '*/45 * * * *', '0 9-17 * * 1-5', '*/5 * * * *', '0 0 */2 * *', '0 12 * * 0', '0 12 * * 7'];
  for (const t of cases) {
    const a = dec(t);
    const b = dec(a.expanded);
    assert.strictEqual(b.description.combined, a.description.combined,
      `expansion of "${t}" -> "${a.expanded}" changed semantics`);
  }
});
test('star-step stays starred in the expansion (no list re-encoding of day fields)', () => {
  const r = dec('0 0 */2 * 1');
  assert.strictEqual(r.expanded, '0 0 */2 * 1');
  const re = dec(r.expanded);
  assert.match(re.description.combined, /AND/);
});
test('F10: month name JAN -> rejected as unsupported in v1 (not "invalid")', () => {
  const e = rej('0 0 * * JAN');
  assert.match(e.errors[0].message, /valid in Vixie-derived cron but unsupported in v1/);
});
test('F11: DOW name range MON-FRI -> rejected as unsupported in v1', () => {
  const e = rej('0 0 * * MON-FRI');
  assert.match(e.errors[0].message, /unsupported in v1/);
});
test('F12: 6 fields -> dialect rejection (Quartz/Spring)', () => {
  const e = rej('0 0 12 13 * 5');
  assert.match(e.message, /different dialect|Quartz\/Spring/);
  assert.match(e.message, /five-field Unix/);
});
test('F13: 7 fields with ? and year -> dialect rejection', () => {
  const e = rej('0 0 12 ? * 6 2026');
  assert.match(e.message, /different dialect|Quartz\/Spring/);
});
test('F14: @reboot -> rejected (not a recurring schedule)', () => {
  const e = rej('@reboot');
  assert.match(e.message, /not a recurring schedule/);
});
test('F15: @daily -> expanded to 0 0 * * * and described', () => {
  const r = dec('@daily');
  assert.strictEqual(r.expanded, '0 0 * * *');
  assert.strictEqual(r.shortcut, '@daily');
  assert.match(r.description.combined, /00:00/);
});
test('all shortcuts expand per the OpenBSD table', () => {
  assert.strictEqual(dec('@yearly').expanded, '0 0 1 1 *');
  assert.strictEqual(dec('@annually').expanded, '0 0 1 1 *');
  assert.strictEqual(dec('@monthly').expanded, '0 0 1 * *');
  assert.strictEqual(dec('@weekly').expanded, '0 0 * * 0');
  assert.strictEqual(dec('@midnight').expanded, '0 0 * * *');
  assert.strictEqual(dec('@hourly').expanded, '0 * * * *');
});
test('invalid-after-valid: errors for EVERY invalid field, no partial description', () => {
  const e = rej('99 9-17 * * 1-5');
  assert.ok(e.errors.length >= 1);
  assert.match(e.errors[0].message, /minute: 99 out of range 0-59/);
});
test('multiple invalid fields are all reported', () => {
  const e = rej('99 25 * 13 *');
  const msgs = e.errors.map((x) => x.message).join(' | ');
  assert.match(msgs, /minute: 99 out of range/);
  assert.match(msgs, /hour: 25 out of range/);
  assert.match(msgs, /month: 13 out of range/);
});
test('zero step rejected', () => {
  const e = rej('*/0 * * * *');
  assert.match(e.message, /step "\/0" is invalid/);
});
test('descending range rejected', () => {
  const e = rej('0 17-9 * * *');
  assert.match(e.message, /descending range 17-9/);
});
test('range out of bounds rejected per field', () => {
  assert.match(rej('60 0 * * *').message, /minute: 60 out of range 0-59/);
  assert.match(rej('0 24 * * *').message, /hour: 24 out of range/);
  assert.match(rej('0 0 32 * *').message, /day-of-month: 32 out of range/);
  assert.match(rej('0 0 * 13 *').message, /month: 13 out of range/);
  assert.match(rej('0 0 * * 8').message, /day-of-week: 8 out of range/);
});
test('cronie random range ~ rejected as unsupported', () => {
  assert.match(rej('0 0~30 * * *').message, /cronie extension/);
});
test('? token rejected as Quartz/Spring', () => {
  assert.match(rej('0 0 ? * *').message, /Quartz\/Spring token/);
});
test('too few / too many fields rejected', () => {
  assert.match(rej('0 0 1 *').message, /Expected 5 fields .* got 4/);
  assert.match(rej('* * * * * *').message, /different dialect/);
});
test('over-100-char input rejected', () => {
  const e = rej('0 0 * * * '.repeat(12));
  assert.match(e.message, /100-character limit/);
});
test('unknown @shortcut rejected with supported list', () => {
  const e = rej('@fortnightly');
  assert.match(e.message, /Unknown shortcut "@fortnightly"/);
  assert.match(e.message, /@yearly/);
});

/* ================= PRIVACY: no third-party resources ================= */

import { resourceViolations, includesAppJs, TRACKER_RE, SITE_ORIGIN } from './lib/privacy.mjs';

const SERVED_PAGES = ['index.html', '404.html', ...TOOL_PATHS.map((t) => `${t}index.html`)];

startGroup('privacy: served pages auto-load zero non-same-origin resources');
for (const page of SERVED_PAGES) {
  const html = read(page);
  const base = `${SITE_ORIGIN}/${page}`;
  test(`no analytics/tracker references (${page})`, () => {
    assert.ok(!TRACKER_RE.test(html), 'third-party analytics reference found');
  });
  test(`every auto-loaded resource resolves to ${SITE_ORIGIN} (${page})`, () => {
    const v = resourceViolations(html, base);
    assert.deepStrictEqual(v, [], `non-same-origin auto-loaded resources:\n  ${v.join('\n  ')}`);
  });
  test(`app.js include present and same-origin (${page})`, () => {
    if (page === '404.html') return; // 404 is intentionally script-free
    assert.ok(includesAppJs(html, base), 'page must load /assets/js/app.js');
  });
}

/* ================= ARTIFACT: runtime JS must ship to production ================= */

startGroup('artifact: deploy workflow must serve tools/*/logic.js');
{
  const wf = read('.github/workflows/deploy.yml');
  test('deploy job no longer strips tools/*/logic.js from the Pages artifact', () => {
    assert.ok(!/rm -rf[^\n]*tools\/\*\/logic\.js/.test(wf),
      'artifact-exclusion must not remove tools/*/logic.js — tool pages load it at runtime');
  });
  test('every tool page references logic.js (or uses the inline tbInit pattern)', () => {
    for (const t of TOOLS) {
      const html = read(`tools/${t}/index.html`);
      const loadsLogic = /<script src="logic\.js">/.test(html);
      const inline = /window\.tbInit\s*=\s*function/.test(html);
      assert.ok(loadsLogic || inline, `${t} neither loads logic.js nor defines tbInit`);
    }
  });
}

/* ---------- summary ---------- */
line(`\n===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) { line('Failed groups:'); for (const f of failures) line(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
