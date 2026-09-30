#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// will.mjs — reference reader and evaluator for Will/1 (the Markdown text
// binding: a marker line that happens to be an HTML comment; no HTML
// binding is claimed). Zero dependencies, one file. MIT.
//
// This is a READER and a pure EVALUATOR, never a host's enforcement
// boundary: an enforcing editor judges its own carrier at its own mutation
// seam. What this file proves is the grammar and the outcome table — the
// same answers, from anyone's implementation, over the same bytes.
//
// Byte law, no normalization: every operation here works on raw bytes.
// Strict UTF-8 is required and decoding errors are reported as a fault,
// never silently replaced. Line terminators (LF, CRLF, CR) are recognised but
// never converted into one another, and no comparison anywhere trims or
// pads a byte range that was not asked for.
//
// API:
//   parse(bytes)                          -> { regions, faults, faulted }
//   evaluate(beforeBytes, splices, path)  -> { outcome, reason?, rule?, region?, law?, faults? }
//
//   A "splice" is a host-observed edit against the *pre-state* byte
//   offsets of `beforeBytes`: { start, end, insert }, meaning "replace
//   bytes [start, end) with `insert`". `insert` is a string or a Buffer,
//   verbatim; a splice may instead carry `insertBase64` (a base64 string)
//   for byte-sensitive content, and the two are never both meaningful at
//   once. All splices in one call are judged against the same original
//   offsets (they are not applied sequentially against a shifting
//   document) and must not overlap or tie one another.
//
//   evaluate() is total: no input, however malformed, ever throws out of
//   it uncaught. Every call resolves to exactly one outcome:
//     outcome: "invalid"  reason: "precondition"  rule: one of
//              "unknown_path" | "malformed_splice" | "out_of_range_splice"
//              | "overlapping_splices"
//         — the call itself was not well-formed: a `splices` argument
//           that is not an array, an array element that is `null` or
//           `undefined`, an unrecognised `path` value, a splice with a
//           bad offset pair, an insert that is neither a string/Buffer
//           nor a valid insertBase64 (missing, null, or any other type —
//           an empty insert must be spelled out as an explicit '', never
//           implied), an offset past the document's end, or two splices
//           that tie or overlap.
//           Checked identically on every path, including "authoring" —
//           an authoring path bypasses the will, never the shape of its
//           own input. Never "applied", never a "document_law" reason.
//     outcome: "applied"
//         — path "authoring": always, once its splices' shape is valid.
//           path "working": every region the splices reach satisfies its
//           own law, no marker span is touched, and no splice altered
//           the document's marker sequence.
//     outcome: "refused"  reason: "document_law"  rule: one of
//              "before_faulted" | "marker_span_touched" | "law_violated"
//              | "marker_sequence_mismatch" | "result_faulted"
//         — path "working" only: the splices are well-formed, but the
//           transition itself breaks the will. `faults` accompanies
//           "before_faulted" and "result_faulted".
//
// Coordinates and fault order (normative for both parse and evaluate):
// byte spans are zero-based, half-open [start, end) offsets; line and
// region indexes are zero-based; faults are reported in document order
// by span start, never deduplicated. Invalid UTF-8 is one fault at the
// first malformed byte sequence and parsing stops there — no later fault
// in the same document is ever reported alongside it. A single malformed
// marker LINE emits exactly one fault for that line; a document can of
// course still carry several faults from several lines (see
// AUDIT-FAULT-MULTIPLICITY), each one still exactly one fault per line.
//
// CLI:
//   node will.mjs parse <file>|-
//   node will.mjs evaluate <before-file>|- <splices.json> [--authoring]
//       "-" reads fd 0 (stdin) portably via readFileSync(0) — byte-exact,
//       no platform dependence on a "/dev/stdin" filesystem entry.
//   node will.mjs check <vectors.json>
//   node will.mjs --adapter
//       Reads NDJSON cases on stdin (the same shape as a vectors.json
//       vector), writes NDJSON `{ id, kind, result }` lines to stdout —
//       so any implementation, driven the same way, can be diffed
//       against this one or against the vectors themselves.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LAWS = new Set(['edit', 'append', 'keep']);
const OPENER_PREFIX = '<!-- will/';
const CLOSER_PREFIX = '<!-- /will';
const CLOSER_EXACT = '<!-- /will -->';
const CLOSE_SUFFIX = ' -->';
const INTENT_MAX_SCALARS = 512;
// The reserved namespace also covers the unspaced near-miss of each
// prefix: a column-zero line beginning "<!--will/" or "<!--/will" (no
// space after the comment delimiter) is always a fault, never silently
// ordinary content — the nearest miss to a will is the one most worth
// refusing to lose quietly. The canonical grammar keeps the space; only
// the spaced prefixes above ever open or close a region.
const UNSPACED_OPENER_PREFIX = '<!--will/';
const UNSPACED_CLOSER_PREFIX = '<!--/will';

