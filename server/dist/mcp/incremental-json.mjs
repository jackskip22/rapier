import {JsonDepthGuard} from '../kit/json-depth.mjs';
export {JsonDepthGuard} from '../kit/json-depth.mjs';

const ARRAY_FIRST = 0, ARRAY_VALUE = 1, ARRAY_NEXT = 2;
const OBJECT_FIRST = 3, OBJECT_KEY = 4, OBJECT_COLON = 5, OBJECT_VALUE = 6, OBJECT_NEXT = 7;
const BLOCK_BYTES = 16384, BLOCK_DEPTH = BLOCK_BYTES * 2;
const STRING_PIECE = 16384, DECODE_BYTES = 65536, NUMBER_DIGITS = 1100;
const whitespace = code => code === 32 || code === 9 || code === 10 || code === 13;
const digit = code => code >= 48 && code <= 57;
const hex = code => code >= 48 && code <= 57 ? code - 48
  : code >= 65 && code <= 70 ? code - 55 : code >= 97 && code <= 102 ? code - 87 : -1;

export const JSON_STRING_LIMIT = Symbol('JSON string byte limit exceeded');
class Utf8StringLimit {
  constructor(limit) { this.limit = limit; this.bytes = 0; this.high = false; }
  append(text) {
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (this.high && code >= 0xdc00 && code <= 0xdfff) { this.bytes++; this.high = false; }
      else {
        this.high = code >= 0xd800 && code <= 0xdbff;
        this.bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      }
      if (this.bytes > this.limit) return false;
    }
    return true;
  }
}
export const jsonStringExceedsBytes = (value, limit) => typeof value === 'string' && !new Utf8StringLimit(limit).append(value);

class GrammarStack {
  constructor() { this.blocks = []; this.length = 0; }
  get() {
    const index = this.length - 1;
    return this.blocks[Math.floor(index / BLOCK_DEPTH)][(index % BLOCK_DEPTH) >> 1] >> ((index & 1) * 4) & 15;
  }
  set(state) {
    const index = this.length - 1, block = this.blocks[Math.floor(index / BLOCK_DEPTH)];
    const slot = (index % BLOCK_DEPTH) >> 1, shift = (index & 1) * 4;
    block[slot] = (block[slot] & ~(15 << shift)) | state << shift;
  }
  push(state) {
    if (this.length % BLOCK_DEPTH === 0) this.blocks.push(new Uint8Array(BLOCK_BYTES));
    this.length++; this.set(state);
  }
  pop() {
    this.length--;
    if (this.length % BLOCK_DEPTH === 0) this.blocks.pop();
  }
}

class StringParts {
  constructor(limit = Infinity) {
    this.limit = limit; this.length = 0; this.parts = []; this.pending = []; this.pendingLength = 0;
  }
  append(text) {
    this.length += text.length;
    if (this.length > this.limit) {
      this.parts = this.pending = null;
      return false;
    }
    for (let start = 0; start < text.length;) {
      const end = Math.min(text.length, start + STRING_PIECE - this.pendingLength);
      this.pending.push(text.slice(start, end)); this.pendingLength += end - start; start = end;
      if (this.pendingLength === STRING_PIECE || this.pending.length === 1024) this.flush();
    }
    return true;
  }
  flush() {
    if (this.pending.length) this.parts.push(this.pending.join(''));
    this.pending = []; this.pendingLength = 0;
  }
  finish() {
    this.flush();
    const value = this.parts.join('');
    this.parts = null;
    return value;
  }
}

