// SPDX-License-Identifier: MIT

const NEWLINES = /\r\n?/g, NULLS = /\0/g;

const BLOCK_STARTER = new Uint8Array(128);
for (const c of [35, 36, 42, 43, 45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 60, 62, 91, 92, 95, 96, 126]) BLOCK_STARTER[c] = 1;

const INLINE_TERM = new Uint8Array(128);
for (const c of [10, 33, 36, 38, 42, 43, 58, 60, 61, 91, 92, 93, 94, 95, 96, 126]) INLINE_TERM[c] = 1;

const LABEL_SPECIAL = new Uint8Array(128);
for (const c of [10, 33, 36, 60, 91, 92, 93, 94, 96]) LABEL_SPECIAL[c] = 1;

const ASCII_PUNCT = new Uint8Array(128);
for (const c of [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 58, 59, 60, 61, 62, 63, 64, 91, 92, 93, 94, 95, 96, 123, 124, 125, 126]) ASCII_PUNCT[c] = 1;

const RULE_STARTERS = {
  text: null,
  linkify: [58],
  newline: [10],
  rapier_semantic_probe: [33, 91],
  temml_math_block: [36, 92],
  escape: [92],
  backticks: [96],
  strikethrough: [126],
  mark: [61],
  ins: [43],
  emphasis: [42, 95],
  sup: [94],
  link: [91],
  rapier_wiki: [33, 91],
  image: [33],
  footnote_inline: [94],
  footnote_ref: [91],
  autolink: [60],
  html_inline: [60],
  entity: [38]
};

function isAsciiTrimmable(c) {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

function asciiTrim(str) {
  const len = str.length;
  if (len === 0) return '';
  const first = str.charCodeAt(0), last = str.charCodeAt(len - 1);
  if (!isAsciiTrimmable(first) && !isAsciiTrimmable(last)) return str;
  let start = 0;
  while (start < len && isAsciiTrimmable(str.charCodeAt(start))) start++;
  let end = len - 1;
  while (end >= start && isAsciiTrimmable(str.charCodeAt(end))) end--;
  return str.slice(start, end + 1);
}

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
      let end = src.charCodeAt(at) === 0x0a ? at : src.indexOf('\n', at + 1);
      if (end < 0) end = length;
      this.bMarks.push(start); this.eMarks.push(end); this.tShift.push(indent); this.sCount.push(offset); this.bsCount.push(0);
      start = end + 1;
    }
    this.bMarks.push(length); this.eMarks.push(length); this.tShift.push(0); this.sCount.push(0); this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1;
  }
  StateBlock.prototype = Base.prototype;
  Base.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
    if (begin >= end) return '';
    const src = this.src, bMarks = this.bMarks, eMarks = this.eMarks, tShift = this.tShift, bsCount = this.bsCount;
    if (begin + 1 === end) {
      const lineStart = bMarks[begin], last = keepLastLF ? eMarks[begin] + 1 : eMarks[begin];
      if (indent === 0) return src.slice(lineStart, last);
      const shift = tShift[begin];
      if (shift === 0) return src.slice(lineStart, last);
      let lineIndent = 0, first = lineStart;
      const bs = bsCount[begin];
      while (first < last && lineIndent < indent) {
        const ch = src.charCodeAt(first);
        if (ch === 0x20) lineIndent++;
        else if (ch === 0x09) lineIndent += 4 - (lineIndent + bs) % 4;
        else if (first - lineStart < shift) lineIndent++;
        else break;
        first++;
      }
      if (lineIndent > indent) return ' '.repeat(lineIndent - indent) + src.slice(first, last);
      return src.slice(first, last);
    }
    const queue = new Array(end - begin);
    for (let i = 0, line = begin; line < end; line++, i++) {
      const lineStart = bMarks[line];
      const last = line + 1 < end || keepLastLF ? eMarks[line] + 1 : eMarks[line];
      if (indent === 0 || tShift[line] === 0 && bsCount[line] === 0 && src.charCodeAt(lineStart) !== 0x20 && src.charCodeAt(lineStart) !== 0x09) {
        queue[i] = src.slice(lineStart, last);
        continue;
      }
      let lineIndent = 0, first = lineStart;
      const shift = tShift[line], bs = bsCount[line];
      while (first < last && lineIndent < indent) {
        const ch = src.charCodeAt(first);
        if (ch === 0x20) lineIndent++;
        else if (ch === 0x09) lineIndent += 4 - (lineIndent + bs) % 4;
        else if (first - lineStart < shift) lineIndent++;
        else break;
        first++;
      }
      queue[i] = lineIndent > indent ? ' '.repeat(lineIndent - indent) + src.slice(first, last) : src.slice(first, last);
    }
    return queue.join('');
  };
  return StateBlock;
}