// ───────────────────────── byte-level line splitting ─────────────────────
// A "line" is bytes up to LF, CRLF or CR. lineSpan (a marker's own protected
// span) is [start, end) INCLUDING the terminator; contentSpan is [start,
// contentEnd) EXCLUDING it. This makes lineSpans tile the document with no
// gaps, and it is exactly what makes the governed interval fall out for
// free: "immediately after the opener line's terminator" is opener
// lineSpan.end; "immediately before the closer line's first byte" is
// closer lineSpan.start.
function splitLines(buf) {
  const lines = [];
  const n = buf.length;
  let lineStart = 0;
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0x0A || buf[i] === 0x0D) {
      const contentEnd = i;
      if (buf[i] === 0x0D && buf[i + 1] === 0x0A) i++;
      lines.push({ start: lineStart, contentEnd, lineEnd: i + 1 });
      lineStart = i + 1;
    }
  }
  if (lineStart < n || n === 0) {
    lines.push({ start: lineStart, contentEnd: n, lineEnd: n });
  }
  return lines;
}

// ───────────────────────── strict UTF-8 validation ───────────────────────
// Returns null when `buf` is strictly valid UTF-8 (no overlong encodings,
// no surrogates, no codepoints beyond U+10FFFF, no truncated sequences at
// EOF). Otherwise returns the byte offset and length of the first
// malformed sequence, so the fault carries a precise span instead of a
// vague "somewhere in this file".
function findInvalidUtf8(buf) {
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const b0 = buf[i];
    if (b0 <= 0x7f) { i += 1; continue; }
    let need, min, cp;
    if ((b0 & 0xe0) === 0xc0) { need = 1; min = 0x80; cp = b0 & 0x1f; }
    else if ((b0 & 0xf0) === 0xe0) { need = 2; min = 0x800; cp = b0 & 0x0f; }
    else if ((b0 & 0xf8) === 0xf0) { need = 3; min = 0x10000; cp = b0 & 0x07; }
    else return { offset: i, length: 1 };
    if (i + need >= n) return { offset: i, length: n - i };
    let ok = true;
    for (let k = 1; k <= need; k++) {
      const bk = buf[i + k];
      if ((bk & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (bk & 0x3f);
    }
    if (!ok) return { offset: i, length: 1 };
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      return { offset: i, length: need + 1 };
    }
    i += need + 1;
  }
  return null;
}

function scalarCount(s) { return [...s].length; }

