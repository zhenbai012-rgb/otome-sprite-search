/* Text matching runs locally. No search phrase is sent to a remote service. */
(function (root) {
  'use strict';
  function normalizer(table = {}, aliases = []) {
    const clean = value => [...String(value).normalize('NFKC').toLowerCase()].map(c => table[c] || c).join('').replace(/[^\p{L}\p{N}]/gu, '');
    const replacements = new Map();
    for (const entry of aliases) {
      const canonical = clean(entry.name);
      // Consume an already canonical full name before a shorter alias inside it.
      replacements.set(canonical, canonical);
      for (const alias of entry.aliases || []) {
        const key = clean(alias);
        if ([...key].length >= 2 && key !== canonical) replacements.set(key, canonical);
      }
    }
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keys = [...replacements.keys()].sort((a, b) => b.length - a.length);
    const pattern = keys.length ? new RegExp(keys.map(escape).join('|'), 'gu') : null;
    return value => { const text = clean(value); return pattern ? text.replace(pattern, match => replacements.get(match)) : text; };
  }

  function prepare(query, normalize, mode = 'similar', breadth = 'normal') {
    query = String(query).slice(0,160);
    const text = normalize(query), characters = [...text];
    const tokens = String(query).trim().split(/\s+/u).map(normalize).filter(Boolean);
    const minimum = characters.length > 2 || breadth === 'wide' ? 1 : 0;
    const edits = mode === 'exact' ? 0 : Math.max(minimum, Math.floor(characters.length * (breadth === 'wide' ? .45 : .3)));
    return {text, characters, unique: [...new Set(characters)], tokens, mode, edits, breadth};
  }

  function score(text, query) {
    if (!query.text) return null;
    const position = text.indexOf(query.text);
    if (position >= 0) return {score: 1, kind: 'exact', distance: 0};
    if (query.mode === 'exact') return null;
    if (query.tokens.length > 1 && query.tokens.every(token => text.includes(token))) return {score: .96, kind: 'keywords', distance: 0};
    if(text.length < query.characters.length-query.edits)return null;
    // A match with <= E edits must retain at least unique(query)-E characters.
    // This filter has no top-N cut-off: every remaining line is examined.
    let shared = 0;
    for (const c of query.unique) if (text.includes(c)) shared++;
    if (shared < Math.max(1, query.unique.length - query.edits)) return null;
    const q = query.characters, size = q.length;
    let previous = new Uint16Array(size + 1), current = new Uint16Array(size + 1), best = size;
    for (let i = 0; i <= size; i++) previous[i] = i;
    // Semi-global edit distance finds a similar fragment anywhere in a long line.
    for (const character of text) {
      current[0] = 0;
      for (let i = 1; i <= size; i++) {
        current[i] = Math.min(previous[i] + 1, current[i - 1] + 1, previous[i - 1] + Number(q[i - 1] !== character));
      }
      best = Math.min(best, current[size]);
      [previous, current] = [current, previous];
    }
    return best <= query.edits ? {score: 1 - best / size, kind: 'fuzzy', distance: best} : null;
  }
  const api = {normalizer, prepare, score};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DialogueSearchCore = api;
})(typeof self === 'undefined' ? globalThis : self);
