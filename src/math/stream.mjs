// SPDX-License-Identifier: MIT
// Full Markdown previews have no append-only promise. Geometric admission bounds
// the total source passed to a synchronous host, including the final batch pass.
import {createMathSession} from './reuse.mjs';
export {createMathSession} from './reuse.mjs';

export function createMarkdownStream(renderMarkdown, {maxSourceLength = 1_000_000, previewEvery = 256, reuse = {}} = {}) {
  if (typeof renderMarkdown !== 'function') throw new TypeError('Supply a synchronous Markdown renderer.');
  for (const value of [maxSourceLength, previewEvery])
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Stream limits must be positive finite integers.');
  if (reuse !== false && (reuse === null || typeof reuse !== 'object'))
    throw new TypeError('Stream reuse must be false or a Math reuse limits object.');
  // Only limits are retained. Caller mutation cannot reconfigure this message or
  // its replacement. The session itself contains no source until a host uses it.
  const limits = Object.freeze(reuse === false ? {maxEntries: 0} : {
    maxEntries: reuse.maxEntries, maxRetainedBytes: reuse.maxRetainedBytes, maxEntryBytes: reuse.maxEntryBytes,
  });
  function start(revision = 0) {
    let chunks = [], length = 0, threshold = previewEvery, closed = false, rendering = false;
    let session = createMathSession(limits);
    function open() {
      if (closed || rendering) throw new Error(closed ? 'This stream is closed; use the new handle returned by reset.' : 'A stream renderer cannot reenter its stream.');
    }
    function release() { session?.dispose(); session = null; }
    function snapshot(final) {
      const source = chunks.join('');
      chunks = source ? [source] : [];
      // Failed previews consumed work too. Further chunks must still wait for the
      // next geometric threshold; only an explicit finish retries immediately.
      threshold = Math.max(previewEvery, length * 2);
      session ||= createMathSession(limits);
      rendering = true;
      let html;
      try {
        html = renderMarkdown(source, session);
        if (typeof html !== 'string') throw new TypeError('The Markdown renderer must return a string synchronously.');
      } catch (error) {
        release(); // Keep exact accepted source; retry gets a fresh artifact owner.
        throw error;
      } finally { rendering = false; }
      if (final) { release(); closed = true; chunks = []; length = 0; }
      return {source, html, revision, final};
    }
    return Object.freeze({
      write(chunk) {
        open();
        if (typeof chunk !== 'string') throw new TypeError('Decode transport bytes to strings before writing.');
        if (chunk.length > maxSourceLength - length)
          throw Object.assign(new RangeError('The message exceeds its source budget; this chunk was not accepted.'), {code: 'resource-limit'});
        if (!chunk.length) return null;
        chunks.push(chunk); length += chunk.length; revision++;
        return length >= threshold ? snapshot(false) : null;
      },
      finish() { open(); revision++; return snapshot(true); },
      abort() {
        if (rendering) throw new Error('A stream renderer cannot abort its stream.');
        if (closed) return;
        release(); chunks = []; length = 0; closed = true; revision++;
      },
      reset() {
        if (rendering) throw new Error('A stream renderer cannot reset its stream.');
        release(); chunks = []; length = 0; closed = true;
        // A producer must capture its own handle. Replaced producers can neither
        // append to nor finish the new message, even if transport cancellation races.
        return start(++revision);
      },
      get revision() { return revision; },
    });
  }
  return start();
}