// ───────────────────────────────── parse ──────────────────────────────────
export function parse(bytesInput) {
  const buf = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);

  const bad = findInvalidUtf8(buf);
  if (bad) {
    return {
      regions: [],
      faults: [{ mode: 'invalid_utf8', line: null, byteSpan: [bad.offset, bad.offset + bad.length] }],
      faulted: true,
    };
  }

  const rawLines = splitLines(buf);
  const faults = [];
  const regions = [];
  let open = null; // { law, intent, line, span }

  for (let idx = 0; idx < rawLines.length; idx++) {
    const { start, contentEnd, lineEnd } = rawLines[idx];
    const lineSpan = [start, lineEnd];
    const text = buf.slice(start, contentEnd).toString('utf8');

    if (text.startsWith(CLOSER_PREFIX)) {
      if (text !== CLOSER_EXACT) {
        faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
        continue;
      }
      if (!open) {
        faults.push({ mode: 'unpaired_marker', line: idx, byteSpan: lineSpan });
        continue;
      }
      regions.push({
        index: regions.length,
        law: open.law,
        intent: open.intent,
        opener: { line: open.line, byteSpan: open.span },
        closer: { line: idx, byteSpan: lineSpan },
        governedSpan: [open.span[1], start],
      });
      open = null;
      continue;
    }

    if (!text.startsWith(OPENER_PREFIX)) {
      // Off the spaced namespace — but the unspaced near-miss of either
      // prefix is still inside the reserved namespace and always a fault,
      // never silently ordinary content. Neither opens nor closes a
      // region: `open` is left exactly as it was.
      if (text.startsWith(UNSPACED_OPENER_PREFIX) || text.startsWith(UNSPACED_CLOSER_PREFIX)) {
        faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
      }
      continue; // otherwise: ordinary content
    }

    // Version is checked before delimiter grammar, including an incomplete line.
    const afterPrefix = text.slice(OPENER_PREFIX.length);
    const versionGap = afterPrefix.indexOf(' ');
    const version = versionGap === -1 ? afterPrefix : afterPrefix.slice(0, versionGap);
    if (version !== '1') {
      faults.push({ mode: 'unknown_version', line: idx, byteSpan: lineSpan });
      continue;
    }
    // Namespace hit. A marker line is EXACTLY the grammar: no trailing
    // bytes before the terminator, so the line must literally end with
    // the fixed " -->" delimiter.
    if (!text.endsWith(CLOSE_SUFFIX)) {
      faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
      continue;
    }
    const middle = text.slice(OPENER_PREFIX.length, text.length - CLOSE_SUFFIX.length);
    const sp = middle.indexOf(' ');
    if (sp === -1) {
      faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
      continue;
    }
    const rest = middle.slice(sp + 1);
    const lawWord = (/^[^:\s]*/.exec(rest))[0];
    // A missing law word is one fact and gets one mode: malformed, never unknown_law.
    if (!lawWord) {
      faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
      continue;
    }
    let intent;
    if (rest === lawWord) {
      intent = undefined; // no-intent form: "<law>"
    } else if (rest.startsWith(lawWord + ': ')) {
      intent = rest.slice(lawWord.length + 2); // "<law>: <intent>", verbatim, unstripped
    } else {
      faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
      continue;
    }
    if (!LAWS.has(lawWord)) {
      faults.push({ mode: 'unknown_law', line: idx, byteSpan: lineSpan });
      continue;
    }
    if (intent !== undefined) {
      if (intent.length === 0) {
        faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
        continue;
      }
      // The comment ends at the first "-->" in every HTML parser; an
      // intent attempting to contain one more is a fault, never a region.
      if (intent.includes('--')) {
        faults.push({ mode: 'malformed_marker', line: idx, byteSpan: lineSpan });
        continue;
      }
      if (scalarCount(intent) > INTENT_MAX_SCALARS) {
        faults.push({ mode: 'intent_over_bound', line: idx, byteSpan: lineSpan });
        continue;
      }
    }
    if (open) {
      // An opener arriving before the pending pair's closer: interleaving.
      // The fault attaches to this second opener; the original pending
      // marker is left exactly as it was and still awaits its own closer.
      faults.push({ mode: 'unpaired_marker', line: idx, byteSpan: lineSpan });
      continue;
    }
    open = { law: lawWord, intent: intent ?? null, line: idx, span: lineSpan };
  }
  if (open) faults.push({ mode: 'unpaired_marker', line: open.line, byteSpan: open.span });

  // The pending opener's own fault (pushed above, after the line loop)
  // can carry an earlier byte span than faults already pushed during the
  // loop from later lines. Faults are normative in document order by span
  // start (never by discovery order), so the final list is sorted once,
  // here, rather than trusted to have accumulated in order. Array#sort is
  // stable, so faults that legitimately share a start (none do today, by
  // construction of one-fault-per-line) would keep discovery order.
  faults.sort((a, b) => a.byteSpan[0] - b.byteSpan[0]);

  return { regions, faults, faulted: faults.length > 0 };
}

// ─────────────────────────────── evaluate ─────────────────────────────────
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }

// Strict base64: the standard alphabet, correct padding, length a
// multiple of 4. Buffer.from(..., 'base64') itself is lenient (it skips
// unrecognised characters rather than rejecting them), which would let a
// malformed insertBase64 silently decode into the wrong bytes instead of
// refusing the call — so shape validation checks the string itself, never
// trusts the decoder to notice.
function isValidBase64(s) {
  if (typeof s !== 'string') return false;
  if (s.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})*$/.test(s);
}