class NumberParts {
  constructor(negative) {
    this.negative = negative; this.digits = ''; this.significant = 0; this.fraction = 0;
    this.tail = false; this.exponent = ''; this.exponentNegative = false; this.exponentHuge = false;
  }
  mantissa(char, fractional) {
    if (fractional) this.fraction++;
    if (!this.significant && char === '0') return;
    this.significant++;
    if (this.digits.length < NUMBER_DIGITS) this.digits += char;
    else if (char !== '0') this.tail = true;
  }
  exponentDigit(char) {
    if (this.exponentHuge || !this.exponent && char === '0') return;
    if (this.exponent.length === 18) this.exponentHuge = true;
    else this.exponent += char;
  }
  finish() {
    const signed = value => this.negative ? -value : value;
    if (!this.significant) return signed(0);
    if (this.exponentHuge) return signed(this.exponentNegative ? 0 : Infinity);
    let exponent;
    if (this.exponent.length < 15) {
      exponent = (this.significant - this.fraction - 1) + (this.exponentNegative ? -1 : 1) * Number(this.exponent || '0');
    } else {
      const exact = (this.exponentNegative ? -1n : 1n) * BigInt(this.exponent) + BigInt(this.significant) - BigInt(this.fraction) - 1n;
      if (exact > 308n) return signed(Infinity);
      if (exact < -324n) return signed(0);
      exponent = Number(exact);
    }
    if (exponent > 308) return signed(Infinity);
    if (exponent < -324) return signed(0);
    const digits = this.digits + (this.tail ? '1' : '');
    return Number((this.negative ? '-' : '') + digits[0] + '.' + digits.slice(1) + 'e' + exponent);
  }
}

