// SPDX-License-Identifier: MIT
import {blockWindows} from '../spec/md-assets.mjs';

export async function parseMarkdownWork(parser, source, env, work, blocksOnly = false) {
  const state = new parser.core.State(source, parser, env);
  for (const rule of parser.core.ruler.__rules__) {
    if (!rule.enabled) continue;
    work.signal?.throwIfAborted();
    if (blocksOnly && rule.name === 'inline') break;
    if (rule.name === 'block' && !state.inlineMode) {
      for (const window of blockWindows(state.src, 0, parser, env, true)) {
        for (const token of window.tokens) {
          if (token.map && window.firstLine) token.map = token.map.map(line => line + window.firstLine);
          state.tokens.push(token);
        }
        await work.yield();
      }
    } else if (rule.name === 'inline') {
      const tokens = state.tokens;
      let start = 0, size = 0;
      for (let at = 0; at < tokens.length; at++) {
        size += tokens[at].content?.length || 0;
        if (at + 1 < tokens.length && at - start < 63 && size < 16384) continue;
        state.tokens = tokens.slice(start, at + 1);
        try { rule.fn(state); } finally { state.tokens = tokens; }
        start = at + 1; size = 0;
        await work.yield();
      }
    } else {
      rule.fn(state);
      await work.yield();
    }
  }
  work.signal?.throwIfAborted();
  return state.tokens;
}
