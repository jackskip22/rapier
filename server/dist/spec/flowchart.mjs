// SPDX-License-Identifier: MIT
export const FLOWCHART_LIMITS = Object.freeze({sourceChars: 65536, statementChars: 8192, statements: 256, idChars: 64,
  labelChars: 4096, classDefs: 32, classNamesPerNode: 16, references: 256, figures: 128, obstacles: 96, textChars: 262144});

const FLOWCHART_REASONS = Object.freeze({
  flowchart_source: 'A flowchart needs text.',
  flowchart_header: 'Start with flowchart or graph.',
  flowchart_direction: 'Use TD, TB, BT, LR or RL.',
  flowchart_empty: 'Add a node to the flowchart.',
  flowchart_source_limit: 'Use at most 65,536 characters in a native flowchart.',
  flowchart_statement_size: 'Use at most 8,192 characters in each statement.',
  flowchart_statement_limit: 'Use at most 256 flowchart statements.',
  flowchart_id_limit: 'Use ids of at most 64 characters.',
  flowchart_label_limit: 'Use labels of at most 4,096 characters.',
  flowchart_empty_label: 'Give the label some text.',
  flowchart_unsafe_label: 'Use plain text in flowchart labels.',
  flowchart_syntax: 'This flowchart syntax is not supported.',
  flowchart_unsupported: 'This flowchart syntax needs the Mermaid plug-in.',
  flowchart_nested_group: 'Use one level of subgraphs.',
  flowchart_group: 'Give each subgraph a unique id, a title and nodes, then close it with end.',
  flowchart_group_member: 'Put each node in one subgraph.',
  flowchart_id_conflict: 'Use different ids for nodes and subgraphs.',
  flowchart_class_limit: 'Use at most 32 classes and 16 classes per node.',
  flowchart_reference_limit: 'Use at most 256 class and style references.',
  flowchart_class_unknown: 'Define every class before using the flowchart.',
  flowchart_node_unknown: 'Apply styles only to nodes in the flowchart.',
  flowchart_style: 'Use only fill, stroke and color.',
  flowchart_color: 'Use a supported color name or #rgb or #rrggbb.',
  flowchart_figure_limit: 'Use at most 128 nodes, edges and subgraph figures together.',
  flowchart_obstacle_limit: 'Use at most 96 nodes and subgraph titles together.',
  flowchart_text_limit: 'Use at most 262,144 label characters after expanding edges.'
});
const FLOWCHART_COLORS = Object.freeze({black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  red: '#ff0000', maroon: '#800000', yellow: '#ffff00', olive: '#808000', lime: '#00ff00', green: '#008000', aqua: '#00ffff', cyan: '#00ffff',
  teal: '#008080', blue: '#0000ff', navy: '#000080', fuchsia: '#ff00ff', magenta: '#ff00ff', purple: '#800080', orange: '#ffa500',
  gold: '#ffd700', pink: '#ffc0cb', brown: '#a52a2a', rebeccapurple: '#663399'});
