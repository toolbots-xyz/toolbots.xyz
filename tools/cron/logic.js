/* ToolBots Cron — pure five-field Unix cron explainer logic (numeric-only v1).
   Extracted for testability, same pattern as the other tools' logic.js files.
   No DOM access, no imports, no network. Exposes globalThis.TBCron.

   Semantics per research contract (t_e2690da2, primary sources: OpenBSD/Debian
   crontab(5) + cronie src/entry.c, src/cron.c):

   DOM/DOW rule (cron.c L565-585, verbatim behavior):
     - if EITHER day field "counts as starred" -> AND the two day fields;
     - if BOTH are restricted  -> OR them ("yes, it's bizarre... it's the standard").
   A field "counts as starred" iff the field TEXT starts with '*' (entry.c sets
   DOM_STAR/DOW_STAR on the '*' character BEFORE parsing) — so a step like
   star-slash-2 is still "starred", while an explicit range like `1-15` is
   restricted.

   Steps anchor at the field minimum and never span fields or carry: a minute
   field of star-slash-45 yields {0, 45}. Ranges are INCLUSIVE. DOW: 0 and 7
   are both Sunday. Shortcuts expand per the OpenBSD table. `@reboot` is
   rejected (not recurring). Names (JAN/MON), 6/7-field Quartz/Spring shapes
   and `~` are unsupported in v1.
*/
'use strict';