function lineCanTerminateParagraph(state, nextLine, endLine) {
  const pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) return false;
  const ch = state.src.charCodeAt(pos);
  if (ch < 128 && BLOCK_STARTER[ch] === 1) return true;
  const n2 = nextLine + 1;
  if (n2 < endLine) {
    const p2 = state.bMarks[n2] + state.tShift[n2];
    if (p2 < state.eMarks[n2]) {
      const c2 = state.src.charCodeAt(p2);
      if (c2 === 0x7c || c2 === 0x2d || c2 === 0x3a) return true;
    }
  }
  return false;
}

function lheading(state, startLine, endLine) {
  const blkIndent = state.blkIndent;
  if (state.sCount[startLine] - blkIndent >= 4) return false;
  let nextLine = startLine + 1;
  if (nextLine >= endLine || state.isEmpty(nextLine)) {
    state._pLine = startLine;
    state._pEnd = endLine;
    state._pNext = nextLine;
    return false;
  }
  const terminatorRules = state.md.block.ruler.getRules('paragraph'), len = terminatorRules.length;
  const oldParentType = state.parentType;
  state.parentType = 'paragraph';
  const src = state.src, bMarks = state.bMarks, eMarks = state.eMarks, tShift = state.tShift, sCount = state.sCount;
  let level = 0, marker = 0;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    const sc = sCount[nextLine];
    if (sc - blkIndent > 3) continue;
    if (sc >= blkIndent) {
      let pos = bMarks[nextLine] + tShift[nextLine];
      const max = eMarks[nextLine];
      if (pos < max) {
        marker = src.charCodeAt(pos);
        if (marker === 0x2d || marker === 0x3d) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);
          if (pos >= max) {
            level = marker === 0x3d ? 1 : 2;
            break;
          }
        }
      }
    }
    if (sc < 0) continue;
    if (!lineCanTerminateParagraph(state, nextLine, endLine)) continue;
    let terminate = false;
    for (let i = 0; i < len; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) break;
  }
  if (!level) {
    state.parentType = oldParentType;
    state._pLine = startLine;
    state._pEnd = endLine;
    state._pNext = nextLine;
    return false;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, blkIndent, false));
  state.line = nextLine + 1;
  const token_o = state.push('heading_open', `h${level}`, 1);
  token_o.markup = marker === 0x3d ? '=' : '-';
  token_o.map = [startLine, state.line];
  const token_i = state.push('inline', '', 0);
  token_i.content = content;
  token_i.map = [startLine, state.line - 1];
  token_i.children = [];
  const token_c = state.push('heading_close', `h${level}`, -1);
  token_c.markup = marker === 0x3d ? '=' : '-';
  state.parentType = oldParentType;
  return true;
}

function paragraph(state, startLine, endLine) {
  let nextLine = startLine + 1;
  if (state._pLine === startLine && state._pEnd === endLine) {
    nextLine = state._pNext;
  } else if (nextLine < endLine && !state.isEmpty(nextLine)) {
    const terminatorRules = state.md.block.ruler.getRules('paragraph'), len = terminatorRules.length;
    const oldParentType = state.parentType, blkIndent = state.blkIndent, sCount = state.sCount;
    state.parentType = 'paragraph';
    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      const sc = sCount[nextLine];
      if (sc - blkIndent > 3 || sc < 0) continue;
      if (!lineCanTerminateParagraph(state, nextLine, endLine)) continue;
      let terminate = false;
      for (let i = 0; i < len; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) break;
    }
    state.parentType = oldParentType;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
  state.line = nextLine;
  const token_o = state.push('paragraph_open', 'p', 1);
  token_o.map = [startLine, nextLine];
  const token_i = state.push('inline', '', 0);
  token_i.content = content;
  token_i.map = [startLine, nextLine];
  token_i.children = [];
  state.push('paragraph_close', 'p', -1);
  return true;
}

