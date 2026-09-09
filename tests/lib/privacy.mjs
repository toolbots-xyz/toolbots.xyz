/* Shared privacy scan logic — used by tests/verify.mjs and tests/privacy-negative.mjs.
   Rule: served pages may AUTO-LOAD resources (script/img/iframe/source/track/embed/
   object/link) only from the site's own origin. Anchor navigation (<a href>) and
   metadata rels (canonical/alternate/search) are exempt — they are not resource loads. */

export const SITE_ORIGIN = 'https://toolbots.xyz';

/* known analytics/tracking hosts — regression gate for the 2026-09 beacon incident */
export const TRACKER_RE =
  /cloudflareinsights|data-cf-beacon|googletagmanager|google-analytics|googlesyndication|doubleclick\.net|plausible\.io|usefathom|posthog\.com|matomo\.(js|php)/i;

/* link rels that are page metadata, not resource loads */
const LINK_METADATA_RELS = new Set(['canonical', 'alternate', 'search']);

/* read an attribute value from a tag string; handles "..." '...' and bare values */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/* Return a list of violation descriptions for every auto-loaded resource in html
   that does not resolve to SITE_ORIGIN (base = absolute URL of the page).
   Catches http(s)://, protocol-relative //host/path, single/double quotes, and
   any letter case — URLs are parsed, not pattern-matched. */
export function resourceViolations(html, base) {
  const out = [];
  const check = (tagText, label, url) => {
    if (url == null || url === '') { out.push(`${label} has empty/missing URL: ${tagText.slice(0, 80)}`); return; }
    let resolved;
    try { resolved = new URL(url, base); } catch { out.push(`${label} has unparseable URL: ${url}`); return; }
    if (resolved.origin !== SITE_ORIGIN) {
      out.push(`${label} loads from non-same-origin host (${resolved.origin}): ${url}`);
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (src !== null) check(m[0], '<script src>', src); // inline scripts have no src — fine
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) check(m[0], '<img src>', attr(m[0], 'src'));
  for (const m of html.matchAll(/<iframe\b[^>]*>/gi)) check(m[0], '<iframe src>', attr(m[0], 'src'));
  for (const m of html.matchAll(/<(source|track|embed)\b[^>]*>/gi)) check(m[0], `<${m[1].toLowerCase()} src>`, attr(m[0], 'src'));
  for (const m of html.matchAll(/<object\b[^>]*>/gi)) check(m[0], '<object data>', attr(m[0], 'data'));
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') || '').toLowerCase();
    if (LINK_METADATA_RELS.has(rel)) continue; // metadata, not a load
    if (attr(m[0], 'href') !== null) check(m[0], `<link rel="${rel || 'none'}" href>`, attr(m[0], 'href'));
  }
  return out;
}

/* true if the page loads /assets/js/app.js resolved against its own origin */
export function includesAppJs(html, base) {
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (src == null) continue;
    try { if (new URL(src, base).pathname === '/assets/js/app.js') return true; } catch { /* unparseable = not app.js */ }
  }
  return false;
}