const FLOWCHART_SHAPES = [['([', '])', 'stadium'], ['((', '))', 'circle'], ['[(', ')]', 'cylinder'], ['[[', ']]', 'subroutine'],
  ['{{', '}}', 'hexagon'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond'], ['>', ']', 'asymmetric']];
const FLOWCHART_EDGES = [['<-.->', true, true, true, false], ['<-->', true, true, false, false], ['-.->', false, true, true, false],
  ['-->', false, true, false, false], ['---', false, false, false, false], ['-.-', false, false, true, false], ['==>', false, true, false, true]];
const FLOWCHART_RESERVED = new Set(['flowchart', 'graph', 'subgraph', 'end', 'classDef', 'class', 'style', 'click', 'href', 'direction', 'linkStyle']);
const flowchartFail = code => { throw {flowchart: true, code}; };
const flowchartCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const flowchartSpace = cursor => { while (cursor.s[cursor.p] === ' ' || cursor.s[cursor.p] === '\t') cursor.p++; };
const flowchartGap = cursor => {
  if (cursor.s[cursor.p] !== ' ' && cursor.s[cursor.p] !== '\t') flowchartFail('flowchart_syntax');
  flowchartSpace(cursor);
};

function flowchartStatements(source) {
  const out = [];
  let start = 0, quote = false;
  const add = end => {
    const raw = source.slice(start, end);
    if (!raw.trim()) return;
    if (raw.length > FLOWCHART_LIMITS.statementChars) flowchartFail('flowchart_statement_size');
    if (out.length >= FLOWCHART_LIMITS.statements) flowchartFail('flowchart_statement_limit');
    out.push({text: raw.trim(), start: start + raw.length - raw.trimStart().length});
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') quote = !quote;
    else if (!quote && c === '%' && source[i + 1] === '%') {
      if (source[i + 2] === '{') flowchartFail('flowchart_unsupported');
      add(i);
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      start = i + 1;
    } else if (!quote && (c === ';' || c === '\n' || c === '\r')) { add(i); start = i + 1; }
  }
  add(source.length);
  if (quote) flowchartFail('flowchart_syntax');
  return out;
}

function flowchartId(cursor, node = false) {
  flowchartSpace(cursor);
  const start = cursor.p;
  if (!/[A-Za-z0-9_]/.test(cursor.s[cursor.p] || '')) flowchartFail('flowchart_syntax');
  while (cursor.p < cursor.s.length) {
    const c = cursor.s[cursor.p];
    if (node && c === '-' && (cursor.s[cursor.p + 1] === '-' || cursor.s[cursor.p + 1] === '.')) break;
    if (!/[A-Za-z0-9_-]/.test(c)) break;
    cursor.p++;
  }
  const id = cursor.s.slice(start, cursor.p);
  if (id.length > FLOWCHART_LIMITS.idChars) flowchartFail('flowchart_id_limit');
  return id;
}

function flowchartIds(cursor) {
  const ids = [flowchartId(cursor)];
  while (cursor.p < cursor.s.length) {
    const before = cursor.p;
    flowchartSpace(cursor);
    if (cursor.s[cursor.p] !== ',') { cursor.p = before; break; }
    cursor.p++;
    ids.push(flowchartId(cursor));
  }
  return ids;
}

function flowchartLabel(source) {
  if (source.length > FLOWCHART_LIMITS.labelChars) flowchartFail('flowchart_label_limit');
  const value = source.replace(/<br\s*\/?>/gi, ' ');
  if (!value.trim()) flowchartFail('flowchart_empty_label');
  if (/\$\$.*?\$\$/.test(value)) flowchartFail('flowchart_unsupported');
  if (/[<>\x00-\x1f\x7f-\x9f\ud800-\udfff\ufffe\uffff]/u.test(value) ||
      /&(?:#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*;)|&(?:amp|lt|gt|quot|apos)(?:;|(?=[^A-Za-z0-9]|$))|#[A-Za-z0-9]+;/i.test(value) ||
      /(?:https?|ftp|file|javascript|vbscript|data|blob|mailto|tel):|\/\/|\bwww\./i.test(value)) flowchartFail('flowchart_unsafe_label');
  return source.replace(/<br\s*\/?>/gi, '\n');
}

function flowchartDelimited(cursor, close, shape) {
  flowchartSpace(cursor);
  const at = cursor.p;
  let value, to;
  if (cursor.s[cursor.p] === '"') {
    const start = ++cursor.p, end = cursor.s.indexOf('"', start);
    if (end < 0) flowchartFail('flowchart_syntax');
    value = cursor.s.slice(start, end);
    if (value.startsWith('`') && value.endsWith('`')) flowchartFail('flowchart_syntax');
    cursor.p = to = end + 1;
    flowchartSpace(cursor);
    if (!cursor.s.startsWith(close, cursor.p)) flowchartFail('flowchart_syntax');
    cursor.closeAt = cursor.base + cursor.p;
  } else {
    const end = cursor.s.indexOf(close, cursor.p);
    if (end < 0) flowchartFail('flowchart_syntax');
    value = cursor.s.slice(cursor.p, end).trim();
    if (/[\[\](){}"`|]/.test(value) || shape === 'rect' && (/^[\/\\]/.test(value) || /[\/\\]$/.test(value))) flowchartFail('flowchart_syntax');
    to = cursor.p + value.length;
    cursor.p = end;
    cursor.closeAt = cursor.base + end;
  }
  cursor.labelSpan = {start: cursor.base + at, end: cursor.base + to};
  cursor.p += close.length;
  return flowchartLabel(value);
}

function flowchartColor(raw) {
  const value = raw.trim().toLowerCase();
  if (Object.hasOwn(FLOWCHART_COLORS, value)) return FLOWCHART_COLORS[value];
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return '#' + value.slice(1).split('').map(c => c + c).join('');
  flowchartFail('flowchart_color');
}

function flowchartStyle(source) {
  const out = {};
  for (const field of source.split(',')) {
    const colon = field.indexOf(':');
    const key = field.slice(0, colon).trim();
    if (colon < 0 || !['fill', 'stroke', 'color'].includes(key)) flowchartFail('flowchart_style');
    out[key] = flowchartColor(field.slice(colon + 1));
  }
  return out;
}

function flowchartEdge(cursor) {
  flowchartSpace(cursor);
  cursor.labelSpan = null;
  cursor.specEnd = null;
  let spec = FLOWCHART_EDGES.find(([token]) => cursor.s.startsWith(token, cursor.p)), label;
  if (spec) {
    cursor.p += spec[0].length;
    cursor.specEnd = cursor.base + cursor.p;
    flowchartSpace(cursor);
    if (cursor.s[cursor.p] === '|') { cursor.p++; label = flowchartDelimited(cursor, '|'); }
  } else {
    const dotted = cursor.s.startsWith('-.', cursor.p);
    if (!dotted && !cursor.s.startsWith('--', cursor.p)) flowchartFail('flowchart_syntax');
    cursor.p += 2;
    label = flowchartDelimited(cursor, dotted ? '.->' : '-->');
    if (cursor.s[cursor.p - 4] === (dotted ? '.' : '-')) flowchartFail('flowchart_unsupported');
    spec = ['', false, true, dotted, false];
  }
  const [, headStart, headEnd, dash, thick] = spec;
  return {kind: headStart || headEnd ? 'arrow' : 'line', headStart, headEnd, dash, thick, ...(label === undefined ? {} : {label})};
}

export function parseFlowchart(source, sourceLabels = null) {
  try {
    if (typeof source !== 'string') flowchartFail('flowchart_source');
    if (source.length > FLOWCHART_LIMITS.sourceChars) flowchartFail('flowchart_source_limit');
    const statements = flowchartStatements(source), headerRow = statements.shift(), header = headerRow?.text.split(/[ \t]+/);
    if (!header || !['flowchart', 'graph'].includes(header[0])) flowchartFail('flowchart_header');
    if (header.length > 2) flowchartFail('flowchart_syntax');
    if (header[1] && !['TD', 'TB', 'BT', 'LR', 'RL'].includes(header[1])) flowchartFail('flowchart_direction');
    const direction = !header[1] || header[1] === 'TB' ? 'TD' : header[1];
    const nodes = new Map(), edges = [], groups = new Map(), membership = new Map(), classes = new Map(), assignments = new Map(), styles = new Map();
    const labels = sourceLabels && {nodes: new Map(), edges: new Map(), groups: new Map()};
    const structure = sourceLabels && {header: null, statements: [], pairs: new Map()};
    if (structure) {
      const head = /^(flowchart|graph)([ \t]+)(\S+)?/.exec(headerRow.text);
      structure.header = {start: headerRow.start, end: headerRow.start + headerRow.text.length,
        directionStart: head?.[3] ? headerRow.start + head[1].length + head[2].length : null,
        directionEnd: head?.[3] ? headerRow.start + head[0].length : null};
    }
    let group = null, textChars = 0, references = 0;
    const bounds = () => {
      if (nodes.size + edges.length + groups.size * 2 > FLOWCHART_LIMITS.figures) flowchartFail('flowchart_figure_limit');
      if (nodes.size + groups.size > FLOWCHART_LIMITS.obstacles) flowchartFail('flowchart_obstacle_limit');
    };
    const reference = () => { if (++references > FLOWCHART_LIMITS.references) flowchartFail('flowchart_reference_limit'); };
    const assign = (id, names) => {
      const held = assignments.get(id) || [];
      for (const name of names) {
        reference();
        if (!held.includes(name)) held.push(name);
        if (held.length > FLOWCHART_LIMITS.classNamesPerNode) flowchartFail('flowchart_class_limit');
      }
      assignments.set(id, held);
    };
    const readNode = cursor => {
      flowchartSpace(cursor);
      const tokenStart = cursor.base + cursor.p;
      const id = flowchartId(cursor, true);
      const idEnd = cursor.base + cursor.p;
      let tokenEnd = idEnd;
      if (FLOWCHART_RESERVED.has(id)) flowchartFail('flowchart_unsupported');
      if (groups.has(id)) flowchartFail('flowchart_id_conflict');
      let value = nodes.get(id);
      if (!value) {
        value = {id, label: id, shape: 'rect'}; nodes.set(id, value); textChars += id.length;
        labels?.nodes.set(id, {start: idEnd, end: idEnd, implicit: true});
      }
      flowchartSpace(cursor);
      const shape = FLOWCHART_SHAPES.find(([open]) => cursor.s.startsWith(open, cursor.p));
      if (shape) {
        const openAt = cursor.base + cursor.p;
        cursor.p += shape[0].length;
        const label = flowchartDelimited(cursor, shape[1], shape[2]);
        textChars += label.length - value.label.length;
        value.label = label; value.shape = shape[2];
        tokenEnd = cursor.base + cursor.p;
        labels?.nodes.set(id, {...cursor.labelSpan, shape: shape[2], open: shape[0], close: shape[1], openAt, closeAt: cursor.closeAt});
      }
      if (group) {
        if (membership.has(id) && membership.get(id) !== group.id) flowchartFail('flowchart_group_member');
        membership.set(id, group.id); group.members.add(id);
      }
      bounds();
      flowchartSpace(cursor);
      while (cursor.s.startsWith(':::', cursor.p)) {
        cursor.p += 3;
        assign(id, [flowchartId(cursor, true)]);
        tokenEnd = cursor.base + cursor.p;
        flowchartSpace(cursor);
      }
      cursor.token = {id, start: tokenStart, end: tokenEnd};
      return id;
    };
    const endpoints = cursor => {
      const ids = [readNode(cursor)];
      ids.tokens = [cursor.token];
      while (cursor.s[cursor.p] === '&') { cursor.p++; ids.push(readNode(cursor)); ids.tokens.push(cursor.token); }
      return ids;
    };
    for (const row of statements) {
      const statement = row.text, cursor = {s: statement, p: 0, base: row.start}, first = statement.match(/^[A-Za-z][A-Za-z0-9]*(?=[ \t]|$)/)?.[0];
      if (first === 'subgraph') {
        if (group) flowchartFail('flowchart_nested_group');
        cursor.p = first.length;
        flowchartGap(cursor);
        const id = flowchartId(cursor);
        if (groups.has(id)) flowchartFail('flowchart_group');
        if (nodes.has(id)) flowchartFail('flowchart_id_conflict');
        flowchartSpace(cursor);
        if (cursor.s[cursor.p++] !== '[') flowchartFail('flowchart_group');
        const title = flowchartDelimited(cursor, ']');
        labels?.groups.set(id, cursor.labelSpan);
        flowchartSpace(cursor);
        if (cursor.p !== cursor.s.length) flowchartFail('flowchart_syntax');
        structure?.statements.push({kind: 'subgraph', id, start: row.start, end: row.start + statement.length});
        group = {id, title, members: new Set()};
        groups.set(id, group); textChars += title.length; bounds();
      } else if (first === 'end') {
        if (statement !== 'end' || !group) flowchartFail('flowchart_group');
        structure?.statements.push({kind: 'end', id: group.id, start: row.start, end: row.start + statement.length});
        group = null;
      } else if (first === 'classDef' || first === 'class' || first === 'style') {
        cursor.p = first.length;
        flowchartGap(cursor);
        const listStart = row.start + cursor.p;
        const ids = first === 'style' ? [flowchartId(cursor)] : flowchartIds(cursor);
        structure?.statements.push({kind: first, ids, start: row.start, end: row.start + statement.length,
          listStart, listEnd: row.start + cursor.p});
        flowchartGap(cursor);
        if (first === 'class') {
          const names = flowchartIds(cursor);
          flowchartSpace(cursor);
          if (cursor.p !== cursor.s.length) flowchartFail('flowchart_syntax');
          for (const id of ids) assign(id, names);
        } else {
          const style = flowchartStyle(cursor.s.slice(cursor.p));
          for (const id of ids) {
            const map = first === 'style' ? styles : classes;
            if (first === 'style') reference();
            map.set(id, {...map.get(id), ...style});
            if (classes.size > FLOWCHART_LIMITS.classDefs) flowchartFail('flowchart_class_limit');
          }
        }
      } else {
        if (first && FLOWCHART_RESERVED.has(first)) flowchartFail('flowchart_unsupported');
        let from = endpoints(cursor);
        const chain = {kind: 'chain', start: row.start, end: row.start + statement.length, group: group?.id ?? null, groups: [from.tokens], links: []};
        structure?.statements.push(chain);
        while (cursor.p < cursor.s.length) {
          const linkStart = row.start + cursor.p;
          const edge = flowchartEdge(cursor), labelSpan = cursor.labelSpan, specEnd = cursor.specEnd, linkEnd = row.start + cursor.p, to = endpoints(cursor);
          const link = {start: linkStart + (cursor.s.slice(linkStart - row.start).length - cursor.s.slice(linkStart - row.start).trimStart().length), end: linkEnd, specEnd, labelled: !!labelSpan};
          chain.links.push(link); chain.groups.push(to.tokens);
          for (const [fromIndex, a] of from.entries()) for (const [toIndex, b] of to.entries()) {
            const value = {from: a, to: b, ...edge};
            edges.push(value); if (labelSpan) labels?.edges.set(value, labelSpan);
            structure?.pairs.set(value, {chain, link: chain.links.length - 1, fromIndex, toIndex});
            textChars += edge.label?.length || 0; bounds();
          }
          from = to;
        }
      }
    }
    if (group) flowchartFail('flowchart_group');
    if (!nodes.size && !groups.size) flowchartFail('flowchart_empty');
    if (textChars > FLOWCHART_LIMITS.textChars) flowchartFail('flowchart_text_limit');
    for (const id of new Set([...assignments.keys(), ...styles.keys()])) if (!nodes.has(id)) flowchartFail('flowchart_node_unknown');
    for (const value of nodes.values()) {
      const style = {...classes.get('default')};
      for (const name of assignments.get(value.id) || []) {
        if (!classes.has(name)) flowchartFail('flowchart_class_unknown');
        Object.assign(style, classes.get(name));
      }
      Object.assign(style, styles.get(value.id));
      const canonical = {};
      for (const key of ['fill', 'stroke', 'color']) if (style[key] !== undefined) canonical[key] = style[key];
      if (Object.keys(canonical).length) value.style = canonical;
    }
    edges.sort((a, b) => flowchartCompare(JSON.stringify(a), JSON.stringify(b)));
    if (sourceLabels) Object.assign(sourceLabels, {nodes: labels.nodes, groups: labels.groups,
      edges: new Map(edges.map((edge, index) => [index, labels.edges.get(edge)])),
      structure: {header: structure.header, statements: structure.statements, pairs: new Map(edges.map((edge, index) => [index, structure.pairs.get(edge)]))}});
    return {ok: true, graph: {direction, nodes: [...nodes.values()].sort((a, b) => flowchartCompare(a.id, b.id)), edges,
      groups: [...groups.values()].sort((a, b) => flowchartCompare(a.id, b.id)).map(({id, title, members}) => ({id, title, members: [...members].sort(flowchartCompare)}))}};
  } catch (error) {
    if (!error?.flowchart) throw error;
    return {ok: false, code: error.code, reason: FLOWCHART_REASONS[error.code]};
  }
}

export function editFlowchartLabel(source, target, value) {
  const labels = {}, parsed = parseFlowchart(source, labels);
  if (!parsed.ok) return parsed;
  if (target?.kind === 'edge') {
    const where = labels.structure.pairs.get(target.id);
    if (where && (where.chain.groups[where.link].length > 1 || where.chain.groups[where.link + 1].length > 1))
      return setFlowchartEdgeLabel(source, target.id, value);
  }
  const span = labels[target?.kind + 's']?.get(target.id);
  if (!span || typeof value !== 'string' || value.includes('"'))
    return {ok: false, reason: 'Use a plain-text label without double quotes.'};
  value = value.replace(/\r\n?|\n/g, '<br>');
  const inserted = span.implicit ? '["' + value + '"]' : '"' + value + '"';
  const next = source.slice(0, span.start) + inserted + source.slice(span.end);
  const admitted = parseFlowchart(next);
  if (!admitted.ok) return admitted;
  return {ok: true, source: next, splice: {pos: span.start, removed: source.slice(span.start, span.end), inserted}};
}

const FLOWCHART_EDIT_REASONS = Object.freeze({
  ...FLOWCHART_REASONS,
  flowchart_empty: 'A flowchart needs at least one box.',
  flowchart_group: 'A subgraph needs at least one box.',
  edit_target: 'That part of the flowchart is gone.',
  edit_same: 'A box cannot connect to itself.',
  edit_twice: 'Those boxes are already connected.',
  edit_label: 'Use a plain-text label without double quotes.',
  edit_shape: 'Rapier does not draw that shape.',
  edit_direction: 'Use TD, TB, BT, LR or RL.'
});
const flowchartReason = code => FLOWCHART_EDIT_REASONS[code] || FLOWCHART_REASONS[code];
const flowchartEol = source => /\r\n|\n|\r/.exec(source)?.[0] || '\n';
const flowchartRefuse = code => ({ok: false, code, reason: flowchartReason(code)});

function flowchartAnalyze(source) {
  const spans = {}, parsed = parseFlowchart(source, spans);
  if (!parsed.ok) return {ok: false, code: parsed.code, reason: flowchartReason(parsed.code)};
  return {ok: true, graph: parsed.graph, spans, structure: spans.structure};
}

function flowchartAdmit(source, next, extra = {}) {
  const parsed = parseFlowchart(next);
  if (!parsed.ok) return {ok: false, code: parsed.code, reason: flowchartReason(parsed.code)};
  return {ok: true, source: next, ...extra};
}

export function nextFlowchartId(graph) {
  const used = new Set([...graph.nodes.map(node => node.id), ...graph.groups.map(group => group.id)].map(id => id.toLowerCase()));
  const free = id => !used.has(id.toLowerCase()) && !FLOWCHART_RESERVED.has(id);
  const letters = 'ABCDEFGHIJKLMNPQRSTUVWYZ';
  for (const letter of letters) if (free(letter)) return letter;
  for (let n = 1; ; n++) for (const letter of letters) if (free(letter + n)) return letter + n;
}

const flowchartLineIndent = (source, at) => {
  const lineStart = Math.max(source.lastIndexOf('\n', at - 1), source.lastIndexOf('\r', at - 1)) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, at))[0];
};

function flowchartAppend(source, structure, text) {
  const end = source.trimEnd().length;
  const last = structure.statements.at(-1);
  const indent = last ? flowchartLineIndent(source, last.start) : '    ';
  const lead = indent || (structure.statements.length ? '' : '    ');
  return {pos: end, inserted: flowchartEol(source) + lead + text};
}

const flowchartSplice = (source, splice) => ({pos: splice.pos, removed: splice.removed ?? '', inserted: splice.inserted,
  source: source.slice(0, splice.pos) + splice.inserted + source.slice(splice.pos + (splice.removed?.length ?? 0))});

const flowchartQuote = label => {
  if (typeof label !== 'string' || label.includes('"') || !label.trim()) return null;
  return '"' + label.replace(/\r\n?|\n/g, '<br>') + '"';
};

function flowchartWithout(source, tokens, id, index = tokens.findIndex(token => token.id === id)) {
  if (index < 0) return source.slice(tokens[0].start, tokens.at(-1).end);
  if (tokens.length === 1) return '';
  const start = index === tokens.length - 1 ? tokens[index - 1].end : tokens[index].start;
  const end = index === tokens.length - 1 ? tokens[index].end : tokens[index + 1].start;
  return source.slice(tokens[0].start, start) + source.slice(end, tokens.at(-1).end);
}

function flowchartPairRemainder(source, chain, index, from, to, fromIndex, toIndex) {
  const left = chain.groups[index], right = chain.groups[index + 1];
  const join = source.slice(left.at(-1).end, right[0].start);
  const a = flowchartWithout(source, left, from, fromIndex), b = flowchartWithout(source, right, to, toIndex);
  const token = left[fromIndex ?? left.findIndex(token => token.id === from)];
  return [a && a + join + source.slice(right[0].start, right.at(-1).end),
    b && source.slice(token.start, token.end) + join + b].filter(Boolean);
}

export function addFlowchartBox(source, fromId, label) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (!info.graph.nodes.some(node => node.id === fromId)) return flowchartRefuse('edit_target');
  const quoted = flowchartQuote(label);
  if (quoted === null) return flowchartRefuse(typeof label === 'string' && !label.trim() ? 'flowchart_empty_label' : 'edit_label');
  const id = nextFlowchartId(info.graph);
  const splice = flowchartAppend(source, info.structure, fromId + ' --> ' + id + '[' + quoted + ']');
  const next = flowchartSplice(source, splice), admitted = flowchartAdmit(source, next.source, {id, splice: {pos: next.pos, removed: '', inserted: next.inserted}});
  return admitted;
}

export function connectFlowchartBoxes(source, fromId, toId) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  const known = id => info.graph.nodes.some(node => node.id === id);
  if (!known(fromId) || !known(toId)) return flowchartRefuse('edit_target');
  if (fromId === toId) return flowchartRefuse('edit_same');
  if (info.graph.edges.some(edge => edge.from === fromId && edge.to === toId)) return flowchartRefuse('edit_twice');
  const next = flowchartSplice(source, flowchartAppend(source, info.structure, fromId + ' --> ' + toId));
  return flowchartAdmit(source, next.source, {splice: {pos: next.pos, removed: '', inserted: next.inserted}});
}