// A splice's replacement bytes are named one of two ways: `insert` (a
// string or a Buffer, verbatim) or `insertBase64` (a base64 string, for
// byte-sensitive content that cannot travel as JSON text) — never both
// meaningfully at once; insertBase64 wins if present. Anything else —
// wrong type, or the key simply absent — is not a coercible default, it
// is a malformed call: an empty insert must be spelled out as an
// explicit '' (or an empty insertBase64), never implied by omission.
function spliceInsertOk(s) {
  if (s.insertBase64 !== undefined) return isValidBase64(s.insertBase64);
  return typeof s.insert === 'string' || Buffer.isBuffer(s.insert);
}

function normalizeSplice(s) {
  const insert = s.insertBase64 !== undefined
    ? Buffer.from(s.insertBase64, 'base64')
    : (Buffer.isBuffer(s.insert) ? s.insert : Buffer.from(s.insert, 'utf8'));
  return { start: s.start, end: s.end, insert };
}

// Splice shape is a precondition, judged before any document law: a
// malformed offset pair, a malformed or absent insert, an offset outside
// the document, or two splices that touch or tie is refused with its own
// distinct rule, never folded into "overlapping_splices" silently or into
// a document-law reason. Same-offset splices (two edits proposing to
// start at one point, zero-width or not) are refused rather than given an
// implicit order — this file makes no promise about which of two ties
// would apply first, so it declares neither and refuses both.
//
// This function is total over its own input shape: a non-array `splices`
// argument, a `null`/`undefined` element inside it, and a wrongly-typed
// `insert` (false, 0, {}, missing, null) are all refused as "invalid"
// instead of throwing out of evaluate() entirely — evaluate() inspects
// shape before anything ever attempts to decode, index, or sort it.
// Buffer construction (normalizeSplice) never runs on an unvalidated
// splice.
function validateSplices(buf, splices) {
  if (!Array.isArray(splices)) {
    return { ok: false, rule: 'malformed_splice' };
  }
  const n = buf.length;
  for (const s of splices) {
    if (s === null || s === undefined) {
      return { ok: false, rule: 'malformed_splice' };
    }
    if (!(Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.start <= s.end)) {
      return { ok: false, rule: 'malformed_splice' };
    }
    if (!spliceInsertOk(s)) {
      return { ok: false, rule: 'malformed_splice' };
    }
    if (s.end > n) {
      return { ok: false, rule: 'out_of_range_splice' };
    }
  }
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let prevStart = -1;
  for (const s of sorted) {
    if (s.start === prevStart) return { ok: false, rule: 'overlapping_splices' }; // same-offset tie
    if (s.start < cursor) return { ok: false, rule: 'overlapping_splices' };
    cursor = s.end;
    prevStart = s.start;
  }
  return { ok: true };
}

function applySplices(buf, splices) {
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;
  for (const s of sorted) {
    parts.push(buf.slice(cursor, s.start));
    parts.push(s.insert);
    cursor = s.end;
  }
  parts.push(buf.slice(cursor));
  return Buffer.concat(parts);
}

function markerBytesList(buf, regions) {
  const list = [];
  for (const r of regions) {
    list.push(buf.slice(r.opener.byteSpan[0], r.opener.byteSpan[1]));
    list.push(buf.slice(r.closer.byteSpan[0], r.closer.byteSpan[1]));
  }
  return list;
}
function sameBytesLists(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Buffer.compare(a[i], b[i]) !== 0) return false;
  return true;
}

// The single terminator immediately before a closer is structurally
// mandatory — a closer cannot parse as a marker without a fresh line to
// start on — so it is excluded from the *comparison basis* for `append`'s
// growth check only. `keep` still compares full governed bytes, terminator
// included: a CRLF/LF change inside a kept region is still a byte change.
// This is the byte-law reading of "old interval is an exact prefix of the
// new" that makes growing a region's own final line possible at all.
function stripOneTrailingTerminator(buf) {
  const n = buf.length;
  if (n === 0) return buf;
  if (buf[n - 1] === 0x0a) {
    if (n >= 2 && buf[n - 2] === 0x0d) return buf.slice(0, n - 2);
    return buf.slice(0, n - 1);
  }
  if (buf[n - 1] === 0x0d) return buf.slice(0, n - 1);
  return buf;
}

