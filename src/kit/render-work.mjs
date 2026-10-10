// SPDX-License-Identifier: MIT
// The synchronous and cooperative writers consume the same document transformations.
export function finish(iterator) {
  let next;
  do { next = iterator.next(); } while (!next.done);
  return next.value;
}

export function check(work) {
  if (work?.signal?.aborted) throw Object.assign(new Error('The operation was cancelled.'), {name: 'AbortError', code: 'cancelled'});
}

export async function pause(work, fraction, label) {
  check(work);
  if (fraction !== undefined || label !== undefined) work?.onProgress?.(fraction, label);
  if (work?.yield) await work.yield(fraction, label);
  else await new Promise(resolve => setTimeout(resolve, 0));
  check(work);
}

// This locates complete fragments; the existing HTML parser and sanitizer still admit
// every byte. Uncertain nesting stays together instead of guessing a new boundary.
export function htmlBoundary() {
  const stack = [], voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const rawTags = new Set('script style textarea title xmp iframe noembed noframes'.split(' '));
  let pending = '', raw = '', uncertain = false;
  return fragment => {
    if (uncertain) return false;
    pending += fragment;
    let at = 0;
    while (at < pending.length) {
      if (raw) {
        const close = new RegExp('</' + raw + '(?=[\\t\\n\\f\\r />])', 'i').exec(pending.slice(at));
        if (!close) { pending = pending.slice(Math.max(at, pending.length - raw.length - 3)); return false; }
        at += close.index; raw = '';
      }
      const open = pending.indexOf('<', at);
      if (open < 0) { pending = ''; return stack.length === 0; }
      if (pending.startsWith('<!--', open)) {
        const close = pending.indexOf('-->', open + 4);
        if (close < 0) { pending = pending.slice(open); return false; }
        at = close + 3; continue;
      }
      if (open + 1 === pending.length) { pending = '<'; return false; }
      const match = /^<\/?([A-Za-z][A-Za-z0-9:.-]*)/.exec(pending.slice(open));
      if (!match) { uncertain = true; return false; }
      const name = match[1].toLowerCase();
      if (['html', 'head', 'body', 'noscript', 'plaintext', 'template'].includes(name)) { uncertain = true; return false; }
      let end = open + match[0].length, quote = '';
      for (; end < pending.length; end++) {
        const character = pending[end];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '>') break;
      }
      if (end === pending.length) { pending = pending.slice(open); return false; }
      const closing = pending[open + 1] === '/';
      if (closing) {
        if (stack.at(-1) !== name) { uncertain = true; return false; }
        stack.pop();
      } else {
        const foreign = name === 'svg' || name === 'math' || stack.includes('svg') || stack.includes('math');
        if (!(foreign && pending[end - 1] === '/') && !(voids.has(name) && !foreign)) stack.push(name);
        if (rawTags.has(name)) raw = name;
      }
      at = end + 1;
    }
    pending = '';
    return stack.length === 0 && !raw;
  };
}

export async function finishAsync(iterator, work) {
  let began = performance.now(), next;
  check(work);
  do {
    next = iterator.next();
    if (!next.done && performance.now() - began >= 8) {
      await pause(work);
      began = performance.now();
    }
  } while (!next.done);
  check(work);
  return next.value;
}

export function* cloneTree(root) {
  const copy = root.cloneNode(false), stack = [{source: root, target: copy, at: 0}];
  while (stack.length) {
    const top = stack[stack.length - 1], source = top.source.childNodes[top.at++];
    if (!source) { stack.pop(); continue; }
    const node = source.cloneNode(false);
    top.target.appendChild(node);
    const children = source.content || source, target = node.content || node;
    if (children.childNodes.length) stack.push({source: children, target, at: 0});
    yield;
  }
  return copy;
}

export function* htmlParts(root, limit = 16384) {
  const text = root.ownerDocument.createElement('div');
  let part = '';
  for (let node = root.firstChild; node; node = node.nextSibling) {
    let html;
    if (node.nodeType === 1) html = node.outerHTML;
    else { text.replaceChildren(node.cloneNode(false)); html = text.innerHTML; }
    if (part && part.length + html.length > limit) { yield part; part = ''; }
    part += html;
  }
  if (part) yield part;
}

export function* cleanTree(root, sanitize, context = 'export') {
  const clean = root.ownerDocument.createElement('div');
  const part = root.ownerDocument.createElement('div');
  for (const html of htmlParts(root)) {
    part.innerHTML = sanitize(html, context);
    while (part.firstChild) clean.appendChild(part.firstChild);
    yield;
  }
  return clean;
}

export function* serializeTree(root, sanitize = null, trim = false) {
  const parts = [];
  for (const html of htmlParts(root)) { parts.push(sanitize ? sanitize(html, 'export') : html); yield; }
  const result = parts.join('');
  return trim ? result.trim() : result;
}

// Chunk boundaries never split a UTF-16 pair; TextEncoder remains the byte authority.
export function* encodeUtf8Steps(source, size = 65536) {
  const encoder = new TextEncoder(), parts = [];
  let length = 0;
  for (let at = 0; at < source.length;) {
    let end = Math.min(source.length, at + size);
    if (end < source.length && source.charCodeAt(end - 1) >= 0xd800 && source.charCodeAt(end - 1) <= 0xdbff) end--;
    const part = encoder.encode(source.slice(at, end));
    parts.push(part); length += part.length; at = end; yield;
  }
  const bytes = new Uint8Array(length); let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; yield; }
  return bytes;
}