function flowchartRemoval(source, start, end) {
  const eol = /\r\n|\n|\r/y;
  let lineStart = start, lineEnd = end;
  while (lineStart > 0 && source[lineStart - 1] !== '\n' && source[lineStart - 1] !== '\r') lineStart--;
  while (lineEnd < source.length && source[lineEnd] !== '\n' && source[lineEnd] !== '\r') lineEnd++;
  const before = source.slice(lineStart, start), after = source.slice(end, lineEnd);
  if (/^[ \t]*$/.test(before) && /^[ \t]*;?[ \t]*$/.test(after)) {
    eol.lastIndex = lineEnd;
    const tail = eol.exec(source)?.[0];
    if (tail) return {pos: lineStart, removed: source.slice(lineStart, lineEnd + tail.length)};
    if (lineStart > 0) {
      const head = /(?:\r\n|\n|\r)$/.exec(source.slice(0, lineStart))[0];
      return {pos: lineStart - head.length, removed: source.slice(lineStart - head.length, lineEnd)};
    }
    return {pos: lineStart, removed: source.slice(lineStart, lineEnd)};
  }
  const semicolon = /^[ \t]*;[ \t]*/.exec(after);
  if (semicolon) return {pos: start, removed: source.slice(start, end + semicolon[0].length)};
  return {pos: start, removed: source.slice(start, end)};
}