export function evaluate(beforeBytesInput, spliceInputs, path = 'working') {
  const beforeBytes = Buffer.isBuffer(beforeBytesInput) ? beforeBytesInput : Buffer.from(beforeBytesInput);
  const rawSplices = spliceInputs;

  // evaluate() is total: every call resolves to exactly one of three
  // outcome families, decided in this fixed order, before any document
  // law is ever consulted —
  //   1. "invalid"  — an API precondition failed (bad path value, or a
  //                    splice that is malformed, out of range, or ties/
  //                    overlaps another). Not a will judgment at all:
  //                    the call itself was not well-formed. Applies
  //                    identically on every path, authoring included —
  //                    an authoring path bypasses the will, never the
  //                    shape of its own input.
  //   2. "applied"  / "refused", reason "document_law" — the ordinary
  //                    judgment once the call itself is well-formed.
  // Unknown path values and malformed splices are therefore refused the
  // same way: a distinct shape, never "applied" (the old authoring
  // shortcut) and never folded into a document-law reason.
  if (path !== 'authoring' && path !== 'working') {
    return { outcome: 'invalid', reason: 'precondition', rule: 'unknown_path' };
  }

  const shape = validateSplices(beforeBytes, rawSplices);
  if (!shape.ok) {
    return { outcome: 'invalid', reason: 'precondition', rule: shape.rule };
  }
  const splices = rawSplices.map(normalizeSplice);

  if (path === 'authoring') return { outcome: 'applied' };

  const b = parse(beforeBytes);
  if (b.faulted) {
    if (splices.length === 0) return { outcome: 'applied' };
    return { outcome: 'refused', reason: 'document_law', rule: 'before_faulted', faults: b.faults };
  }

  // Rule 3 — marker bytes are untouchable by span, even to write identical
  // bytes back, even to move a pair whole.
  // The act is judged whole: every region whose marker any splice touches is gathered, and the
  // one refusal names the first of them in document order — never the caller's first splice.
  let touched = null;
  for (const s of splices) {
    for (const r of b.regions) {
      if (overlaps(s.start, s.end, r.opener.byteSpan[0], r.opener.byteSpan[1])
        || overlaps(s.start, s.end, r.closer.byteSpan[0], r.closer.byteSpan[1])) {
        if (touched === null || r.index < touched.index) touched = r;
      }
    }
  }
  if (touched !== null) {
    return { outcome: 'refused', reason: 'document_law', rule: 'marker_span_touched', region: touched.index, law: touched.law };
  }

  const afterBytes = applySplices(beforeBytes, splices);
  const a = parse(afterBytes);
  if (a.faulted) {
    return { outcome: 'refused', reason: 'document_law', rule: 'result_faulted', faults: a.faults };
  }

  // Defence in depth beyond the span check above: no splice may cause a
  // marker to appear out of ordinary content, vanish by merging into a
  // neighbouring line, or reorder — even when no splice directly touched
  // any *existing* marker's own span (U7-create's whole point).
  const bMarkers = markerBytesList(beforeBytes, b.regions);
  const aMarkers = markerBytesList(afterBytes, a.regions);
  if (!sameBytesLists(bMarkers, aMarkers)) {
    return { outcome: 'refused', reason: 'document_law', rule: 'marker_sequence_mismatch' };
  }

  // Per-region conjunction: every region the act reaches satisfies its own
  // law, independent of how the host shaped the edit into splices.
  for (let k = 0; k < b.regions.length; k++) {
    const rb = b.regions[k], ra = a.regions[k];
    const govB = beforeBytes.slice(rb.governedSpan[0], rb.governedSpan[1]);
    const govA = afterBytes.slice(ra.governedSpan[0], ra.governedSpan[1]);
    if (rb.law === 'keep') {
      if (Buffer.compare(govB, govA) !== 0) {
        return { outcome: 'refused', reason: 'document_law', rule: 'law_violated', region: k, law: 'keep' };
      }
    } else if (rb.law === 'append') {
      const core = stripOneTrailingTerminator(govB);
      const isPrefix = govA.length >= core.length && Buffer.compare(core, govA.slice(0, core.length)) === 0;
      if (!isPrefix) {
        return { outcome: 'refused', reason: 'document_law', rule: 'law_violated', region: k, law: 'append' };
      }
    }
    // edit: unrestricted inside its own governed bytes.
  }

  return { outcome: 'applied' };
}

