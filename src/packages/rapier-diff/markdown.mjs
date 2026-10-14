// SPDX-License-Identifier: MIT

export function markdown(md, {code} = {}) {
  return text => {
    const parser = typeof md === 'function' ? md() : md;
    const originalLines = [0], lines = [0];
    let removed = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\r') { if (text[i + 1] === '\n') { i++; removed++; } }
      else if (text[i] !== '\n') continue;
      originalLines.push(i + 1); lines.push(i + 1 - removed);
    }
    const source = text.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
    const original = at => {
      let lo = 0, hi = lines.length;
      while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lines[mid] <= at) lo = mid; else hi = mid; }
      return originalLines[lo] + at - lines[lo];
    };
    const line = n => lines[n] ?? source.length;
    const trimEnd = at => { while (at && /[\r\n]/.test(text[at - 1])) at--; return at; };
    const range = map => [original(line(map[0])), trimEnd(original(line(map[1])))];
    const normalize = label => parser.utils.normalizeReference(label);
    const seen = new WeakMap(), definitions = [], env = {};
    const view = Object.create(parser);
    for (const kind of ['block', 'inline']) {
      view[kind] = Object.create(parser[kind]);
      view[kind].ruler = Object.create(parser[kind].ruler);
      const cache = new Map();
      view[kind].ruler.getRules = chain => {
        if (!cache.has(chain)) cache.set(chain, parser[kind].ruler.getRules(chain).map(rule => {
          const ruleName = parser[kind].ruler.__rules__.find(r => r.fn === rule)?.name;
          return (...args) => {
            const state = args[0], first = state.tokens.length, start = kind === 'inline' ? state.pos : args[1];
            const matched = rule(...args);
            if (!matched || args[kind === 'inline' ? 1 : 3]) return matched;
            if (kind === 'inline') {
              for (let i = first; i < state.tokens.length; i++) {
                const token = state.tokens[i];
                if (/^(link_open|image|footnote_ref|code_inline|html_inline)$/.test(token.type) && !seen.has(token))
                  seen.set(token, {start, end: state.pos, source: state.src});
              }
            } else if (ruleName === 'reference' || ruleName === 'footnote_def') {
              const raw = source.slice(line(start), line(state.line));
              const match = /\[((?:\\.|[^\]\\])+)\]:/.exec(raw);
              const footnote = ruleName === 'footnote_def';
              if (match) definitions.push({start: line(start) + match.index, end: line(state.line),
                label: footnote ? match[1].slice(1) : match[1], footnote,
                nameStart: line(start) + match.index + (footnote ? 2 : 1),
                nameEnd: line(start) + match.index + match[0].length - 2});
            }
            return matched;
          };
        }));
        return cache.get(chain);
      };
    }
    const tokens = view.parse(source, env), parts = [], links = [], pending = [], targets = new Map();
    const counters = new WeakMap(), usedSlugs = new Map(), usedNames = new Map();
    const root = {start: 0, end: text.length, children: parts, key: 'm'};
    const frames = [{part: root, heads: [], close: ''}], footnotes = new Map();
    const current = () => frames.at(-1);
    const owner = () => current().heads.at(-1)?.part || current().part;
    const label = token => (token?.children || []).map(t => /^(text|text_special|code_inline|image|emoji|math_inline)$/.test(t.type)
      ? t.content : /^(softbreak|hardbreak)$/.test(t.type) ? ' ' : '').join('').trim() || token?.content?.trim() || '';
    const add = (start, end, kind, name, parent = owner()) => {
      let counts = counters.get(parent);
      if (!counts) counters.set(parent, counts = new Map());
      const index = counts.get(kind) || 0; counts.set(kind, index + 1);
      const p = {start, end, kind, name, children: [], key: parent.key + '/' + kind + index};
      parent.children.push(p);
      return p;
    };
    const closeHeads = (frame, at, level = 0) => {
      while (frame.heads.length && frame.heads.at(-1).level >= level) frame.heads.pop().part.end = at;
    };
    function mapping(content, map, row, fence = false) {
      if (!map) {
        if (!row) return null;
        const found = row.text.indexOf(content, row.at);
        if (found < 0) return null;
        row.at = found + content.length;
        return pos => {
          const at = found + pos;
          let lo = 0, hi = row.skips.length;
          while (lo < hi) { const mid = (lo + hi) >>> 1; if (row.skips[mid] <= at) lo = mid + 1; else hi = mid; }
          return row.start + at + lo;
        };
      }
      const starts = [], where = [], contentLines = content.split('\n');
      let consumed = 0;
      for (let i = 0; i < contentLines.length; i++) {
        const from = line(map[0] + i), to = line(map[0] + i + 1);
        const value = contentLines[i], end = to - (source[to - 1] === '\n' ? 1 : 0);
        const found = fence ? i === contentLines.length - 1 && !value ? 0 : end - from - value.length
          : source.slice(from, to).indexOf(value);
        if (found < 0 || source.slice(from + found, from + found + value.length) !== value) return null;
        starts.push(consumed); where.push(from + found); consumed += contentLines[i].length + 1;
      }
      return pos => {
        let lo = 0, hi = starts.length;
        while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= pos) lo = mid; else hi = mid; }
        return where[lo] + pos - starts[lo];
      };
    }
    function rowMapping(map) {
      const start = line(map[0]), skips = [];
      const value = source.slice(start, line(map[1])).replace(/\\\|/g, (_, at) => {
        skips.push(at - skips.length); return '|';
      });
      return {text: value, start, skips, at: 0};
    }
    const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
    function relation(at, kind, target, labelAt) { pending.push({at, kind, target, labelAt}); }
    function refLabel(raw) {
      const first = raw[0] === '!' ? 1 : 0;
      let depth = 1, end = first + 1;
      if (raw[first] !== '[') return null;
      for (; end < raw.length; end++) {
        if (raw[end] === '\\') end++;
        else if (raw[end] === '[') depth++;
        else if (raw[end] === ']' && --depth === 0) break;
      }
      const tail = raw.slice(end + 1);
      if (tail[0] === '(') return null;
      if (tail[0] === '[' && tail.endsWith(']') && tail.length > 2)
        return {label: tail.slice(1, -1), from: end + 2, to: raw.length - 1};
      return {label: raw.slice(first + 1, end), from: first + 1, to: end};
    }
    function inline(token, p, mapped) {
      if (!mapped) return;
      for (const child of token.children || []) {
        const spot = seen.get(child);
        if (!spot || spot.end <= spot.start) continue;
        const positions = spot.source === token.content ? mapped : token.map ? mapping(spot.source, token.map) : null;
        if (!positions) continue;
        const raw = spot.source.slice(spot.start, spot.end);
        const at = [original(positions(spot.start)), original(positions(spot.end))];
        if (child.type === 'code_inline' || child.type === 'html_inline') continue;
        const image = child.type === 'image', footnote = child.type === 'footnote_ref';
        const href = child.attrGet?.(image ? 'src' : 'href') || '';
        const target = footnote ? child.meta?.label ?? env.footnotes?.list?.[child.meta?.id]?.label : href;
        add(...at, footnote ? 'link' : image ? 'image' : 'link', target || label(child), p);
        if (footnote) {
          const match = /^\[\^([\s\S]*)\]$/.exec(raw);
          const site = match ? [original(positions(spot.start + 2)), original(positions(spot.end - 1))] : at;
          if (target != null) relation(site, 'footnote', String(target));
          continue;
        }
        const ref = refLabel(raw);
        if (ref && Object.hasOwn(env.references || {}, normalize(ref.label))) {
          relation([original(positions(spot.start + ref.from)), original(positions(spot.start + ref.to))], 'reference', normalize(ref.label));
        } else if (href[0] === '#') {
          const hash = raw.lastIndexOf('#');
          let end = hash;
          while (end < raw.length && !/[\s)>]/.test(raw[end])) end++;
          const labelEnd = raw.indexOf(']('), labelStart = image ? 2 : 1;
          const labelAt = labelEnd > labelStart ? [original(positions(spot.start + labelStart)), original(positions(spot.start + labelEnd))] : undefined;
          relation(hash < 0 ? at : [original(positions(spot.start + hash + 1)), original(positions(spot.start + end))], 'heading', decode(href.slice(1)), labelAt);
        } else if (href) links.push({at, to: href});
      }
    }
    for (let index = 0; index < definitions.length; index++) {
      const def = definitions[index];
      const name = def.footnote ? '[^' + def.label + ']' : '[' + normalize(def.label) + ']';
      const p = {start: original(def.start), end: trimEnd(original(def.end)), kind: def.footnote ? 'footnote' : 'link',
        name, nameAt: [original(def.nameStart), original(def.nameEnd)], children: [], key: 'm/' + (def.footnote ? 'footnote' : 'reference') + index};
      def.part = p;
      if (def.footnote) footnotes.set(def.label, p);
      const id = (def.footnote ? 'footnote:' : 'reference:') + (def.footnote ? def.label : normalize(def.label));
      if (!targets.has(id)) targets.set(id, p);
      if (!def.footnote) {
        const reference = env.references?.[normalize(def.label)];
        if (reference?.href?.startsWith('#')) {
          let at = def.nameEnd + 2;
          while (/\s/.test(source[at] || '') && at < def.end) at++;
          const destination = parser.helpers.parseLinkDestination(source, at, def.end);
          if (destination.ok) relation([original(at + (source[at] === '<' ? 2 : 1)), original(destination.pos - (source[at] === '<' ? 1 : 0))], 'heading', decode(reference.href.slice(1)));
        }
      }
    }
    let heading = null, fenceIndex = 0;
    const containers = {paragraph_open: 'paragraph', bullet_list_open: 'list', ordered_list_open: 'list',
      list_item_open: 'item', blockquote_open: 'quote', table_open: 'table', tr_open: 'row', td_open: 'cell', th_open: 'cell'};
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], frame = current();
      if (token.type === 'heading_open' && token.map) {
        const level = Number(token.tag.slice(1)), [start] = range(token.map), next = tokens[i + 1];
        closeHeads(frame, start, level);
        const plain = label(next), baseName = '#'.repeat(level) + ' ' + plain;
        const repeated = usedNames.get(baseName) || 0; usedNames.set(baseName, repeated + 1);
        const p = add(start, frame.part.end, 'section', baseName + (repeated ? ' [' + (repeated + 1) + ']' : ''));
        const mapped = next?.type === 'inline' && mapping(next.content, next.map);
        if (mapped) p.nameAt = [original(mapped(0)), original(mapped(next.content.length))];
        let slug = token.attrGet?.('id');
        if (!slug) {
          const base = plain.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'heading';
          slug = base;
          let suffix = 0;
          while (usedSlugs.has(slug)) slug = base + '-' + ++suffix;
        }
        usedSlugs.set(slug, true); targets.set('heading:' + slug, p);
        frame.heads.push({level, part: p}); heading = p;
        continue;
      }
      if (token.type === 'heading_close') { heading = null; continue; }
      if (token.type === 'footnote_open' || token.type === 'footnote_reference_open') {
        const name = token.meta?.label ?? env.footnotes?.list?.[token.meta?.id]?.label;
        const p = footnotes.get(String(name));
        if (p) frames.push({part: p, heads: [], close: token.type.replace('_open', '_close')});
        continue;
      }
      if (token.type === current().close) {
        closeHeads(current(), current().part.end);
        frames.pop();
        continue;
      }
      if (containers[token.type]) {
        let kind = containers[token.type], map = token.map;
        const following = tokens.slice(i + 1, i + 6).find(t => t.type === 'inline');
        let name = kind === 'item' || kind === 'row' ? label(following) : kind;
        if (kind === 'item' && (/^\[[ xX]\](?:\s|$)/.test(following?.content || '') ||
          /(?:^|\s)(?:[-+*]|\d+[.)])[ \t]+\[[ xX]\](?:\s|$)/.test(source.slice(line(map[0]), line(map[0] + 1))))) {
          kind = 'task'; name = name.replace(/^\[[ xX]\]\s*/, '');
        }
        const bounds = map ? range(map) : [frame.part.start, frame.part.end];
        const p = add(...bounds, kind, name || kind);
        const child = {part: p, heads: [], close: token.type.replace('_open', '_close')};
        if (kind === 'table') child.columns = [];
        if (kind === 'row' && map) { child.row = rowMapping(map); child.column = 0; }
        if (kind === 'cell') {
          let rowFrame, table;
          for (let j = frames.length - 1; j >= 0 && !(rowFrame && table); j--) {
            if (!rowFrame && frames[j].row) rowFrame = frames[j];
            if (!table && frames[j].columns) table = frames[j];
          }
          child.row = rowFrame?.row;
          child.column = rowFrame ? rowFrame.column++ : 0;
          child.table = table;
          child.header = token.type === 'th_open';
        }
        frames.push(child);
        continue;
      }
      if (token.type === 'inline') {
        const p = heading || frame.part, mapped = mapping(token.content, token.map, frame.row);
        if (mapped && (p.kind === 'paragraph' || p.kind === 'cell')) {
          p.start = original(mapped(0)); p.end = original(mapped(token.content.length));
          if (p.kind === 'paragraph') p.name = label(token);
          else {
            if (frame.header && frame.table) frame.table.columns[frame.column] = label(token);
            p.name = frame.table?.columns[frame.column] || 'column:' + (frame.column + 1);
          }
        }
        inline(token, p, mapped);
        continue;
      }
      if (token.type === 'fence' && token.map) {
        const language = token.info.trim().split(/\s+/)[0], p = add(...range(token.map), 'block', (language || 'code') + ':' + ++fenceIndex);
        if (code) {
          const mapped = mapping(token.content, [token.map[0] + 1, token.map[1]], null, true);
          if (mapped) try {
            const parsed = code(token.content, {language}), names = new Set();
            const position = at => {
              if (!Number.isSafeInteger(at) || at < 0 || at > token.content.length) throw null;
              return original(mapped(at));
            };
            const span = at => {
              if (!Array.isArray(at) || at.length !== 2 || at[0] > at[1]) throw null;
              return at.map(position);
            };
            const key = value => {
              if (typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) throw null;
              return p.key + '/' + typeof value + ':' + value;
            };
            const lift = row => {
              names.add(row.name);
              return {...row, start: position(row.start), end: position(row.end), name: p.name + '/' + row.name,
                ...(row.key != null ? {key: key(row.key)} : {}), ...(row.nameAt ? {nameAt: span(row.nameAt)} : {}),
                ...(row.children ? {children: row.children.map(lift)} : {})};
            };
            const children = (parsed.parts || []).map(lift);
            const nested = (parsed.links || []).map(link => ({...link, at: span(link.at),
              to: names.has(link.to) ? p.name + '/' + link.to : link.to,
              ...(link.key != null ? {key: key(link.key)} : {}), ...(link.labelAt ? {labelAt: span(link.labelAt)} : {})}));
            p.children = children; links.push(...nested);
          } catch {}
        }
        continue;
      }
      if (token.type === 'code_block' && token.map) add(...range(token.map), 'block', 'code:' + ++fenceIndex);
      else if (token.type === 'html_block' && token.map) add(...range(token.map), 'block', 'html');
    }
    while (frames.length) { closeHeads(current(), current().part.end); frames.pop(); }
    const insert = (row, parent = root) => {
      const container = parent.children.find(p => p !== row && p.start <= row.start && p.end >= row.end && p.kind !== 'link');
      if (container) insert(row, container); else if (!parent.children.includes(row)) parent.children.push(row);
    };
    for (const def of definitions) insert(def.part);
    for (const link of pending) {
      const target = targets.get(link.kind + ':' + link.target);
      links.push({at: link.at, to: target?.name || (link.kind === 'heading' ? '#' + link.target
        : link.kind === 'footnote' ? '[^' + link.target + ']' : '[' + link.target + ']'), ...(target ? {key: target.key} : {}),
        ...(link.labelAt ? {labelAt: link.labelAt} : {})});
    }
    const tidy = rows => { rows.sort((a, b) => a.start - b.start || b.end - a.end); for (const p of rows) if (p.children) { tidy(p.children); if (!p.children.length) delete p.children; } };
    tidy(parts); links.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
    const semantic = rows => rows.map(t => [t.type, t.tag, t.attrs, t.hidden, t.info,
      t.children ? semantic(t.children) : t.content, t.meta]);
    return {parts, links, meaning: JSON.stringify([semantic(tokens), env])};
  };
}