function flowchartRechain(source, chain, {dropNode = null, dropPair = null, keep = new Set()}) {
  const groups = chain.groups.map(tokens => tokens.filter(token => token.id !== dropNode));
  const text = token => source.slice(token.start, token.end);
  const linkText = link => source.slice(link.start, link.end).trimEnd();
  const groupText = (index, whole) => {
    const kept = groups[index];
    return !whole && kept.length === chain.groups[index].length
      ? source.slice(kept[0].start, kept.at(-1).end) : kept.map(text).join(' & ');
  };
  const alive = chain.links.map((link, index) => groups[index].length && groups[index + 1].length);
  const pieces = [], mentioned = new Set();
  const run = (from, to) => {
    if (from === to) {
      for (const token of groups[from]) if (keep.has(token.id) || text(token) !== token.id) { pieces.push(text(token)); mentioned.add(token.id); }
      return;
    }
    for (let index = from; index <= to; index++) for (const token of groups[index]) mentioned.add(token.id);
    const intact = groups.slice(from, to + 1).every((kept, index) => kept.length === chain.groups[from + index].length);
    if (intact) { pieces.push(source.slice(groups[from][0].start, groups[to].at(-1).end)); return; }
    let out = groupText(from);
    for (let index = from; index < to; index++) out += ' ' + linkText(chain.links[index]) + ' ' + groupText(index + 1);
    pieces.push(out);
  };
  let from = 0;
  for (let index = 0; index <= chain.links.length; index++) {
    const cut = index === chain.links.length || !alive[index] || (dropPair && dropPair.link === index);
    if (!cut) continue;
    if (groups[from].length) run(from, index);
    if (dropPair && dropPair.link === index && alive[index]) {
      pieces.push(...flowchartPairRemainder(source, chain, index, dropPair.from, dropPair.to, dropPair.fromIndex, dropPair.toIndex));
      for (const [ai, a] of chain.groups[index].entries()) for (const [bi, b] of chain.groups[index + 1].entries())
        if (!(ai === dropPair.fromIndex && bi === dropPair.toIndex)) { mentioned.add(a.id); mentioned.add(b.id); }
    }
    from = index + 1;
  }
  return {pieces, mentioned};
}

