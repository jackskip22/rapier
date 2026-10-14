// SPDX-License-Identifier: MIT
// Original neutral adapter. The host owns Markdown structure and normalization.
import {createMathMatcher} from './delimiters.mjs';

export function installMathRules(md, {singleDollar = false, brackets = true, ruleName = 'rapier_math', inLink = false} = {}) {
  // The host's image-alt renderer ignores unknown token types. Keep math as
  // literal source in text-only output, while leaving escaping to that host.
  const renderText = md.renderer.renderInlineAsText;
  md.renderer.renderInlineAsText = function(tokens, options, env) {
    return renderText.call(this, tokens.map(token =>
      token.type === 'math_inline' || token.type === 'math_block'
        ? {...token, type: 'text', content: token.meta?.mathSource ?? token.content}
        : token), options, env);
  };
  const matchers = new WeakMap();
  function match(state, at, limit) {
    let entry = matchers.get(state);
    if (!entry || entry.source !== state.src) {
      entry = {source: state.src, match: createMathMatcher(state.src, {singleDollar, brackets})};
      matchers.set(state, entry);
    }
    return entry.match(at, limit);
  }
  md.inline.ruler.before('escape', ruleName, (state, silent) => {
    if (!inLink && state.linkLevel > 0) return false;
    if (state.src[state.pos] !== '$' && state.src[state.pos] !== '\\') return false;
    const span = match(state, state.pos, state.posMax);
    if (!span) return false;
    if (!silent) {
      const token = state.push(span.displayMode ? 'math_block' : 'math_inline', '', 0);
      token.markup = span.open;
      token.content = state.src.slice(span.bodyStart, span.bodyEnd);
      token.meta = {mathSource: state.src.slice(span.start, span.end)};
    }
    state.pos = span.end;
    return true;
  });
  md.block.ruler.before('fence', ruleName, (state, startLine, endLine, silent) => {
    // An indented code block belongs to the host even when it begins with dollars.
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(start, start + 2) !== '$$' && (!brackets || state.src.slice(start, start + 2) !== '\\[')) return false;
    const span = match(state, start, state.eMarks[endLine - 1]);
    if (!span?.displayMode) return false;
    let last = startLine;
    while (last < endLine && state.eMarks[last] < span.end) last++;
    if (last >= endLine || span.bodyEnd < state.bMarks[last] + state.tShift[last] ||
        state.src.slice(span.end, state.eMarks[last]).trim()) return false;
    if (silent) return true;
    const parts = [];
    for (let line = startLine; line <= last; line++) {
      const from = line === startLine ? span.bodyStart : state.bMarks[line] + state.tShift[line];
      const to = line === last ? span.bodyEnd : state.eMarks[line];
      parts.push(state.src.slice(from, to));
    }
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.markup = span.open;
    token.content = parts.join('\n');
    token.meta = {mathSource: span.open + token.content + span.close};
    token.map = [startLine, last + 1];
    state.line = last + 1;
    return true;
  }, {alt: ['paragraph', 'reference', 'blockquote', 'list']});
}