function textRule(state, silent) {
  let pos = state.pos;
  const src = state.src, max = state.posMax;
  while (pos < max) {
    const ch = src.charCodeAt(pos);
    if (ch < 128 && INLINE_TERM[ch] === 1) break;
    pos++;
  }
  if (pos === state.pos) return false;
  if (!silent) state.pending += src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}

function compileInlineDispatch(ruler) {
  const rules = ruler.getRules('');
  if (ruler._compiledRules === rules && ruler._dispatchTable) return ruler._dispatchTable;
  const entries = ruler.__rules__;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.enabled) continue;
    if (!(entry.name in RULE_STARTERS)) {
      ruler._compiledRules = rules;
      ruler._dispatchTable = null;
      return null;
    }
  }
  const table = new Array(128);
  for (let c = 0; c < 128; c++) table[c] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.enabled) continue;
    const starters = RULE_STARTERS[entry.name];
    if (starters === null) {
      for (let c = 0; c < 128; c++) {
        if (INLINE_TERM[c] === 0) table[c].push(entry.fn);
      }
    } else {
      for (let j = 0; j < starters.length; j++) table[starters[j]].push(entry.fn);
    }
  }
  ruler._compiledRules = rules;
  ruler._dispatchTable = table;
  return table;
}

function tuneInlineTokenizer(md) {
  const inline = md.inline;
  inline.tokenize = function tokenize(state) {
    const rules = this.ruler.getRules('');
    const end = state.posMax;
    const maxNesting = state.md.options.maxNesting;
    const src = state.src;
    const table = this.ruler.__cache__?.[''] === rules ? compileInlineDispatch(this.ruler) : null;
    if (table) {
      while (state.pos < end) {
        const prevPos = state.pos;
        const ch = src.charCodeAt(prevPos);
        if (ch >= 128 || INLINE_TERM[ch] === 0) {
          let pos = prevPos + 1;
          while (pos < end) {
            const c = src.charCodeAt(pos);
            if (c < 128 && INLINE_TERM[c] === 1) break;
            pos++;
          }
          state.pending += src.slice(prevPos, pos);
          state.pos = pos;
          if (pos >= end) break;
          continue;
        }
        let ok = false;
        if (state.level < maxNesting) {
          const bucket = table[ch], bLen = bucket.length;
          for (let i = 0; i < bLen; i++) {
            ok = bucket[i](state, false);
            if (ok) {
              if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
              break;
            }
          }
        }
        if (ok) {
          if (state.pos >= end) break;
          continue;
        }
        state.pending += src[state.pos++];
      }
      if (state.pending) state.pushPending();
      return;
    }
    const len = rules.length;
    while (state.pos < end) {
      const prevPos = state.pos;
      let ok = false;
      if (state.level < maxNesting) {
        for (let i = 0; i < len; i++) {
          ok = rules[i](state, false);
          if (ok) {
            if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
            break;
          }
        }
      }
      if (ok) {
        if (state.pos >= end) break;
        continue;
      }
      state.pending += src[state.pos++];
    }
    if (state.pending) state.pushPending();
  };

  inline.skipToken = function skipToken(state) {
    const pos = state.pos;
    const cache = state.cache;
    if (cache[pos] !== undefined) {
      state.pos = cache[pos];
      return;
    }
    const rules = this.ruler.getRules('');
    const maxNesting = state.md.options.maxNesting;
    let ok = false;
    if (state.level < maxNesting) {
      const table = this.ruler.__cache__?.[''] === rules ? compileInlineDispatch(this.ruler) : null;
      if (table) {
        const ch = state.src.charCodeAt(pos);
        if (ch >= 128 || INLINE_TERM[ch] === 0) {
          let end = pos + 1;
          const max = state.posMax, src = state.src;
          while (end < max) {
            const c = src.charCodeAt(end);
            if (c < 128 && INLINE_TERM[c] === 1) break;
            end++;
          }
          state.pos = end;
          cache[pos] = end;
          return;
        }
        const bucket = table[ch], bLen = bucket.length;
        for (let i = 0; i < bLen; i++) {
          state.level++;
          ok = bucket[i](state, true);
          state.level--;
          if (ok) {
            if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
            break;
          }
        }
      } else {
        const len = rules.length;
        for (let i = 0; i < len; i++) {
          state.level++;
          ok = rules[i](state, true);
          state.level--;
          if (ok) {
            if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
            break;
          }
        }
      }
    } else {
      state.pos = state.posMax;
    }
    if (!ok) state.pos++;
    cache[pos] = state.pos;
  };
}