function flowchartApplyDrop(source, info, drop, keep) {
  const splices = [], mentioned = new Set();
  for (const row of info.structure.statements) {
    if (row.kind === 'chain') {
      const mentions = drop.node && row.groups.some(tokens => tokens.some(token => token.id === drop.node));
      const pair = drop.pair && drop.pair.chain === row;
      if (!mentions && !pair) { for (const tokens of row.groups) for (const token of tokens) mentioned.add(token.id); continue; }
      const {pieces, mentioned: kept} = flowchartRechain(source, row, {dropNode: drop.node, dropPair: pair ? drop.pair : null, keep});
      for (const id of kept) mentioned.add(id);
      if (!pieces.length) {
        const removal = flowchartRemoval(source, row.start, row.end);
        splices.push({...removal, inserted: ''});
      } else {
        const indent = flowchartLineIndent(source, row.start), eol = flowchartEol(source);
        splices.push({pos: row.start, removed: source.slice(row.start, row.end), inserted: pieces.join(eol + indent)});
      }
    } else if (drop.node && (row.kind === 'class' || row.kind === 'style') && row.ids.includes(drop.node)) {
      const rest = row.ids.filter(id => id !== drop.node);
      if (!rest.length) splices.push({...flowchartRemoval(source, row.start, row.end), inserted: ''});
      else splices.push({pos: row.listStart, removed: source.slice(row.listStart, row.listEnd), inserted: rest.join(',')});
    }
  }
  let next = source;
  for (const splice of splices.sort((a, b) => b.pos - a.pos)) next = next.slice(0, splice.pos) + splice.inserted + next.slice(splice.pos + splice.removed.length);
  return {next, mentioned, splices: splices.sort((a, b) => a.pos - b.pos)};
}