// ────────────────────────────────── CLI ────────────────────────────────────

function b64ToBuf(b64) { return Buffer.from(b64, 'base64'); }

function caseToParseInput(v) {
  return v.docBase64 !== undefined ? b64ToBuf(v.docBase64) : Buffer.from(v.doc ?? '', 'utf8');
}
function caseToBeforeInput(v) {
  return v.beforeBase64 !== undefined ? b64ToBuf(v.beforeBase64) : Buffer.from(v.before ?? '', 'utf8');
}
function caseToSplices(v) {
  // Passed through verbatim, insert/insertBase64 included, even a
  // malformed element — evaluate() itself now validates and decodes
  // this shape as part of its own precondition check, so this loader
  // never pre-coerces a malformed or absent insert into a silent '' the
  // way the pre-fix Buffer.from(..., 'utf8') did here, and never reads a
  // property off an element that is not an object (null, undefined, a
  // primitive) — such an element is passed on exactly as the vector
  // wrote it, for evaluate()'s own precondition check to refuse.
  const rows = v.splices;
  // A non-array is passed on whole for evaluate()'s own precondition to refuse as malformed.
  if (!Array.isArray(rows)) return rows;
  return rows.map((s) => {
    if (s === null || typeof s !== 'object') return s;
    const out = { start: s.start, end: s.end };
    if (s.insertBase64 !== undefined) out.insertBase64 = s.insertBase64;
    else out.insert = s.insert;
    return out;
  });
}

// Every key present in `want` must deep-equal the same key in `got`;
// extra keys in `got` that `want` does not mention are ignored. This is
// deliberately lenient — reasonable only when diffing a FOREIGN
// implementation's adapter output against vectors.json (see --adapter in
// the CLI usage text), where an extra, harmless field is not itself a
// bug. This repository's own `check` command never uses this: a stray
// key on this reference implementation's own result is a bug in this
// file, and checkParseCase/checkEvaluateCase below compare exactly
// instead (deepEqualStrict). Exported so an external harness driving the
// adapter protocol can reuse the same subset semantics documented there.
export function deepEqualSubset(got, want) {
  if (want === undefined) return true;
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) return false;
    return want.every((w, i) => deepEqualSubset(got[i], w));
  }
  if (want !== null && typeof want === 'object') {
    if (got === null || typeof got !== 'object') return false;
    return Object.keys(want).every((k) => deepEqualSubset(got[k], want[k]));
  }
  return got === want;
}

// Exact deep equality: `got` and `want` must carry the identical set of
// keys at every level, not merely agree on the keys `want` happens to
// name. This is what makes the reference self-check strict — a splice
// pathway that accidentally attaches a stray `reason`/`rule`/`region` to
// an "applied" result, or a parse result whose `faulted` flag disagrees
// with its own `faults` list, now FAILS instead of silently passing
// because the extra or contradictory key was never asked about.
function deepEqualStrict(got, want) {
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) return false;
    return want.every((w, i) => deepEqualStrict(got[i], w));
  }
  if (want !== null && typeof want === 'object') {
    if (got === null || typeof got !== 'object' || Array.isArray(got)) return false;
    const wantKeys = Object.keys(want);
    const gotKeys = Object.keys(got);
    if (wantKeys.length !== gotKeys.length) return false;
    return wantKeys.every((k) => Object.prototype.hasOwnProperty.call(got, k) && deepEqualStrict(got[k], want[k]));
  }
  return got === want;
}

function checkParseCase(v) {
  const got = parse(caseToParseInput(v));
  // STRICT: compared exactly on every key `got` carries, not only the
  // keys `expect` names — parse()'s own API contract is exactly
  // {regions, faults, faulted}, so a stray fourth key would now fail
  // instead of vanishing into a hand-built projection that only ever
  // asked about these three. `faulted` is required on every parse
  // vector so the flag itself is exercised, not merely inferred from
  // faults.length by the checker.
  const ok = deepEqualStrict(got, v.expect);
  return { ok, got };
}
function checkEvaluateCase(v) {
  const got = evaluate(caseToBeforeInput(v), caseToSplices(v), v.path ?? 'working');
  // STRICT: compared exactly on every key `got` carries, not only the
  // keys `expect` names — a stray reason/rule/region/law/faults key
  // riding along on an outcome that should not carry it now fails.
  const ok = deepEqualStrict(got, v.expect);
  return { ok, got };
}

