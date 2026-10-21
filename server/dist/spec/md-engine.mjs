// SPDX-License-Identifier: MIT

const NEWLINES = /\r\n?/g, NULLS = /\0/g;

function lineScanner(Base, Token) {
  function StateBlock(src, md, env, tokens) {
    this.bMarks = []; this.eMarks = []; this.tShift = []; this.sCount = []; this.bsCount = [];
    this.blkIndent = 0; this.line = 0; this.lineMax = 0; this.tight = false; this.listIndent = -1;
    this.parentType = 'root'; this.level = 0; this.Token = Token;
    this.src = src; this.md = md; this.env = env; this.tokens = tokens;
    const length = src.length;
    for (let start = 0; start < length;) {
      let at = start, indent = 0, offset = 0;
      for (; at < length; at++) {
        const code = src.charCodeAt(at);
        if (code === 0x20) offset++;
        else if (code === 0x09) offset += 4 - offset % 4;
        else break;
        indent++;
      }
      if (at === length) break;
      let end = src.indexOf('\n', at);
      if (end < 0) end = length;
      this.bMarks.push(start); this.eMarks.push(end); this.tShift.push(indent); this.sCount.push(offset); this.bsCount.push(0);
      start = end + 1;
    }
    this.bMarks.push(length); this.eMarks.push(length); this.tShift.push(0); this.sCount.push(0); this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1;
  }
  StateBlock.prototype = Base.prototype;
  return StateBlock;
}

function backticks(state, silent) {
  const start = state.pos, src = state.src;
  if (src.charCodeAt(start) !== 0x60) return false;
  const max = state.posMax;
  let pos = start + 1;
  while (pos < max && src.charCodeAt(pos) === 0x60) pos++;
  const marker = src.slice(start, pos), length = marker.length, runs = state.backticks;
  const scanned = state.backticksScanned;
  if (!scanned || pos < scanned || (runs[length] ?? -1) >= pos) {
    let matchStart, matchEnd = pos;
    while ((matchStart = src.indexOf('`', matchEnd)) !== -1 && matchStart < max) {
      matchEnd = matchStart + 1;
      while (src.charCodeAt(matchEnd) === 0x60) matchEnd++;
      if (matchEnd > max) break;
      const run = matchEnd - matchStart;
      if (run === length) {
        if (!silent) {
          const token = state.push('code_inline', 'code', 0);
          token.markup = marker;
          let content = src.slice(pos, matchStart).replace(/\n/g, ' ');
          if (content.startsWith(' ') && content.endsWith(' ') && /[^ ]/.test(content)) content = content.slice(1, -1);
          token.content = content;
        }
        state.pos = matchEnd;
        return true;
      }
      if (!(runs[run] >= matchStart)) runs[run] = matchStart;
    }
    if (matchStart === -1 && (!scanned || pos < scanned)) state.backticksScanned = pos;
  }
  if (!silent) state.pending += marker;
  state.pos = pos;
  return true;
}

const CLEAN_WEB_LINK = /^https?:\/\/([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*)(?:\/[A-Za-z0-9\-._~/]*)?$/;
function cleanWebLink(url) {
  const match = CLEAN_WEB_LINK.exec(url);
  return match !== null && match[1].length <= 255;
}

export function tuneMarkdownEngine(md) {
  if (md.__rapierEngineTuned) return md;
  md.__rapierEngineTuned = true;
  md.core.ruler.at('normalize', state => {
    let src = state.src;
    if (src.indexOf('\r') >= 0) src = src.replace(NEWLINES, '\n');
    if (src.indexOf('\0') >= 0) src = src.replace(NULLS, '�');
    state.src = src;
  });
  const BaseBlock = md.block.State;
  md.block.State = lineScanner(BaseBlock, new BaseBlock('', md, {}, []).Token);
  md.inline.ruler.at('backticks', backticks);
  const normalizeLink = md.normalizeLink;
  md.normalizeLink = url => cleanWebLink(url) ? url : normalizeLink.call(md, url);
  return md;
}