function fastParseLinkLabel(state, start, disableNested) {
  const max = state.posMax, src = state.src;
  if (state._labelPos === start && state._labelMax === max) {
    if (disableNested && state._labelNested) return -1;
    return state._labelEnd;
  }
  let pos = start + 1;
  let simple = true;
  while (pos < max) {
    const ch = src.charCodeAt(pos);
    if (ch === 0x5d) {
      state._labelPos = start;
      state._labelMax = max;
      state._labelEnd = pos;
      state._labelNested = false;
      return pos;
    }
    if (ch < 128 && LABEL_SPECIAL[ch] === 1) {
      simple = false;
      break;
    }
    pos++;
  }
  if (simple) {
    state._labelPos = start;
    state._labelMax = max;
    state._labelEnd = -1;
    state._labelNested = false;
    return -1;
  }
  const oldPos = state.pos;
  state.pos = start + 1;
  let level = 1, found = false, hasNested = false;
  while (state.pos < max) {
    const marker = src.charCodeAt(state.pos);
    if (marker === 0x5d) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    const prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 0x5b) {
      if (prevPos === state.pos - 1) {
        level++;
      } else {
        hasNested = true;
        if (disableNested) {
          state.pos = oldPos;
          state._labelPos = start;
          state._labelMax = max;
          state._labelEnd = -2;
          state._labelNested = true;
          return -1;
        }
      }
    }
  }
  const labelEnd = found ? state.pos : -1;
  state.pos = oldPos;
  if (state._labelPos !== start || state._labelMax !== max || state._labelEnd !== -2) {
    state._labelPos = start;
    state._labelMax = max;
    state._labelEnd = labelEnd;
    state._labelNested = hasNested;
  }
  return disableNested && hasNested ? -1 : labelEnd;
}

const DELIM_RESULT = {can_open: false, can_close: false, length: 0};

function tuneScanDelims(md) {
  const isPunctCharCode = md.utils.isPunctCharCode;
  const isWhiteSpace = md.utils.isWhiteSpace;
  md.inline.State.prototype.scanDelims = function scanDelims(start, canSplitWord) {
    const max = this.posMax, src = this.src;
    const marker = src.charCodeAt(start);
    let lastChar;
    if (start === 0) {
      lastChar = 0x20;
    } else if (start === 1) {
      lastChar = src.charCodeAt(0);
      if ((lastChar & 0xf800) === 0xd800) lastChar = 0xfffd;
    } else {
      lastChar = src.charCodeAt(start - 1);
      if ((lastChar & 0xfc00) === 0xdc00) {
        const highSurr = src.charCodeAt(start - 2);
        lastChar = (highSurr & 0xfc00) === 0xd800 ? 0x10000 + ((highSurr - 0xd800) << 10) + (lastChar - 0xdc00) : 0xfffd;
      } else if ((lastChar & 0xfc00) === 0xd800) {
        lastChar = 0xfffd;
      }
    }
    let pos = start + 1;
    while (pos < max && src.charCodeAt(pos) === marker) pos++;
    const count = pos - start;
    let nextChar = pos < max ? src.charCodeAt(pos) : 0x20;
    if ((nextChar & 0xfc00) === 0xd800) {
      const lowSurr = src.charCodeAt(pos + 1);
      nextChar = (lowSurr & 0xfc00) === 0xdc00 ? 0x10000 + ((nextChar - 0xd800) << 10) + (lowSurr - 0xdc00) : 0xfffd;
    } else if ((nextChar & 0xfc00) === 0xdc00) {
      nextChar = 0xfffd;
    }
    const isLastWhiteSpace = lastChar < 128 ? (lastChar === 0x20 || (lastChar >= 0x09 && lastChar <= 0x0d)) : isWhiteSpace(lastChar);
    const isNextWhiteSpace = nextChar < 128 ? (nextChar === 0x20 || (nextChar >= 0x09 && nextChar <= 0x0d)) : isWhiteSpace(nextChar);
    const isLastPunctChar = !isLastWhiteSpace && (lastChar < 128 ? ASCII_PUNCT[lastChar] === 1 : isPunctCharCode(lastChar));
    const isNextPunctChar = !isNextWhiteSpace && (nextChar < 128 ? ASCII_PUNCT[nextChar] === 1 : isPunctCharCode(nextChar));
    const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
    DELIM_RESULT.can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar);
    DELIM_RESULT.can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar);
    DELIM_RESULT.length = count;
    return DELIM_RESULT;
  };
}