function runCheck(vectorsPath) {
  const spec = JSON.parse(readFileSync(vectorsPath, 'utf8'));
  let pass = 0, fail = 0;
  const failures = [];
  for (const v of spec.vectors) {
    let result;
    if (v.kind === 'parse') result = checkParseCase(v);
    else if (v.kind === 'evaluate') result = checkEvaluateCase(v);
    else { fail++; failures.push(`FAIL ${v.id}: unknown kind ${v.kind}`); continue; }
    if (result.ok) pass++;
    else { fail++; failures.push(`FAIL ${v.id}: got ${JSON.stringify(result.got)}`); }
  }

  for (const f of failures) console.error(f);
  console.log(`${pass} pass / ${fail} fail (fully judgeable: no unverified column)`);
  return fail === 0 ? 0 : 1;
}

// The same check for a harness: every vector's verdict, nothing printed.
export function checkVectors(spec) {
  const failures = [];
  for (const v of spec.vectors) {
    const result = v.kind === 'parse' ? checkParseCase(v) : v.kind === 'evaluate' ? checkEvaluateCase(v) : {ok: false, got: 'unknown kind ' + v.kind};
    if (!result.ok) failures.push({id: v.id, got: result.got});
  }
  return {total: spec.vectors.length, failures};
}

async function runAdapter() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const v = JSON.parse(trimmed);
    let result;
    if (v.kind === 'parse') {
      result = parse(caseToParseInput(v));
    } else if (v.kind === 'evaluate') {
      result = evaluate(caseToBeforeInput(v), caseToSplices(v), v.path ?? 'working');
    } else {
      result = { error: `unknown kind ${v.kind}` };
    }
    process.stdout.write(JSON.stringify({ id: v.id, kind: v.kind, result }) + '\n');
  }
}

// Reads a file's raw bytes. A path of "-" means fd 0 (stdin), read via
// readFileSync(0) — Node's own portable way to read a file descriptor
// directly, exactly like it reads a named path, with no dependence on a
// platform actually exposing stdin as a filesystem entry ("/dev/stdin" is
// a POSIX-only special file; fd 0 is portable). This is byte-exact, never
// line-split: `parse` needs raw bytes, including CRLF terminators and any
// invalid UTF-8, untouched.
function readBytesArg(pathArg) {
  return pathArg === '-' ? readFileSync(0) : readFileSync(pathArg);
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv[0] === 'parse' && argv[1]) {
    console.log(JSON.stringify(parse(readBytesArg(argv[1])), null, 2));
  } else if (argv[0] === 'evaluate' && argv[1] && argv[2]) {
    const path = argv.includes('--authoring') ? 'authoring' : 'working';
    const before = readBytesArg(argv[1]);
    // Each entry already carries exactly the { start, end, insert |
    // insertBase64 } shape evaluate() itself validates and decodes as
    // part of its own precondition check — passed through verbatim, no
    // separate pre-coercion layer to duplicate (or drift from) it.
    const splices = JSON.parse(readFileSync(argv[2], 'utf8'));
    console.log(JSON.stringify(evaluate(before, splices, path), null, 2));
  } else if (argv[0] === 'check' && argv[1]) {
    process.exit(runCheck(argv[1]));
  } else if (argv[0] === '--adapter') {
    await runAdapter();
  } else {
    console.error(
      'usage: will.mjs parse <file>|- | evaluate <before>|- <splices.json> [--authoring] | ' +
      'check <vectors.json> | --adapter\n' +
      '  "-" reads fd 0 (stdin) portably.\n' +
      '  check compares this reference implementation against vectors.json exactly, key for ' +
      'key — a stray field is a failure, never ignored.\n' +
      '  --adapter drives a foreign implementation over the same fixtures (NDJSON in, ' +
      '{ id, kind, result } NDJSON out) for you to diff against vectors.json yourself; a ' +
      'foreign result is reasonably compared as a SUBSET of each vector\'s `expect` (via the ' +
      'exported deepEqualSubset), since another implementation may carry harmless extra ' +
      'fields this reference one does not — that leniency is this repository\'s own `check` ' +
      'command\'s to never take for itself.'
    );
    process.exit(2);
  }
}
