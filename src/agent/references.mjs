// Reference definitions can change unchanged prose. The document parser owns
// their grammar; only dependencies consumed by governed content are compared.
import {markdownParser, markdownBodyOffset} from '../images/assets.mjs';

function sameTokens(left, right, inline) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index], b = right[index];
    for (const key of ['type', 'tag', 'nesting', 'hidden', 'info']) if (a[key] !== b[key]) return false;
    if ((a.attrs || []).length !== (b.attrs || []).length ||
        (a.attrs || []).some(([name, value]) => value !== b.attrGet(name))) return false;
    if (a.type.startsWith('footnote_') && a.meta?.label !== b.meta?.label) return false;
    if (a.type === 'inline' && inline) {
      if (!inline(a, b)) return false;
    } else {
      if (a.type !== 'inline' && a.content !== b.content) return false;
      if (!sameTokens(a.children || [], b.children || [])) return false;
    }
  }
  return true;
}

function sameMap(left = {}, right = {}, equal = (a, b) => a === b) {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.hasOwn(right, key) && equal(left[key], right[key]));
}

function snapshot(source, parser, bodyOnly) {
  const offset = bodyOnly ? 0 : markdownBodyOffset(source), env = {}, tokens = [], starts = [offset], notes = Object.create(null);
  for (let at = offset; at < source.length; at++) {
    if (source[at] === '\r') { if (source[at + 1] === '\n') at++; starts.push(at + 1); }
    else if (source[at] === '\n') starts.push(at + 1);
  }
  const text = source.slice(offset).replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
  parser.block.parse(text, parser, env, tokens);
  // The footnote plugin keeps definition bodies in block tokens, last wins.
  const contexts = new WeakMap(), stack = [];
  let collecting = false, label, body;
  for (const token of tokens) {
    if (token.nesting < 0) stack.pop();
    if (token.type === 'inline') contexts.set(token, stack.slice());
    if (token.nesting > 0) stack.push(token);
    if (token.type === 'footnote_reference_open') { collecting = true; label = token.meta.label; body = []; }
    else if (token.type === 'footnote_reference_close') { collecting = false; notes[label] = body; }
    else if (collecting && token.type !== 'reference_definition') body.push(token);
  }
  return {env, tokens, starts, notes, contexts, text};
}

function interpret(token, value, frame, parser, core) {
  const env = {references: Object.assign(Object.create(null), value.env.references),
    abbreviations: value.env.abbreviations};
  if (value.env.footnotes) env.footnotes = {refs: {...value.env.footnotes.refs}};
  const state = new parser.core.State(frame.text, parser, env);
  const copy = row => Object.assign(new state.Token(row.type, row.tag, row.nesting), row, {
    attrs: row.attrs?.map(pair => pair.slice()) || null, meta: row.meta ? {...row.meta} : null, children: row.type === 'inline' ? [] : null,
  });
  const context = frame.contexts.get(token) || [];
  const start = context.findLastIndex(row => row.type === 'footnote_reference_open') + 1;
  state.tokens = context.slice(start).map(copy);
  state.tokens.push(copy(token));
  // Keep real block context: task-list core consumes checkbox text before
  // abbreviation replacement. Fresh note counters exclude unrelated numbering.
  for (const rule of core) rule(state);
  return {tokens: state.tokens, notes: env.footnotes?.list || []};
}

export function changedReferenceRegion(before, after, regions, factory, bodyOnly = false) {
  if (!regions.length || before === after || !before.includes(']:') && !after.includes(']:')) return null;
  const parser = markdownParser(factory), was = snapshot(before, parser, bodyOnly), now = snapshot(after, parser, bodyOnly);
  if (sameMap(was.env.references, now.env.references, (a, b) => a.href === b.href && a.title === b.title) &&
      sameMap(was.env.abbreviations, now.env.abbreviations) &&
      sameMap(was.notes, now.notes, (a, b) => sameTokens(a, b, (x, y) => x.content === y.content))) return null;
  const rules = parser.core.ruler.getRules('');
  const block = rules.indexOf(parser.core.ruler.__rules__.find(row => row.name === 'block')?.fn);
  if (block < 0) throw new Error('markdown_block_rule_unavailable');
  const core = rules.slice(block + 1);
  const seen = new Set();
  const sameInline = (left, right, leftFrame = was, rightFrame = now) => {
    const a = interpret(left, was, leftFrame, parser, core), b = interpret(right, now, rightFrame, parser, core);
    if (!sameTokens(a.tokens, b.tokens)) return false;
    for (const note of a.notes) {
      if (note.label == null || seen.has(note.label)) continue;
      seen.add(note.label);
      if (!sameTokens(was.notes[note.label] || [], now.notes[note.label] || [], sameInline)) return false;
    }
    return true;
  };
  let map = null;
  for (const token of was.tokens) {
    if (token.map) map = token.map;
    if (token.type !== 'inline' || !map) continue;
    const start = was.starts[map[0]], end = was.starts[map[1]] ?? before.length;
    const region = regions.find(row => row.start < end && start < row.end);
    if (region && !sameInline(token, token, was, was)) return region.index;
  }
  return null;
}