function fragmentsJoin(state) {
  const tokens = state.tokens, max = tokens.length;
  if (max === 0) return;
  let level = 0, last = 0;
  for (let curr = 0; curr < max; curr++) {
    const tok = tokens[curr], nesting = tok.nesting;
    if (nesting < 0) level--;
    tok.level = level;
    if (nesting > 0) level++;
    if (tok.type === 'text' && curr + 1 < max && tokens[curr + 1].type === 'text') {
      tokens[curr + 1].content = tok.content + tokens[curr + 1].content;
    } else {
      if (curr !== last) tokens[last] = tok;
      last++;
    }
  }
  if (last !== max) tokens.length = last;
}

function joinAlt(tokens) {
  const max = tokens.length;
  if (max === 0) return;
  let last = 0;
  for (let curr = 0; curr < max; curr++) {
    const tok = tokens[curr];
    if (tok.type === 'text_special') tok.type = 'text';
  }
  for (let curr = 0; curr < max; curr++) {
    const tok = tokens[curr];
    if (tok.type === 'text' && curr + 1 < max && tokens[curr + 1].type === 'text') {
      tokens[curr + 1].content = tok.content + tokens[curr + 1].content;
    } else {
      if (curr !== last) tokens[last] = tok;
      last++;
    }
  }
  if (last !== max) tokens.length = last;
}

function textJoin(state) {
  const blockTokens = state.tokens, l = blockTokens.length;
  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== 'inline') continue;
    const tokens = blockTokens[j].children, max = tokens.length;
    if (max === 0) continue;
    let hasSpecialOrMerge = false;
    for (let curr = 0; curr < max; curr++) {
      const tok = tokens[curr];
      if (tok.type === 'text_special') {
        tok.type = 'text';
        hasSpecialOrMerge = true;
      }
      if (tok.children) joinAlt(tok.children);
      if (!hasSpecialOrMerge && tok.type === 'text' && curr + 1 < max && (tokens[curr + 1].type === 'text' || tokens[curr + 1].type === 'text_special')) {
        hasSpecialOrMerge = true;
      }
    }
    if (!hasSpecialOrMerge) continue;
    let last = 0;
    for (let curr = 0; curr < max; curr++) {
      const tok = tokens[curr];
      if (tok.type === 'text' && curr + 1 < max && tokens[curr + 1].type === 'text') {
        tokens[curr + 1].content = tok.content + tokens[curr + 1].content;
      } else {
        if (curr !== last) tokens[last] = tok;
        last++;
      }
    }
    if (last !== max) tokens.length = last;
  }
}

function backticks(state, silent) {
  const start = state.pos, src = state.src;
  if (src.charCodeAt(start) !== 0x60) return false;
  const max = state.posMax;
  let pos = start + 1;
  while (pos < max && src.charCodeAt(pos) === 0x60) pos++;
  const marker = pos - start === 1 ? '`' : src.slice(start, pos), length = marker.length, runs = state.backticks;
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
          let content = src.slice(pos, matchStart);
          if (content.indexOf('\n') >= 0) content = content.replace(/\n/g, ' ');
          if (content.length >= 2 && content.charCodeAt(0) === 0x20 && content.charCodeAt(content.length - 1) === 0x20 && /[^ ]/.test(content)) {
            content = content.slice(1, -1);
          }
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

function releaseCoreState(state) {
  state.src = '';
  state.env = {};
  state.tokens = [];
  return state;
}

function releaseBlockState(state) {
  state.src = '';
  state.env = {};
  state.tokens = [];
  state.bMarks = [];
  state.eMarks = [];
  state.tShift = [];
  state.sCount = [];
  state.bsCount = [];
  return state;
}

function releaseInlineState(state) {
  state.src = '';
  state.env = {};
  state.tokens = [];
  state.tokens_meta = [];
  state.pending = '';
  state.delimiters = [];
  state._prev_delimiters = [];
  state.backticks = {};
  return state;
}

function detachTokenSample(token) {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token);
  copy.content = '';
  copy.markup = '';
  copy.info = '';
  copy.children = token.children ? [] : null;
  copy.meta = token.meta ? {} : null;
  copy.attrs = token.attrs ? [] : null;
  return copy;
}