function flowchartDrop(source, info, drop, expect) {
  let result = flowchartApplyDrop(source, info, drop, new Set());
  const missing = expect.filter(id => !result.mentioned.has(id));
  if (missing.length) result = flowchartApplyDrop(source, info, drop, new Set(missing));
  return flowchartAdmit(source, result.next, {splice: result.splices[0], splices: result.splices});
}

export function deleteFlowchartBox(source, id) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (!info.graph.nodes.some(node => node.id === id)) return flowchartRefuse('edit_target');
  return flowchartDrop(source, info, {node: id}, info.graph.nodes.map(node => node.id).filter(other => other !== id));
}

export function deleteFlowchartEdge(source, index) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  const edge = info.graph.edges[index], where = info.structure.pairs.get(index);
  if (!edge || !where) return flowchartRefuse('edit_target');
  return flowchartDrop(source, info, {pair: {...where, from: edge.from, to: edge.to}}, info.graph.nodes.map(node => node.id));
}

export function setFlowchartShape(source, id, shape) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  const delimiters = FLOWCHART_SHAPES.find(row => row[2] === shape);
  if (!delimiters) return flowchartRefuse('edit_shape');
  const span = info.spans.nodes.get(id);
  if (!span) return flowchartRefuse('edit_target');
  const [open, close] = delimiters;
  if (span.implicit) {
    const label = info.graph.nodes.find(node => node.id === id).label, quoted = flowchartQuote(label);
    if (quoted === null) return flowchartRefuse('edit_label');
    if (shape === 'rect') return {ok: true, source, splice: null};
    const inserted = open + quoted + close, next = flowchartSplice(source, {pos: span.end, inserted});
    return flowchartAdmit(source, next.source, {splice: {pos: span.end, removed: '', inserted}});
  }
  if (span.shape === shape) return {ok: true, source, splice: null};
  const closed = flowchartSplice(source, {pos: span.closeAt, removed: span.close, inserted: close});
  const opened = flowchartSplice(closed.source, {pos: span.openAt, removed: span.open, inserted: open});
  return flowchartAdmit(source, opened.source, {splice: {pos: span.openAt, removed: source.slice(span.openAt, span.closeAt + span.close.length), inserted: opened.source.slice(span.openAt, span.closeAt + close.length - span.close.length + open.length)}});
}

