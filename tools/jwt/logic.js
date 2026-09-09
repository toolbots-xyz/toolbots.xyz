/* ToolBots JWT — pure decoder extracted for testability (same pattern as tools/base64/logic.js).
   Decodes JWS tokens (header.payload.signature). NO signature verification, no crypto,
   no DOM access, no imports. Browser + Node compatible (atob/TextDecoder are globals in both).
   Exposes globalThis.TBJWT. */
'use strict';

(function () {
  /* Base64URL -> raw bytes. Accepts unpadded or padded input; throws on bad alphabet. */
  const fromB64UrlBytes = (s) => {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('invalid base64url');
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  /* bytes -> UTF-8 string. FATAL: invalid sequences throw instead of silently
     replacing with U+FFFD. */
  const decodeText = (bytes) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('invalid UTF-8'); }
  };

  const SEGMENT_NAMES = ['header', 'payload', 'signature'];
  /* Signature checks are SYNTAX-ONLY: strict base64url alphabet (enforced by
     fromB64UrlBytes). No guessed plausibility bounds — signatures of any valid
     base64url length are decoded; the overall token size cap still applies. */

  /* decode('eyJhbGciOi...') -> { header, payload, signatureB64, headerB64, payloadB64 }
     Throws Error with a human-readable message on any malformed input. */
  const decode = (token) => {
    if (typeof token !== 'string') throw new Error('Input must be a string.');
    let raw = token.trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
    if (!raw) throw new Error('Nothing to decode — paste a JWT first.');
    if (raw.length > 1000000) {
      throw new Error('Token too large — over 1,000,000 characters; refusing to decode.');
    }

    const parts = raw.split('.');
    if (parts.length !== 3) {
      throw new Error('Not a JWT — expected header.payload.signature (3 dot-separated segments) but got ' +
        parts.length + '. Encrypted (JWE) tokens have 5 segments and cannot be decoded here.');
    }

    const headerText = (() => {
      if (!parts[0]) throw new Error('Segment 1 (header) is empty.');
      try { return decodeText(fromB64UrlBytes(parts[0])); }
      catch (e) {
        if (e.message === 'invalid UTF-8') throw new Error('Segment 1 (header) is not valid UTF-8.');
        throw new Error('Segment 1 (header) is not valid Base64URL.');
      }
    })();
    const payloadText = (() => {
      if (!parts[1]) throw new Error('Segment 2 (payload) is empty.');
      try { return decodeText(fromB64UrlBytes(parts[1])); }
      catch (e) {
        if (e.message === 'invalid UTF-8') throw new Error('Segment 2 (payload) is not valid UTF-8.');
        throw new Error('Segment 2 (payload) is not valid Base64URL.');
      }
    })();

    /* Signature: validate SYNTAX ONLY (strict base64url). This says nothing
       about authenticity — a syntactically valid signature is still unverified.
       Empty-signature policy: permitted ONLY with header alg "none" (the JWS
       unsecured case) and flagged unsecured so the UI can warn loudly.
       Contradiction guard: alg "none" WITH a nonempty signature is malformed —
       alg "none" forbids signatures by definition. */
    const sigRaw = parts[2];
    let unsecured = false;
    const headerAlg = (() => { try { return JSON.parse(headerText).alg; } catch { return undefined; } })();
    if (sigRaw === '') {
      if (headerAlg === 'none') {
        unsecured = true; // alg:none — structurally complete, cryptographically unsecured
      } else {
        throw new Error('Segment 3 (signature) is empty. An empty signature is only valid for unsecured tokens with alg "none" — this token does not declare that.');
      }
    } else if (headerAlg === 'none') {
      throw new Error('Malformed token: header declares alg "none" (no signature allowed) but the token carries a signature. Either the alg or the signature is wrong.');
    } else {
      try { fromB64UrlBytes(sigRaw); }
      catch {
        throw new Error('Segment 3 (signature) is not valid Base64URL. (Syntax is checked here — authenticity is never verified by this tool.)');
      }
    }

    const parseJson = (text, n) => {
      let value;
      try { value = JSON.parse(text); }
      catch (e) { throw new Error(SEGMENT_NAMES[n - 1][0].toUpperCase() + SEGMENT_NAMES[n - 1].slice(1) +
        ' is not valid JSON (' + e.message + ').'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(SEGMENT_NAMES[n - 1][0].toUpperCase() + SEGMENT_NAMES[n - 1].slice(1) + ' must be a JSON object.');
      }
      return value;
    };

    const header = parseJson(headerText, 1);
    const payload = parseJson(payloadText, 2);

    return {
      header,
      payload,
      headerB64: parts[0],
      payloadB64: parts[1],
      signatureB64: sigRaw,
      unsecured, // true only for alg:"none" empty-signature tokens
    };
  };

  /* NumericDate seconds -> "2 hours" / "3 days" style span (direction-agnostic). */
  const humanSpan = (ms) => {
    const s = Math.abs(ms) / 1000;
    if (s < 90) return Math.max(1, Math.round(s)) + ' sec';
    const m = s / 60;
    if (m < 90) return Math.round(m) + ' min';
    const h = m / 60;
    if (h < 36) return Math.round(h) + ' hours';
    const d = h / 24;
    if (d < 545) return Math.round(d) + ' days';
    return (Math.round((d / 365) * 10) / 10) + ' years';
  };

  /* Timestamp claims (iat / nbf / exp) -> human-readable rows.
     Returns [{ key, label, value, detail }] in that order; skips absent claims. */
  const CLAIM_LABELS = { iat: 'Issued at', nbf: 'Not before', exp: 'Expires' };
  const claimsInfo = (payload) => {
    const rows = [];
    if (!payload || typeof payload !== 'object') return rows;
    const now = Date.now();
    for (const key of ['iat', 'nbf', 'exp']) {
      const v = payload[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        rows.push({ key, label: CLAIM_LABELS[key], value: String(v), detail: 'not a NumericDate (seconds)' });
        continue;
      }
      const ms = v * 1000;
      const d = new Date(ms);
      let detail;
      if (isNaN(d.getTime()) || Math.abs(ms) > 8.64e15) {
        detail = 'timestamp out of range';
      } else {
        const utc = d.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
        const span = humanSpan(ms - now);
        detail = utc + ' (' + (ms >= now ? 'in ' + span : span + ' ago') + ')';
      }
      rows.push({ key, label: CLAIM_LABELS[key], value: String(v), detail });
    }
    return rows;
  };

  globalThis.TBJWT = { decode, claimsInfo, humanSpan };
})();
