/* Staged-artifact regression check: proves required page runtime scripts actually
   ship in the Pages artifact. The staging simulates the deploy job faithfully by
   PARSING the "rm -rf" exclusion line from .github/workflows/deploy.yml and
   applying it — so this test fails if the workflow strips anything pages load,
   and stays correct if the exclusion list changes.
   Run: node tests/artifact-check.mjs  (exit 0 = artifact complete) */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --- parse the exclusion line from the workflow (single source of truth) --- */
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const rmLine = wf.match(/run:\s*rm -rf (.+)/);
assert.ok(rmLine, 'deploy.yml artifact-exclusion rm -rf line not found');
/* shell-ish tokenizer honoring quotes; globs kept as-is for matching */
const patterns = rmLine[1].match(/"[^"]*"|'[^']*'|\S+/g).map((s) => s.replace(/^["']|["']$/g, ''));

/* glob match: '*' matches within one path segment, '**' across segments */
function globMatch(pattern, rel) {
  const re = new RegExp('^' + pattern.split('/')
    .map((seg) => seg === '**' ? '.*' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('/') + '$');
  return re.test(rel);
}

/* --- stage the artifact exactly as the deploy job would --- */
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbots-artifact-'));
let removed = [];
try {
  fs.cpSync(ROOT, stage, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      if (!rel) return true;
      if (rel === '.git') return false; // VCS dir never ships
      for (const p of patterns) {
        if (globMatch(p, rel) || globMatch(p, path.basename(rel))) {
          if (globMatch(p, rel) || !p.includes('/')) { removed.push(rel); return false; }
        }
      }
      return true;
    },
  });

  const read = (p) => fs.readFileSync(path.join(stage, p), 'utf8');
  let passed = 0, failed = 0;
  const failures = [];
  const test = (name, fn) => {
    try { fn(); passed++; console.log(`  PASS  ${name}`); }
    catch (e) { failed++; failures.push(name); console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
  };

  console.log(`== staged artifact: runtime scripts must ship (exclusions parsed from deploy.yml: ${patterns.join(' ')}) ==`);

  const PAGES = ['index.html', '404.html', 'tools/base64/index.html', 'tools/color/index.html',
    'tools/hash/index.html', 'tools/json/index.html', 'tools/text-case/index.html',
    'tools/uuid/index.html', 'tools/jwt/index.html'];

  test('tool runtime modules exist in staged artifact (base64/color/text-case)', () => {
    for (const t of ['base64', 'color', 'text-case']) {
      assert.ok(fs.existsSync(path.join(stage, `tools/${t}/logic.js`)),
        `tools/${t}/logic.js missing from staged artifact — page loads it at runtime, tool is broken on Pages`);
    }
  });

  test('every <script src> on every served page resolves to a staged file', () => {
    for (const page of PAGES) {
      if (!fs.existsSync(path.join(stage, page))) continue;
      const html = read(page);
      const dir = path.posix.dirname(page);
      for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/g)) {
        const ref = m[1];
        const resolved = ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(path.posix.join(dir, ref));
        assert.ok(fs.existsSync(path.join(stage, resolved)),
          `${page} references <script src="${ref}"> but ${resolved} is not in the staged artifact`);
      }
    }
  });

  test('registry pages themselves are staged (spot check)', () => {
    for (const p of ['index.html', 'assets/js/app.js', 'assets/css/style.css']) {
      assert.ok(fs.existsSync(path.join(stage, p)), `${p} missing from staged artifact`);
    }
  });

  test('exclusions still applied (tests/docs/markdown not staged)', () => {
    assert.ok(!fs.existsSync(path.join(stage, 'tests')), 'tests/ staged but must be excluded');
    assert.ok(!fs.existsSync(path.join(stage, 'docs')), 'docs/ staged but must be excluded');
    assert.ok(removed.length > 0, 'no exclusions applied — staging does not match deploy.yml');
  });

  console.log(`\n===== artifact-check: ${passed} passed, ${failed} failed =====`);
  if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exitCode = 1; }
  if (process.env.ARTIFACT_KEEP === '1') console.log(`STAGED_AT=${stage}`);
} finally {
  if (process.env.ARTIFACT_KEEP !== '1') fs.rmSync(stage, { recursive: true, force: true });
}