export function setFlowchartDirection(source, direction) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (!['TD', 'TB', 'BT', 'LR', 'RL'].includes(direction)) return flowchartRefuse('edit_direction');
  const head = info.structure.header;
  const current = source.slice(head.directionStart ?? head.end, head.end);
  if (head.directionStart !== null && (current === direction || current === 'TB' && direction === 'TD' || current === 'TD' && direction === 'TB')) return {ok: true, source, splice: null};
  const splice = head.directionStart === null ? {pos: head.end, removed: '', inserted: ' ' + direction} : {pos: head.directionStart, removed: current, inserted: direction};
  return flowchartAdmit(source, flowchartSplice(source, splice).source, {splice});
}

export function setFlowchartEdgeLabel(source, index, label) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  const where = info.structure.pairs.get(index);
  if (!where) return flowchartRefuse('edit_target');
  const {chain, link} = where, left = chain.groups[link], right = chain.groups[link + 1];
  if (left.length > 1 || right.length > 1) {
    const quoted = flowchartQuote(label);
    if (quoted === null) return flowchartRefuse('edit_label');
    const edge = info.graph.edges[index], span = info.spans.edges.get(index), op = chain.links[link];
    let join = source.slice(left.at(-1).end, right[0].start);
    const offset = left.at(-1).end;
    if (span) join = join.slice(0, span.start - offset) + quoted + join.slice(span.end - offset);
    else join = join.slice(0, op.specEnd - offset) + '|' + quoted + '|' + join.slice(op.specEnd - offset);
    const a = left[where.fromIndex], b = right[where.toIndex];
    const selected = source.slice(a.start, a.end) + join + source.slice(b.start, b.end);
    const before = link ? source.slice(chain.start, left.at(-1).end) : '';
    const after = link + 1 < chain.links.length ? source.slice(right[0].start, chain.end) : '';
    const parts = [before, ...flowchartPairRemainder(source, chain, link, edge.from, edge.to, where.fromIndex, where.toIndex), selected, after].filter(Boolean);
    const splice = {pos: chain.start, removed: source.slice(chain.start, chain.end),
      inserted: parts.join(flowchartEol(source) + flowchartLineIndent(source, chain.start))};
    return flowchartAdmit(source, flowchartSplice(source, splice).source, {splice});
  }
  if (where.chain.links[where.link].labelled) return editFlowchartLabel(source, {kind: 'edge', id: index}, label);
  const quoted = flowchartQuote(label), spec = where.chain.links[where.link].specEnd;
  if (quoted === null) return flowchartRefuse(typeof label === 'string' && !label.trim() ? 'flowchart_empty_label' : 'edit_label');
  if (spec === null) return flowchartRefuse('edit_target');
  const splice = {pos: spec, removed: '', inserted: '|' + quoted + '|'};
  return flowchartAdmit(source, flowchartSplice(source, splice).source, {splice});
}

