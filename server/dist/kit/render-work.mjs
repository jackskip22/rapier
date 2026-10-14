// SPDX-License-Identifier: MIT
export function finish(iterator) {
  let next;
  do { next = iterator.next(); } while (!next.done);
  return next.value;
}

export function check(work) {
	work?.check?.();
  if (work?.signal?.aborted) throw Object.assign(new Error('The operation was cancelled.'), {name: 'AbortError', code: 'cancelled'});
}

export async function pause(work, fraction, label) {
  check(work);
  if (fraction !== undefined || label !== undefined) work?.onProgress?.(fraction, label);
  if (work?.yield) await work.yield(fraction, label);
  else await new Promise(resolve => setTimeout(resolve, 0));
  check(work);
}

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
  try {
    do {
      check(work);
      next = iterator.next();
      if (!next.done && performance.now() - began >= 8) {
        await pause(work);
        began = performance.now();
      }
    } while (!next.done);
    check(work);
    return next.value;
  } finally { if (!next?.done) iterator.return?.(); }
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

export function* htmlParts(root, limit = 16384, consume = false) {
  limit = Math.max(2, limit);
  const text = root.ownerDocument.createElement('div');
  const small = node => {
    let count = 0, chars = 0, at = node;
    while (at) {
      if (++count > 128) return false;
      if (at.nodeType === 1) for (const attribute of at.attributes) chars += attribute.value.length + attribute.name.length;
      else chars += at.nodeValue?.length || 0;
      if (chars > limit) return false;
      if (at.firstChild) at = at.firstChild;
      else {
        while (at !== node && !at.nextSibling) at = at.parentNode;
        at = at === node ? null : at.nextSibling;
      }
    }
    return true;
  };
  const nativeHtml = node => {
    if (node.nodeType === 1) return node.outerHTML;
    text.replaceChildren(node.cloneNode(false)); return text.innerHTML;
  };
  const nodeHtml = function* (node) {
    if (small(node)) return nativeHtml(node);
    const pieces = [], stack = [];
    let at = node;
    while (at) {
      yield null;
      if (at.nodeType === 1) {
        if (small(at)) pieces.push(at.outerHTML);
        else {
          const empty = at.cloneNode(false);
          if (at.firstChild) empty.appendChild(root.ownerDocument.createTextNode(''));
          const shell = empty.outerHTML, close = /<\/[^<>]+>$/.exec(shell)?.[0] || '';
          if (close && at.firstChild) {
            pieces.push(shell.slice(0, -close.length));
            stack.push({node: at, close}); at = at.firstChild; continue;
          }
          pieces.push(shell);
        }
      } else if (at.nodeType === 3 && at.nodeValue.length > limit) {
        const parent = at !== node && at.parentNode?.nodeType === 1 ? at.parentNode.cloneNode(false) : text;
        const value = at.nodeValue;
        for (let start = 0; start < value.length;) {
          let end = Math.min(start + limit, value.length);
          if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
          parent.replaceChildren(root.ownerDocument.createTextNode(value.slice(start, end)));
          pieces.push(parent.innerHTML); start = end; yield null;
        }
        parent.replaceChildren();
      } else if (at.nodeType === 3 && at.parentNode?.nodeType === 1) {
        const parent = at.parentNode.cloneNode(false);
        parent.appendChild(at.cloneNode(false)); pieces.push(parent.innerHTML);
      } else pieces.push(nativeHtml(at));
      while (at !== node && !at.nextSibling) { const frame = stack.pop(); pieces.push(frame.close); at = frame.node; }
      at = at === node ? null : at.nextSibling;
    }
    return pieces.join('');
  };
  let part = '';
  for (let node = root.firstChild; node;) {
    const next = node.nextSibling;
    const html = yield* nodeHtml(node);
    if (part && part.length + html.length > limit) { yield part; part = ''; }
    part += html;
    if (consume) root.removeChild(node);
    node = next;
  }
  if (part) yield part;
}

export function admitHtml(root, html, sanitize, fragment = null, context = 'export') {
  if (fragment) root.appendChild(fragment(html, context));
  else {
    const part = root.ownerDocument.createElement('div');
    part.innerHTML = sanitize(html, context);
    while (part.firstChild) root.appendChild(part.firstChild);
  }
}

export function* cleanTree(root, sanitize, context = 'export', fragment = null) {
  const clean = root.ownerDocument.createElement('div');
  for (const html of htmlParts(root)) {
    if (html !== null) admitHtml(clean, html, sanitize, fragment, context);
    yield;
  }
  return clean;
}

export function* serializeTree(root, sanitize = null, trim = false) {
  const parts = [];
  for (const html of htmlParts(root)) {
    if (html !== null) parts.push(sanitize ? sanitize(html, 'export') : html);
    yield;
  }
  const result = parts.join('');
  return trim ? result.trim() : result;
}

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