(function () {
  const RANGES = {
    minute: { min: 0, max: 59 },
    hour:   { min: 0, max: 23 },
    dom:    { min: 1, max: 31 },
    month:  { min: 1, max: 12 },
    dow:    { min: 0, max: 7 },
  };
  const FIELD_ORDER = ['minute', 'hour', 'dom', 'month', 'dow'];
  const FIELD_LABELS = {
    minute: 'minute', hour: 'hour', dom: 'day-of-month',
    month: 'month', dow: 'day-of-week',
  };
  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const SHORTCUTS = {
    '@yearly':   '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly':  '0 0 1 * *',
    '@weekly':   '0 0 * * 0',
    '@daily':    '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly':   '0 * * * *',
  };

  const isDigits = (s) => /^[0-9]+$/.test(s);

  /* Parse ONE field into { values:Set<number>, starred:boolean } or throw {field,msg}. */
  function parseField(name, text) {
    const range = RANGES[name];
    const fail = (msg) => { const e = new Error(msg); e.field = name; throw e; };

    if (text.includes('~')) {
      fail(`random ranges (~) are a cronie extension and are unsupported in v1`);
    }
    if (text.includes('?')) {
      fail(`"?" is a Quartz/Spring token and is unsupported in v1 (use "*" in five-field Unix cron)`);
    }
    if (!/^[0-9*,\-/]+$/.test(text)) {
      // names and anything else land here; word it by what we saw
      if (/[a-uw-zA-UW-Z]/.test(text)) {
        fail(`field names (${text.replace(/[^A-Za-z]+/g, ' ').trim()}) are valid in Vixie-derived cron but unsupported in v1 — use numbers (${range.min}-${range.max})`);
      }
      fail(`unexpected characters in ${FIELD_LABELS[name]} field ("${text}")`);
    }

    const starred = text.startsWith('*');
    const values = new Set();

    const parseAtom = (atom) => {
      // atom: number | a-b   (steps are handled by parsePart)
      if (atom === '*') {
        for (let i = range.min; i <= range.max; i++) values.add(i);
        return;
      }
      if (isDigits(atom)) {
        const n = parseInt(atom, 10);
        if (n < range.min || n > range.max) {
          fail(`${n} out of range ${range.min}-${range.max}`);
        }
        // DOW 7 == Sunday == 0 (crontab(5): "0 and 7 are both Sunday")
        values.add(name === 'dow' && n === 7 ? 0 : n);
        return;
      }
      const m = atom.match(/^(\d+)-(\d+)$/);
      if (!m) fail(`"${atom}" is not a number or an inclusive range (a-b)`);
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a < range.min || a > range.max || b < range.min || b > range.max) {
        fail(`range ${a}-${b} out of range ${range.min}-${range.max}`);
      }
      if (a > b) fail(`descending range ${a}-${b} is not supported in v1 (ranges must be ascending)`);
      for (let i = a; i <= b; i++) values.add(name === 'dow' && i === 7 ? 0 : i);
    };

    for (const part of text.split(',')) {
      const stepM = part.match(/^([^/]+)\/(\d+)$/);
      if (stepM) {
        const base = stepM[1], step = parseInt(stepM[2], 10);
        if (step === 0) fail(`step "/0" is invalid (step must be a positive integer)`);
        if (base === '*') {
          for (let i = range.min; i <= range.max; i += step) values.add(i);
        } else if (/^\d+-\d+$/.test(base)) {
          const [aS, bS] = base.split('-').map((x) => parseInt(x, 10));
          if (aS < range.min || aS > range.max || bS < range.min || bS > range.max) {
            fail(`range ${aS}-${bS} out of range ${range.min}-${range.max}`);
          }
          if (aS > bS) fail(`descending range ${aS}-${bS} is not supported in v1`);
          for (let i = aS; i <= bS; i += step) values.add(name === 'dow' && i === 7 ? 0 : i);
        } else {
          fail(`step "/${step}" must attach to "*" or a range (a-b), not "${base}"`);
        }
      } else {
        parseAtom(part);
      }
    }

    if (values.size === 0) fail(`${FIELD_LABELS[name]} field matched nothing`);
    /* DOW normalization: 7 means Sunday (same as 0) — collapse everywhere,
       however the value arrived (explicit 7, range 5-7, or a full-star field). */
    if (name === 'dow' && values.has(7)) { values.delete(7); values.add(0); }
    return { values, starred };
  }

  const sortVals = (s) => [...s].sort((a, b) => a - b);

  function describeField(name, vals) {
    const list = sortVals(vals);
    if (name === 'minute') {
      if (list.length === 60 && list[0] === 0) return 'every minute';
      return `at minute${list.length > 1 ? 's' : ''} ${list.join(', ')}`;
    }
    if (name === 'hour') {
      if (list.length === 24) return 'every hour';
      return `past hour${list.length > 1 ? 's' : ''} ${list.map((h) => String(h).padStart(2, '0')).join(', ')}`;
    }
    if (name === 'dom') {
      if (list.length === 31) return 'every day-of-month';
      return `on day${list.length > 1 ? 's' : ''} ${list.join(', ')} of the month`;
    }
    if (name === 'month') {
      if (list.length === 12) return 'every month';
      return `in ${list.map((m) => MONTH_NAMES[m]).join(', ')}`;
    }
    if (name === 'dow') {
      if (list.length === 7) return 'every day-of-week';
      const names = list.map((d) => DOW_NAMES[d]);
      const uniq = [...new Set(names)];
      return `on ${uniq.join(', ')}`;
    }
    return '';
  }

  /* joinValueList: render a compact human list like "1, 3, 5" */
  function joinVals(vals) { return sortVals(vals).join(', '); }

  function dayClause(domInfo, dowInfo, starFlags) {
    /* cronie entry.c: DOM_STAR/DOW_STAR are set when the RAW field text starts
       with '*' — BEFORE parsing. A field that covers the full range via an
       explicit range/list (e.g. 1-31) does NOT get the flag, so it stays
       RESTRICTED and keeps the OR branch alive. That is why starFlags come
       from the raw tokens rather than from "covers everything" detection. */
    const domStar = starFlags ? starFlags.dom : false;
    const dowStar = starFlags ? starFlags.dow : false;
    const domAll = domInfo.values.size === 31;
    const dowAll = dowInfo.values.size === 7; // after 7->0 normalization 0..6 all present
    /* cronie cron.c L582-584: the AND branch applies when either day field is
       starred (DOM_STAR|DOW_STAR set); OR only when BOTH are restricted. */
    const andBranch = domStar || dowStar;

    let text;
    if (domStar && domAll && dowAll) {
      text = 'every day';
    } else if (andBranch) {
      // AND: day must satisfy both restricted fields (a starred field is a no-op filter
      // only when it covers the whole range; a star-STEP like */2 still filters!)
      const parts = [];
      if (!(domStar && domAll)) parts.push(`day-of-month is ${joinVals(domInfo.values)}`);
      if (!(dowStar && dowAll)) parts.push(`day-of-week is ${[...dowInfo.values].map((d) => DOW_NAMES[d]).join(', ')}`);
      text = 'only when ' + (parts.length ? parts.join(' AND ') : 'every day');
    } else {
      // OR: both restricted, neither starred — the union is the schedule
      const domText = domAll
        ? 'every calendar day (all of 1-31)'
        : `day-of-month ${joinVals(domInfo.values)}`;
      text = `on ${domText} OR day-of-week ${[...dowInfo.values].map((d) => DOW_NAMES[d]).join(', ')}`;
    }
    return { text, andBranch, domStar, dowStar, domAll, dowAll };
  }

  function explain(expanded, starFlags, rawTokens) {
    const tokens = expanded.trim().split(/\s+/);
    const fields = {};
    FIELD_ORDER.forEach((f, i) => { fields[f] = parseField(f, tokens[i]); });

    const m = fields.minute, h = fields.hour, mo = fields.month, dom = fields.dom, dow = fields.dow;

    // time part
    let time;
    const minutes = sortVals(m.values), hours = sortVals(h.values);
    const pad = (x) => String(x).padStart(2, '0');
    const contiguous = (arr) => arr.length > 1 && arr[arr.length - 1] - arr[0] === arr.length - 1;
    if (m.values.size === 60 && h.values.size === 24) time = 'Every minute';
    else if (h.values.size === 24) time = `At minute${minutes.length > 1 ? 's' : ''} ${minutes.join(', ')} of every hour`;
    else if (m.values.size === 60) time = `Every minute during the ${hours.map(pad).join(', ')} o'clock hours`;
    else if (minutes.length === 1 && hours.length === 1) {
      time = `At ${pad(hours[0])}:${pad(minutes[0])}`;
    } else if (minutes.length === 1) {
      time = contiguous(hours)
        ? `At minute ${pad(minutes[0])} past every hour from ${pad(hours[0])} through ${pad(hours[hours.length - 1])}`
        : `At minute ${pad(minutes[0])} past the ${hours.map(pad).join(', ')} hours`;
    } else {
      time = `At minutes ${minutes.join(', ')} past the ${hours.map(pad).join(', ')} hours`;
    }

    const day = dayClause(dom, dow, starFlags);
    const monthText = mo.values.size === 12 ? '' : ` in ${sortVals(mo.values).map((x) => MONTH_NAMES[x]).join(', ')}`;

    const combined = `${time}${monthText ? monthText.replace(/^ in /, ', in ') : ''}, ${day.text}`;
    const perField = [
      { field: 'minute', raw: expanded.trim().split(/\s+/)[0], text: describeField('minute', m.values) },
      { field: 'hour', raw: expanded.trim().split(/\s+/)[1], text: describeField('hour', h.values) },
      { field: 'day-of-month', raw: expanded.trim().split(/\s+/)[2], text: describeField('dom', dom.values) },
      { field: 'month', raw: expanded.trim().split(/\s+/)[3], text: describeField('month', mo.values) },
      { field: 'day-of-week', raw: expanded.trim().split(/\s+/)[4], text: describeField('dow', dow.values) },
    ];

    const notes = [];
    /* day-clause notes (driven by dayClause, which used the raw-token star flags) */
    const domAll = day.domAll, dowAll = day.dowAll;
    if (!domAll && !dowAll && !day.andBranch) {
      notes.push('OR caution: both day fields are restricted (neither starts with *), so this runs on the UNION — cronie cron.c: "* * 1,15 * Sun" runs on the 1st and 15th AND every Sunday. Yes, it\'s bizarre. It\'s the standard.');
    }
    if (day.andBranch && !day.domAll && !day.dowAll) {
      notes.push('AND semantics: one day field starts with * (so it "counts as starred" even with a step like star-slash-2), so BOTH day conditions must hold.');
    }
    /* step-anchoring cautions (driven by the RAW tokens — the canonical form
       has already replaced star-steps with explicit lists) */
    if (rawTokens && rawTokens[2] && /^\*\//.test(rawTokens[2])) {
      notes.push('A step on "*" in day-of-month still counts as a starred field and anchors at the field minimum (1, 3, 5, ...); it is not "every nth day from today".');
    }
    if (rawTokens && rawTokens[0] && /^\*\//.test(rawTokens[0])) {
      const step = parseInt(rawTokens[0].slice(2), 10);
      if (Number.isFinite(step) && step > 30) {
        notes.push(`A minute step of ${step} anchors at 0 and resets every hour: it fires at :00 and :${step} within each hour — NOT once every ${step} minutes.`);
      }
    }

    return { combined, perField, notes, fields: { minute: m, hour: h, dom, month: mo, dow } };
  }

  /* decode(input) -> { ok:true, expanded, shortcut, description:{combined, perField, notes} }
                      | { ok:false, errors:[{field, message}], dialect?:bool } */
  function decode(input) {
    if (typeof input !== 'string') throw new Error('Input must be a string.');
    const raw = input.trim();

    if (!raw) { const e = new Error('empty'); e.empty = true; throw e; }
    if (raw.length > 100) {
      const e = new Error('Over this tool\'s 100-character input limit (an implementation bound of this page, not a cron rule) — check you pasted a single crontab line.');
      e.field = null; throw e;
    }
    if (/^@\S+$/i.test(raw)) {
      const key = raw.toLowerCase();
      if (key === '@reboot') {
        const e = new Error('@reboot runs once, when the daemon starts (crontab(5)) — it is not a recurring schedule and is unsupported in v1.');
        e.field = null; throw e;
      }
      if (SHORTCUTS[key]) {
        const expanded = SHORTCUTS[key];
        const d = explain(expanded, null, null);
        return { ok: true, expanded, shortcut: raw.toLowerCase(), description: d };
      }
      const e = new Error(`Unknown shortcut "${raw}". Supported: ${Object.keys(SHORTCUTS).join(', ')}. @reboot is unsupported in v1.`);
      e.field = null; throw e;
    }

    const tokens = raw.split(/\s+/);
    if (tokens.length > 5) {
      const e = new Error(`${tokens.length} fields look like a different dialect (Quartz/Spring add seconds and/or a year, and use "?"). Unix cron uses exactly five fields: minute hour day-of-month month day-of-week. This tool supports five-field Unix cron only.`);
      e.field = null; e.dialect = true; throw e;
    }
    if (tokens.length < 5) {
      const e = new Error(`Expected 5 fields (minute hour day-of-month month day-of-week) but got ${tokens.length}.`);
      e.field = null; throw e;
    }

    const errors = [];
    const parsed = {};
    for (let i = 0; i < 5; i++) {
      const name = FIELD_ORDER[i];
      try { parsed[name] = parseField(name, tokens[i]); }
      catch (err) { errors.push({ field: name, message: `${FIELD_LABELS[name]}: ${err.message}` }); }
    }
    if (errors.length) {
      const e = new Error(errors.map((x) => x.message).join('; '));
      e.errors = errors; throw e;
    }

    /* Star flags MUST come from the raw tokens: cronie's DOM_STAR/DOW_STAR are
       set when the field text starts with '*', and the canonical rebuild loses
       that (a star-step canonicalizes to a plain list). */
    const starFlags = { dom: tokens[2].startsWith('*'), dow: tokens[4].startsWith('*') };

    /* SEMANTICS-PRESERVING expansion: DOM and DOW keep their RAW text because
       their spelling (star vs explicit range) determines the AND/OR day rule —
       re-encoding a star-step as a list, or a full-range as a star, changes
       semantics. The three time/month fields carry no such cross-field rule,
       so they canonicalize freely (star for full range, else the value list). */
    const canonTime = FIELD_ORDER.slice(0, 2).map((f) => {
      const vals = sortVals(parsed[f].values);
      const range = RANGES[f];
      return vals.length === (range.max - range.min + 1) ? '*' : vals.join(',');
    });
    const monthVals = sortVals(parsed.month.values);
    const canonMonth = monthVals.length === 12 ? '*' : monthVals.join(',');
    // order: minute (canonical), hour (canonical), DOM (RAW), month (canonical), DOW (RAW)
    const canon = [canonTime[0], canonTime[1], tokens[2], canonMonth, tokens[4]].join(' ');

    const d = explain(canon, starFlags, tokens);
    // keep raw field text for display
    FIELD_ORDER.forEach((f, i) => { d.perField[i].raw = tokens[i]; });
    if (tokens[4].includes('7')) {
      d.notes.push('7 in day-of-week means Sunday, the same as 0 (crontab(5)) — normalized in this description.');
    }
    return { ok: true, expanded: canon, shortcut: null, description: d };
  }

  globalThis.TBCron = { decode, RANGES, FIELD_ORDER, SHORTCUTS };
})();
