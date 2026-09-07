/* ToolBots base64 — pure codec extracted verbatim from tools/base64/index.html tbInit.
   The page read the URL-safe choice from a checkbox; here it is an explicit flag.
   No DOM access, no imports. Browser + Node compatible (btoa/atob/TextEncoder are globals in both).
   Exposes globalThis.TBBase64. */
'use strict';

(function () {
  const encode = (str, urlsafe = false) => {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    let b64 = btoa(bin);
    if (urlsafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  };

  const decode = (b64, urlsafe = false) => {
    let s = b64.trim().replace(/\s+/g, '');
    if (urlsafe || /[-_]/.test(s)) s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };

  globalThis.TBBase64 = {
    encode,
    decode,
    urlSafeEncode: (str) => encode(str, true),
    urlSafeDecode: (b64) => decode(b64, true),
  };
})();
