// SPDX-License-Identifier: MIT
// Public Mermaid syntax only. Successful values contain text and graph facts, never markup or source offsets.
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
  flowchart_color: 'Use a supported colour name or #rgb or #rrggbb.',
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

function flowchartLabel(value) {
  if (value.length > FLOWCHART_LIMITS.labelChars) flowchartFail('flowchart_label_limit');
  if (!value.trim()) flowchartFail('flowchart_empty_label');
  // HTML and Mermaid entity spellings are refused, while an ordinary ampersand remains ordinary text.
  if (/[<>\x00-\x1f\x7f-\x9f\ud800-\udfff\ufffe\uffff]/u.test(value) ||
      /&(?:#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*;)|&(?:amp|lt|gt|quot|apos)(?:;|(?=[^A-Za-z0-9]|$))|#[A-Za-z0-9]+;/i.test(value) ||
      /(?:https?|ftp|file|javascript|vbscript|data|blob|mailto|tel):|\/\/|\bwww\./i.test(value)) flowchartFail('flowchart_unsafe_label');
  return value;
}

function flowchartDelimited(cursor, close, shape) {
  flowchartSpace(cursor);
  const at = cursor.p;
  let value;
  if (cursor.s[cursor.p] === '"') {
    const start = ++cursor.p, end = cursor.s.indexOf('"', start);
    if (end < 0) flowchartFail('flowchart_syntax');
    value = cursor.s.slice(start, end);
    if (value.startsWith('`') && value.endsWith('`')) flowchartFail('flowchart_syntax');
    cursor.p = end + 1;
    flowchartSpace(cursor);
    if (!cursor.s.startsWith(close, cursor.p)) flowchartFail('flowchart_syntax');
  } else {
    const end = cursor.s.indexOf(close, cursor.p);
    if (end < 0) flowchartFail('flowchart_syntax');
    value = cursor.s.slice(cursor.p, end).trim();
    if (/[\[\](){}"`|]/.test(value) || shape === 'rect' && (/^[\/\\]/.test(value) || /[\/\\]$/.test(value))) flowchartFail('flowchart_syntax');
    cursor.p = end;
  }
  cursor.labelSpan = {start: cursor.base + at, end: cursor.base + cursor.p};
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
  let spec = FLOWCHART_EDGES.find(([token]) => cursor.s.startsWith(token, cursor.p)), label;
  if (spec) {
    cursor.p += spec[0].length;
    flowchartSpace(cursor);
    if (cursor.s[cursor.p] === '|') { cursor.p++; label = flowchartDelimited(cursor, '|'); }
  } else {
    const dotted = cursor.s.startsWith('-.', cursor.p);
    if (!dotted && !cursor.s.startsWith('--', cursor.p)) flowchartFail('flowchart_syntax');
    cursor.p += 2;
    label = flowchartDelimited(cursor, dotted ? '.->' : '-->');
    spec = ['', false, true, dotted, false];
  }
  const [, headStart, headEnd, dash, thick] = spec;
  return {kind: headStart || headEnd ? 'arrow' : 'line', headStart, headEnd, dash, thick, ...(label === undefined ? {} : {label})};
}

export function parseFlowchart(source, sourceLabels = null) {
  try {
    if (typeof source !== 'string') flowchartFail('flowchart_source');
    if (source.length > FLOWCHART_LIMITS.sourceChars) flowchartFail('flowchart_source_limit');
    const statements = flowchartStatements(source), header = statements.shift()?.text.split(/[ \t]+/);
    if (!header || !['flowchart', 'graph'].includes(header[0])) flowchartFail('flowchart_header');
    if (header.length > 2) flowchartFail('flowchart_syntax');
    if (header[1] && !['TD', 'TB', 'BT', 'LR', 'RL'].includes(header[1])) flowchartFail('flowchart_direction');
    const direction = !header[1] || header[1] === 'TB' ? 'TD' : header[1];
    const nodes = new Map(), edges = [], groups = new Map(), membership = new Map(), classes = new Map(), assignments = new Map(), styles = new Map();
    const labels = sourceLabels && {nodes: new Map(), edges: new Map(), groups: new Map()};
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
      const id = flowchartId(cursor, true);
      const idEnd = cursor.base + cursor.p;
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
        cursor.p += shape[0].length;
        const label = flowchartDelimited(cursor, shape[1], shape[2]);
        textChars += label.length - value.label.length;
        value.label = label; value.shape = shape[2];
        labels?.nodes.set(id, cursor.labelSpan);
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
        flowchartSpace(cursor);
      }
      return id;
    };
    const endpoints = cursor => {
      const ids = [readNode(cursor)];
      while (cursor.s[cursor.p] === '&') { cursor.p++; ids.push(readNode(cursor)); }
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
        group = {id, title, members: new Set()};
        groups.set(id, group); textChars += title.length; bounds();
      } else if (first === 'end') {
        if (statement !== 'end' || !group || !group.members.size) flowchartFail('flowchart_group');
        group = null;
      } else if (first === 'classDef' || first === 'class' || first === 'style') {
        cursor.p = first.length;
        flowchartGap(cursor);
        const ids = first === 'style' ? [flowchartId(cursor)] : flowchartIds(cursor);
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
        while (cursor.p < cursor.s.length) {
          const edge = flowchartEdge(cursor), labelSpan = cursor.labelSpan, to = endpoints(cursor);
          // Charge the expanded graph, including repeated edges and their copied labels, before any layout work.
          for (const a of from) for (const b of to) {
            const value = {from: a, to: b, ...edge};
            edges.push(value); if (labelSpan) labels?.edges.set(value, labelSpan);
            textChars += edge.label?.length || 0; bounds();
          }
          from = to;
        }
      }
    }
    if (group) flowchartFail('flowchart_group');
    if (!nodes.size) flowchartFail('flowchart_empty');
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
      edges: new Map(edges.map((edge, index) => [index, labels.edges.get(edge)]))});
    return {ok: true, graph: {direction, nodes: [...nodes.values()].sort((a, b) => flowchartCompare(a.id, b.id)), edges,
      groups: [...groups.values()].sort((a, b) => flowchartCompare(a.id, b.id)).map(({id, title, members}) => ({id, title, members: [...members].sort(flowchartCompare)}))}};
  } catch (error) {
    if (!error?.flowchart) throw error;
    return {ok: false, code: error.code, reason: FLOWCHART_REASONS[error.code]};
  }
}

// A visual label edit changes only its declaration, including the last of repeated declarations.
// The same parser supplies the range and admits the result; comments, style and graph syntax stay exact.
export function editFlowchartLabel(source, target, value) {
  const labels = {}, parsed = parseFlowchart(source, labels);
  if (!parsed.ok) return parsed;
  const span = labels[target?.kind + 's']?.get(target.id);
  if (!span || typeof value !== 'string' || value.includes('"') || /[\r\n]/.test(value))
    return {ok: false, reason: 'Use a single plain-text label without double quotes.'};
  const inserted = span.implicit ? '["' + value + '"]' : '"' + value + '"';
  const next = source.slice(0, span.start) + inserted + source.slice(span.end);
  const admitted = parseFlowchart(next);
  if (!admitted.ok) return admitted;
  return {ok: true, source: next, splice: {pos: span.start, removed: source.slice(span.start, span.end), inserted}};
}