export class IncrementalJsonParser {
  constructor({projectObject, stringLimit, metrics} = {}) {
    if (projectObject !== undefined && typeof projectObject !== 'function') throw new TypeError('projectObject must be a function');
    if (stringLimit !== undefined && typeof stringLimit !== 'function') throw new TypeError('stringLimit must be a function');
    this.projectObject = projectObject; this.stringLimit = stringLimit; this.metrics = metrics;
    this.stack = new GrammarStack(); this.frames = []; this.path = [];
    this.rootStarted = false; this.root = undefined; this.token = null; this.position = 0; this.closed = false;
    this.special = /["\\\u0000-\u001f]/g;
    if (metrics) Object.assign(metrics, {characters: 0, maxDepth: 0, maxStringPieceChars: 0,
      maxNumberDigits: 0, retainedStringChars: 0, skippedStringChars: 0,
      limitedStrings: 0, maxLimitedStringChars: 0});
  }
  error() { throw new SyntaxError('Invalid JSON at character ' + this.position); }
  frame() {
    const frame = this.frames[this.frames.length - 1];
    return frame?.depth === this.stack.length ? frame : null;
  }
  keepValue() {
    if (!this.stack.length) return true;
    const frame = this.frame();
    return !!frame && (frame.array || frame.keepNext);
  }
  valuePath() {
    const frame = this.frame();
    return frame ? frame.array ? frame.value.length : frame.key : undefined;
  }
  attach(value, keep) {
    if (!this.stack.length) { this.root = value; this.rootStarted = true; return; }
    const state = this.stack.get(), frame = this.frame();
    if (state === ARRAY_FIRST || state === ARRAY_VALUE) {
      if (keep) frame.value.push(value);
      this.stack.set(ARRAY_NEXT);
    } else if (state === OBJECT_VALUE) {
      if (keep) Object.defineProperty(frame.value, frame.key, {value, writable: true, enumerable: true, configurable: true});
      if (frame) { frame.key = null; frame.keepNext = false; }
      this.stack.set(OBJECT_NEXT);
    } else this.error();
  }
  container(array) {
    const keep = this.keepValue(), key = keep ? this.valuePath() : undefined;
    const value = keep ? array ? [] : {} : undefined;
    this.attach(value, keep); this.stack.push(array ? ARRAY_FIRST : OBJECT_FIRST);
    if (keep) {
      if (this.stack.length > 1) this.path.push(key);
      const selected = array ? null : this.projectObject?.(this.path) ?? null;
      let keyLimit = Infinity;
      if (selected !== null) {
        if (!(selected instanceof Set)) throw new TypeError('projectObject must return a Set or null');
        keyLimit = 0;
        for (const name of selected) {
          if (typeof name !== 'string') throw new TypeError('Projected property names must be strings');
          keyLimit = Math.max(keyLimit, name.length);
        }
      }
      this.frames.push({depth: this.stack.length, value, array, selected, keyLimit, key: null, keepNext: false});
    }
    if (this.metrics) this.metrics.maxDepth = Math.max(this.metrics.maxDepth, this.stack.length);
  }
  close() {
    if (this.frame()) {
      this.frames.pop();
      if (this.stack.length > 1) this.path.pop();
    }
    this.stack.pop();
  }
  string(key) {
    const frame = this.frame(), keep = key ? !!frame : this.keepValue();
    let budget;
    if (keep && !key && this.stringLimit) {
      if (this.stack.length) this.path.push(this.valuePath());
      const limit = this.stringLimit(this.path);
      if (this.stack.length) this.path.pop();
      if (limit !== undefined && limit !== null) {
        if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError('Invalid native string byte limit');
        budget = new Utf8StringLimit(limit);
        if (this.metrics) this.metrics.limitedStrings++;
      }
    }
    this.token = {kind: 'string', key, keep, parts: keep ? new StringParts(key ? frame.keyLimit : Infinity) : null,
      budget, exceeded: false, mode: 0, hexDigits: 0, hexValue: 0};
  }
  appendString(text) {
    const token = this.token;
    if (token.budget && !token.exceeded && !token.budget.append(text)) {
      token.exceeded = true; token.parts = null;
    }
    if (this.metrics) {
      this.metrics[token.keep && !token.exceeded ? 'retainedStringChars' : 'skippedStringChars'] += text.length;
      if (token.keep && !token.exceeded) this.metrics.maxStringPieceChars = Math.max(this.metrics.maxStringPieceChars, Math.min(text.length, STRING_PIECE));
    }
    if (token.keep && !token.exceeded && !token.parts.append(text)) { token.keep = false; token.parts = null; }
    if (this.metrics && token.budget && token.parts)
      this.metrics.maxLimitedStringChars = Math.max(this.metrics.maxLimitedStringChars, token.parts.length);
  }
  finishString() {
    const token = this.token, value = token.keep ? token.exceeded ? JSON_STRING_LIMIT : token.parts.finish() : undefined;
    this.token = null;
    if (token.key) {
      const frame = this.frame();
      if (frame) { frame.key = value; frame.keepNext = token.keep && (frame.selected === null || frame.selected.has(value)); }
      this.stack.set(OBJECT_COLON);
    } else this.attach(value, token.keep);
  }
  begin(code) {
    if (code === 123) this.container(false);
    else if (code === 91) this.container(true);
    else if (code === 34) this.string(false);
    else if (code === 116 || code === 102 || code === 110) {
      const text = code === 116 ? 'true' : code === 102 ? 'false' : 'null';
      this.token = {kind: 'literal', text, index: 1, keep: this.keepValue(), value: code === 116 ? true : code === 102 ? false : null};
    } else if (code === 45 || digit(code)) {
      const keep = this.keepValue(), parts = keep ? new NumberParts(code === 45) : null;
      if (digit(code)) parts?.mantissa(String.fromCharCode(code), false);
      this.token = {kind: 'number', state: code === 45 ? 'minus' : code === 48 ? 'zero' : 'integer', keep, parts};
    } else this.error();
  }
  number(code) {
    const token = this.token, char = String.fromCharCode(code), parts = token.parts;
    switch (token.state) {
      case 'minus':
        if (!digit(code)) this.error();
        token.state = code === 48 ? 'zero' : 'integer'; parts?.mantissa(char, false); return true;
      case 'zero':
      case 'integer':
        if (digit(code) && token.state === 'integer') { parts?.mantissa(char, false); return true; }
        if (code === 46) { token.state = 'dot'; return true; }
        if (code === 101 || code === 69) { token.state = 'exponentStart'; return true; }
        break;
      case 'dot':
        if (!digit(code)) this.error();
        token.state = 'fraction'; parts?.mantissa(char, true); return true;
      case 'fraction':
        if (digit(code)) { parts?.mantissa(char, true); return true; }
        if (code === 101 || code === 69) { token.state = 'exponentStart'; return true; }
        break;
      case 'exponentStart':
        if (code === 43 || code === 45) {
          if (parts) parts.exponentNegative = code === 45;
          token.state = 'exponentDigit'; return true;
        }
      case 'exponentDigit':
        if (!digit(code)) this.error();
        token.state = 'exponent'; parts?.exponentDigit(char); return true;
      case 'exponent':
        if (digit(code)) { parts?.exponentDigit(char); return true; }
        break;
    }
    this.finishNumber(); return false;
  }
  finishNumber() {
    const token = this.token;
    if (!['zero', 'integer', 'fraction', 'exponent'].includes(token.state)) this.error();
    if (this.metrics && token.parts) this.metrics.maxNumberDigits = Math.max(this.metrics.maxNumberDigits, token.parts.digits.length);
    const value = token.keep ? token.parts.finish() : undefined;
    this.token = null; this.attach(value, token.keep);
  }
  write(text) {
    if (this.closed) throw new TypeError('JSON parser is closed');
    if (typeof text !== 'string') throw new TypeError('JSON chunks must be strings');
    if (text.length > Number.MAX_SAFE_INTEGER - this.position) throw new RangeError('JSON input length is not safely countable');
    const base = this.position;
    try {
      for (let index = 0; index < text.length;) {
        this.position = base + index;
        const code = text.charCodeAt(index), token = this.token;
        if (token?.kind === 'string') {
          if (token.mode === 0) {
            this.special.lastIndex = index;
            const match = this.special.exec(text), end = match ? match.index : text.length;
            if (end !== index) this.appendString(text.slice(index, end));
            index = end;
            if (!match) break;
            const special = text.charCodeAt(index++);
            if (special === 34) this.finishString();
            else if (special === 92) token.mode = 1;
            else this.error();
          } else if (token.mode === 1) {
            index++;
            if (code === 117) { token.mode = 2; token.hexDigits = token.hexValue = 0; }
            else {
              const escaped = code === 34 ? '"' : code === 92 ? '\\' : code === 47 ? '/'
                : code === 98 ? '\b' : code === 102 ? '\f' : code === 110 ? '\n' : code === 114 ? '\r' : code === 116 ? '\t' : null;
              if (escaped === null) this.error();
              this.appendString(escaped); token.mode = 0;
            }
          } else {
            const value = hex(code); if (value < 0) this.error();
            token.hexValue = token.hexValue * 16 + value; index++;
            if (++token.hexDigits === 4) { this.appendString(String.fromCharCode(token.hexValue)); token.mode = 0; }
          }
          continue;
        }
        if (token?.kind === 'literal') {
          if (code !== token.text.charCodeAt(token.index)) this.error();
          index++;
          if (++token.index === token.text.length) { this.token = null; this.attach(token.value, token.keep); }
          continue;
        }
        if (token?.kind === 'number') { if (this.number(code)) index++; continue; }
        if (whitespace(code)) { index++; continue; }
        if (!this.stack.length) {
          if (this.rootStarted) this.error();
          this.begin(code); index++; continue;
        }
        const state = this.stack.get();
        if (state === OBJECT_FIRST || state === OBJECT_KEY) {
          if (state === OBJECT_FIRST && code === 125) this.close();
          else if (code === 34) this.string(true);
          else this.error();
        } else if (state === OBJECT_COLON) {
          if (code !== 58) this.error();
          this.stack.set(OBJECT_VALUE);
        } else if (state === OBJECT_VALUE || state === ARRAY_VALUE || state === ARRAY_FIRST) {
          if (state === ARRAY_FIRST && code === 93) this.close();
          else this.begin(code);
        } else if (state === OBJECT_NEXT) {
          if (code === 125) this.close();
          else if (code === 44) this.stack.set(OBJECT_KEY);
          else this.error();
        } else {
          if (code === 93) this.close();
          else if (code === 44) this.stack.set(ARRAY_VALUE);
          else this.error();
        }
        index++;
      }
      this.position = base + text.length;
      if (this.metrics) this.metrics.characters = this.position;
      return this;
    } catch (error) { this.discard(); throw error; }
  }
  finish() {
    if (this.closed) throw new TypeError('JSON parser is closed');
    try {
      if (this.token?.kind === 'number') this.finishNumber();
      if (this.token || this.stack.length || !this.rootStarted) this.error();
      const value = this.root;
      this.discard();
      return value;
    } catch (error) { this.discard(); throw error; }
  }
  discard() {
    this.root = this.token = undefined; this.frames = this.path = []; this.stack = null; this.closed = true;
  }
}

export function parseJsonChunks(chunks, options) {
  const parser = new IncrementalJsonParser(options);
  try {
    for (const chunk of chunks) parser.write(chunk);
    return parser.finish();
  } catch (error) { parser.discard(); throw error; }
}

const bodyFailure = (code, message, details) => Object.assign(new Error(message), {code, details});


export async function parseJsonStream(input, {limit = Infinity, label = 'JSON request', code = 'REQUEST_TOO_LARGE',
  preserveBOM = false, received, signal = input?.signal, failure = bodyFailure, projectObject, stringLimit, metrics, inlineBytes = 65536,
  maxDepth = Infinity, timeoutMs = 0} = {}) {
  if (!Number.isSafeInteger(inlineBytes) || inlineBytes < 0) throw new TypeError('inlineBytes must be a nonnegative safe integer');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new TypeError('timeoutMs must be a nonnegative safe integer');
  const depth = maxDepth === Infinity ? null : new JsonDepthGuard(maxDepth, {label, failure});
  const stream = typeof input?.getReader === 'function' ? input : input?.body;
  const length = input?.headers?.get('Content-Length');
  const reader = stream?.getReader(), decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: preserveBOM});
  let parser, inline = [], bytes = 0, cancelled = false, syntaxError, depthError, timeoutError, timer;
  if (received) received.bytes = 0;
  const cancel = reason => {
    if (cancelled || !reader) return;
    cancelled = true;
    try { Promise.resolve(reader.cancel(reason)).catch(() => {}); } catch {}
  };
  const abort = () => cancel(signal.reason);
  const decoded = text => {
    if (depthError) return;
    try { depth?.write(text); }
    catch (error) { if (error?.code !== 'JSON_TOO_DEEP') throw error; depthError = error; parser?.discard(); parser = null; inline = null; return; }
    if (syntaxError) return;
    if (!parser && bytes <= inlineBytes) { inline.push(text); return; }
    try { parser.write(text); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      syntaxError = error;
    }
  };
  const beginIncremental = () => {
    if (depthError || parser || bytes <= inlineBytes) return;
    parser = new IncrementalJsonParser({projectObject, stringLimit, metrics});
    for (const text of inline) {
      try { if (!syntaxError) parser.write(text); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; syntaxError = error; }
    }
    inline = null;
  };
  try {
    signal?.throwIfAborted();
    if (length && (!/^\d+$/.test(length) || Number(length) > limit))
      throw failure(code, `The ${label} must be at most ${limit} bytes.`, {limitBytes: limit});
    if (!reader) throw failure('EMPTY_BODY', `The ${label} body is missing.`);
    signal?.addEventListener('abort', abort, {once: true});
    if (timeoutMs) timer = setTimeout(() => {
      timeoutError = failure('REQUEST_TIMEOUT', `The ${label} body did not finish in time.`, {timeoutMs});
      cancel(timeoutError);
    }, timeoutMs);
    while (true) {
      const {value, done} = await reader.read();
      if (timeoutError) throw timeoutError;
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (received) received.bytes = bytes;
      if (bytes > limit) throw failure(code, `The ${label} must be at most ${limit} bytes.`, {limitBytes: limit});
      beginIncremental();
      for (let offset = 0; offset < value.byteLength; offset += DECODE_BYTES)
        decoded(decoder.decode(value.subarray(offset, offset + DECODE_BYTES), {stream: true}));
    }
    decoded(decoder.decode());
    if (depthError) throw depthError;
    if (syntaxError) throw syntaxError;
    if (!parser) {
      const text = inline.join('');
      if (metrics) Object.assign(metrics, {inline: true, characters: text.length});
      return JSON.parse(text);
    }
    return parser.finish();
  } catch (error) { parser?.discard(); cancel(error); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); reader?.releaseLock(); }
}
