/* ToolBots shared engine — drives homepage grid + tool workbenches. No dependencies. */
'use strict';

/* ---------- registry (single source of truth, rendered on homepage) ---------- */
const TOOLBOTS_TOOLS = [
  { path: 'tools/json/',      name: 'JSON Formatter',    cats: ['json', 'dev'],  icon: '{ }',
    desc: 'Validate, format, and minify JSON locally with instant error lines.' },
  { path: 'tools/base64/',    name: 'Base64 Encoder',    cats: ['encode', 'dev'], icon: '64',
    desc: 'Encode and decode Base64 with full Unicode support.' },
  { path: 'tools/hash/',      name: 'SHA-256 Hasher',    cats: ['crypto', 'dev'], icon: '#',
    desc: 'SHA-1/256/384/512 hashes via the Web Crypto API. Text stays on your device.' },
  { path: 'tools/text-case/', name: 'Text Case Converter', cats: ['text'],        icon: 'Aa',
    desc: 'Upper, lower, title, camel, snake, kebab case — one click each.' },
  { path: 'tools/uuid/',      name: 'UUID Generator',    cats: ['dev', 'crypto'], icon: 'ID',
    desc: 'Bulk v4 UUIDs from real browser crypto randomness. Copy the list.' },
  { path: 'tools/color/',     name: 'Color Inspector',   cats: ['design'],        icon: 'RGB',
    desc: 'Convert HEX ⇄ RGB ⇄ HSL, check contrast ratios, build a mini palette.' },
];

/* ---------- helpers shared by tools ---------- */
const TB = {
  copy(text) {
    return navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error('clipboard unavailable'));
  },
  async sha(algo, text) {
    const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  uuidv4() {
    if (!(crypto && crypto.randomUUID)) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
    return crypto.randomUUID();
  },
  el(id) { return document.getElementById(id); },
};

/* ---------- homepage ---------- */
function initHome() {
  const grid = TB.el('tool-grid');
  if (!grid) return;
  grid.innerHTML = TOOLBOTS_TOOLS.map(t => `
    <a class="tool-card" href="${t.path}">
      <h3><span class="badge" aria-hidden="true">${t.icon}</span>${t.name}</h3>
      <p>${t.desc}</p>
      <span class="cats">${t.cats.map(c => `<span class="cat">${c}</span>`).join('')}</span>
    </a>`).join('');

  const filter = TB.el('tool-filter');
  const none = TB.el('no-results');
  if (filter) {
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      let visible = 0;
      grid.querySelectorAll('.tool-card').forEach((card, i) => {
        const t = TOOLBOTS_TOOLS[i];
        const hay = (t.name + ' ' + t.desc + ' ' + t.cats.join(' ')).toLowerCase();
        const show = !q || hay.includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      none.hidden = visible > 0;
    });
  }
}

/* ---------- keyboard shortcuts (homepage + tools) ---------- */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape' && TB.el('clear-btn')) { TB.el('clear-btn').click(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      const f = TB.el('tool-filter') || TB.el('input-text');
      if (f) { e.preventDefault(); f.focus(); }
    }
  });
}

/* ---------- tool page bootstrapping ---------- */
function initToolPage() {
  const json = document.querySelector('script[type="application/ld+json"].tb-tool');
  if (!json) return;
  let meta;
  try { meta = JSON.parse(json.textContent); } catch { return; }
  document.title = meta.name + ' — ToolBots';
  const el = (id) => { const n = document.querySelector(`[data-tb="${id}"]`); if (!n) throw new Error('missing [data-tb=' + id + ']'); return n; };

  el('crumb-name').textContent = meta.name;
  el('page-title').textContent = meta.name;
  el('lede').textContent = meta.description;
  document.querySelector('meta[name="description"]').setAttribute('content', meta.description);
  meta.faq.forEach(([q, a]) => {
    const d = document.createElement('details'); d.className = 'faq';
    const s = document.createElement('summary'); s.textContent = q;
    const p = document.createElement('p'); p.textContent = a;
    d.append(s, p); el('faq').appendChild(d);
  });

  const copyBtn = el('copy-btn');
  copyBtn.addEventListener('click', async () => {
    const target = TB.el(meta.outputElement);
    const text = target ? target.value || target.textContent : '';
    if (!text) return;
    try { await TB.copy(text); copyBtn.textContent = '✓ Copied'; }
    catch { copyBtn.textContent = 'Copy failed'; }
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });

  const clearBtn = el('clear-btn');
  clearBtn.addEventListener('click', () => {
    const i = TB.el(meta.inputElement);
    if (i) { i.value = ''; i.focus(); }
    const o = TB.el(meta.outputElement);
    if (o) { if ('value' in o) o.value = ''; else o.textContent = ''; }
    const st = TB.el('tool-status'); if (st) { st.textContent = ''; st.className = 'status'; }
    if (typeof window.tbClear === 'function') window.tbClear();
  });

  if (typeof window.tbInit === 'function') window.tbInit(el);
}

document.addEventListener('DOMContentLoaded', () => {
  initHome();
  initToolPage();
  initShortcuts();
});