function flowchartChanges(source, splices) {
  let next = source;
  for (const splice of splices.slice().sort((a, b) => b.pos - a.pos)) {
    if (source.slice(splice.pos, splice.pos + splice.removed.length) !== splice.removed) return flowchartRefuse('edit_target');
    next = next.slice(0, splice.pos) + splice.inserted + next.slice(splice.pos + splice.removed.length);
  }
  return flowchartAdmit(source, next, {splices, splice: splices[0] || null});
}

export function deleteFlowchartSubgraph(source, id) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (!info.graph.groups.some(group => group.id === id)) return flowchartRefuse('edit_target');
  const splices = info.structure.statements.filter(row => row.id === id && ['subgraph', 'end'].includes(row.kind))
    .map(row => ({...flowchartRemoval(source, row.start, row.end), inserted: ''}));
  return flowchartChanges(source, splices);
}

export function renameFlowchartSubgraph(source, id, title) {
  return editFlowchartLabel(source, {kind: 'group', id}, title);
}

export function moveFlowchartBoxes(source, ids, target = null) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some(id => !info.graph.nodes.some(node => node.id === id)) ||
      target !== null && !info.graph.groups.some(group => group.id === target)) return flowchartRefuse('edit_target');
  const moving = new Set(ids), splices = [], lifted = [], eol = flowchartEol(source);
  const oldGroups = info.graph.groups.filter(group => group.id !== target && group.members.some(id => moving.has(id)));
  for (const group of oldGroups) {
    const remaining = group.members.filter(id => !moving.has(id));
    const rows = info.structure.statements.filter(row => row.kind === 'chain' && row.group === group.id);
    const affected = rows.filter(row => row.groups.some(tokens => tokens.some(token => moving.has(token.id))));
    for (const row of affected) {
      lifted.push(flowchartLineIndent(source, row.start) + source.slice(row.start, row.end));
      splices.push({...flowchartRemoval(source, row.start, row.end), inserted: ''});
    }
    const retained = new Set(rows.filter(row => !affected.includes(row)).flatMap(row => row.groups.flatMap(tokens => tokens.map(token => token.id))));
    const needed = remaining.filter(id => !retained.has(id));
    if (needed.length) {
      const end = info.structure.statements.find(row => row.kind === 'end' && row.id === group.id);
      splices.push({pos: end.start, removed: '', inserted: needed.join(eol + flowchartLineIndent(source, end.start)) + eol + flowchartLineIndent(source, end.start)});
    }
  }
  if (lifted.length) splices.push({pos: info.structure.header.end, removed: '', inserted: eol + lifted.join(eol)});
  if (target !== null) {
    const group = info.graph.groups.find(group => group.id === target), incoming = ids.filter(id => !group.members.includes(id));
    if (incoming.length) {
      const end = info.structure.statements.find(row => row.kind === 'end' && row.id === target);
      splices.push({pos: end.start, removed: '', inserted: incoming.join(eol + flowchartLineIndent(source, end.start)) + eol + flowchartLineIndent(source, end.start)});
    }
  }
  return flowchartChanges(source, splices);
}

export function addFlowchartSubgraph(source, id, title, members) {
  const info = flowchartAnalyze(source);
  if (!info.ok) return info;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || FLOWCHART_RESERVED.has(id) ||
      [...info.graph.nodes, ...info.graph.groups].some(node => node.id === id)) return flowchartRefuse('flowchart_id_conflict');
  const quoted = flowchartQuote(title);
  if (quoted === null) return flowchartRefuse('edit_label');
  if (!Array.isArray(members)) return flowchartRefuse('edit_target');
  const ungrouped = members.length ? moveFlowchartBoxes(source, members, null) : {ok:true, source, splices:[]};
  if (!ungrouped.ok) return ungrouped;
  const eol = flowchartEol(source), at = source.length;
  const inserted = (ungrouped.source.endsWith(eol) ? '' : eol) + 'subgraph ' + id + '[' + quoted + ']' + eol +
    members.map(member => '    ' + member).join(eol) + eol + 'end' + eol;
  return flowchartAdmit(source, ungrouped.source + inserted, {id, splices: [...ungrouped.splices, {pos: at, removed: '', inserted}]});
}
