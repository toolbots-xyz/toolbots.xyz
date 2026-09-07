/* ToolBots color — pure color math extracted verbatim from tools/color/index.html tbInit.
   No DOM access, no imports. Browser + Node compatible. Exposes globalThis.TBColor. */
'use strict';

(function () {
  const hex2rgb = (h) => {
    let s = h.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  };

  const rgb2hsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
    }
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const lum = ({ r, g, b }) => {
    const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };

  const ratio = (l1, l2) => (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);

  const mix = (c, target, pct) => ({
    r: Math.round(c.r + (target.r - c.r) * pct),
    g: Math.round(c.g + (target.g - c.g) * pct),
    b: Math.round(c.b + (target.b - c.b) * pct),
  });

  const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

  globalThis.TBColor = {
    hex2rgb,
    rgb2hsl,
    luminance: lum,
    contrastRatio: ratio,
    mix,
    toHex,
  };
})();