function sampleTokensOnce(kept, tokens) {
  const limit = Math.min(tokens.length, 256);
  for (let index = 0; index < limit; index++) {
    const token = tokens[index];
    if (!kept.has(token.type)) kept.set(token.type, detachTokenSample(token));
    const children = token.children;
    if (children) for (let at = 0; at < children.length; at++) {
      const child = children[at];
      if (!kept.has(child.type)) kept.set(child.type, detachTokenSample(child));
    }
  }
}

function hasAnyDelimiters(state) {
  if (state.delimiters.length > 0) return true;
  const meta = state.tokens_meta, len = meta.length;
  for (let i = 0; i < len; i++) {
    const m = meta[i];
    if (m && m.delimiters && m.delimiters.length > 0) return true;
  }
  return false;
}

function keepClasses(md) {
  const anchors = {core: null, block: null, inline: null, tokens: new Map()};
  const finish = (state, tokens) => {
    anchors.core = releaseCoreState(state);
    if (anchors.block) releaseBlockState(anchors.block);
    if (anchors.inline) releaseInlineState(anchors.inline);
    if (anchors.tokens.size < 24 && tokens.length > 0) sampleTokensOnce(anchors.tokens, tokens);
  };
  const release = (owner, key) => Object.getPrototypeOf(owner)[key] === owner[key];
  if (release(md, 'parse') && release(md, 'parseInline')) {
    md.parse = function (src, env) {
      if (typeof src !== 'string') throw new Error('Input data should be a String');
      const state = new this.core.State(src, this, env);
      this.core.process(state);
      const tokens = state.tokens;
      finish(state, tokens);
      return tokens;
    };
    md.parseInline = function (src, env) {
      const state = new this.core.State(src, this, env);
      state.inlineMode = true;
      this.core.process(state);
      const tokens = state.tokens;
      finish(state, tokens);
      return tokens;
    };
  }
  if (release(md.block, 'parse')) md.block.parse = function (src, md, env, outTokens) {
    if (!src) return;
    const state = new this.State(src, md, env, outTokens);
    this.tokenize(state, state.line, state.lineMax);
    anchors.block = state;
  };
  if (release(md.inline, 'parse')) md.inline.parse = function (str, md, env, outTokens) {
    const state = new this.State(str, md, env, outTokens);
    this.tokenize(state);
    if (hasAnyDelimiters(state)) {
      const rules = this.ruler2.getRules(''), length = rules.length;
      for (let index = 0; index < length; index++) rules[index](state);
    } else {
      fragmentsJoin(state);
    }
    anchors.inline = state;
  };
}

export function tuneMarkdownEngine(md) {
  if (md.__rapierEngineTuned) return md;
  md.__rapierEngineTuned = true;
  md.core.ruler.at('normalize', state => {
    let src = state.src;
    if (src.indexOf('\r') >= 0) src = src.replace(NEWLINES, '\n');
    if (src.indexOf('\0') >= 0) src = src.replace(NULLS, '\ufffd');
    state.src = src;
  });
  md.core.ruler.at('text_join', textJoin);
  const BaseBlock = md.block.State;
  md.block.State = lineScanner(BaseBlock, new BaseBlock('', md, {}, []).Token);
  md.block.ruler.at('lheading', lheading);
  md.block.ruler.at('paragraph', paragraph);
  md.inline.ruler.at('text', textRule);
  md.inline.ruler.at('backticks', backticks);
  md.inline.ruler2.at('fragments_join', fragmentsJoin);
  md.helpers.parseLinkLabel = fastParseLinkLabel;
  tuneScanDelims(md);
  tuneInlineTokenizer(md);
  const normalizeLink = md.normalizeLink;
  md.normalizeLink = url => cleanWebLink(url) ? url : normalizeLink.call(md, url);
  keepClasses(md);
  return md;
}
