/* ToolBots text-case — pure logic extracted verbatim from tools/text-case/index.html tbInit.
   No DOM access, no imports. Browser + Node compatible. Exposes globalThis.TBTextCase. */
'use strict';

(function () {
  const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via']);

  const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                       .split(/[\s_\-]+/).map(w => w.trim()).filter(Boolean);

  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

  const upper = (s) => s.toUpperCase();
  const lower = (s) => s.toLowerCase();
  const title = (s) => s.toLowerCase().split(/(\s+)/).map((word, i) => {
    if (!word || /\s/.test(word)) return word;
    if (i !== 0 && MINOR.has(word)) return word;
    return cap(word);
  }).join('');
  const sentence = (s) => s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
  const camel = (s) => words(s).map((w, i) => i === 0 ? w.toLowerCase() : cap(w)).join('');
  const pascal = (s) => words(s).map(cap).join('');
  const snake = (s) => words(s).map(w => w.toLowerCase()).join('_');
  const kebab = (s) => words(s).map(w => w.toLowerCase()).join('-');
  const constant = (s) => words(s).map(w => w.toUpperCase()).join('_');

  globalThis.TBTextCase = { upper, lower, title, sentence, camel, pascal, snake, kebab, constant, words };
})();
