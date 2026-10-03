// SPDX-License-Identifier: AGPL-3.0-only
// BROWSER-MINIFY.json vendors ship minified: local bindings, including function and class names, shorten; export/property names and licence comments stay.
// Both ends pinned to a measured equivalent pair; the retained parsing and paste rows are named in BROWSER-MINIFY.json.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const {minify_sync} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');
export const BROWSER_MINIFY = JSON.parse(readFileSync(new URL('../agent/vendor/BROWSER-MINIFY.json', import.meta.url), 'utf8'));
const sha256 = text => createHash('sha256').update(text).digest('hex');

// Acorn's stand-in: a regexp literal is valid iff new RegExp(pattern, flags) accepts it, retrying with Acorn-known \p{..} names rewritten
// (the engine's Unicode data may be older). Errors raise at the pattern's first character. Each cut's `from` and `to` occur exactly once. MIT.
const ACORN_REWRITER = `  var pp$1 = Parser.prototype;

  // Rapier's stand-in (tools/minify-vendor.mjs, task #328): a pattern's \\p{..} and \\P{..} whose
  // value the tables above know, each written as \\p{L} or \\P{L}, which every engine knows; null
  // when the pattern names none. Escapes are walked, so a literal backslash before a p is not one.
  function rapierKnownPropertyRewrite(pattern, tables) {
    var out = "", found = false, i = 0, n = pattern.length;
    while (i < n) {
      var ch = pattern.charAt(i);
      if (ch !== "\\\\") { out += ch; i++; continue; }
      var next = pattern.charAt(i + 1);
      if ((next === "p" || next === "P") && pattern.charAt(i + 2) === "{") {
        var close = pattern.indexOf("}", i + 3);
        if (close > 0) {
          var body = pattern.slice(i + 3, close), eq = body.indexOf("="), known = false;
          if (eq < 0) { known = tables.binary.test(body); }
          else { var name = body.slice(0, eq), value = body.slice(eq + 1); known = hasOwn(tables.nonBinary, name) && tables.nonBinary[name].test(value); }
          if (known) { out += "\\\\" + next + "{L}"; found = true; i = close + 1; continue; }
        }
      }
      out += ch + next; i += 2;
    }
    return found ? out : null;
  }

`;
const ACORN_REGEXP = `    // Rapier's stand-in (tools/minify-vendor.mjs, tasks #311 and #328): the engine running this
    // parser validates the grammar. The literal is valid iff new RegExp(pattern, flags) accepts it,
    // flags and all, or -- when the engine refuses and the pattern names a property value Acorn's
    // tables know -- iff the engine accepts the pattern with each such value written as one it
    // knows. A refusal is raised where Acorn's own validator raised it, at the pattern's first
    // character, with the engine's own message.
    var value = null;
    try {
      value = new RegExp(pattern, flags);
    } catch (e) {
      var known = /[uv]/.test(flags) ? rapierKnownPropertyRewrite(pattern, data[14]) : null, accepted = false;
      if (known !== null) { try { new RegExp(known, flags); accepted = true; } catch (e2) {} }
      if (!accepted) { this.raiseRecoverable(start, e.message); }
    }

`;
export const STAND_INS = {
  'acorn-8.18.0.dist.acorn.js': [
    // The RegExp validator, after the Unicode script values, binary properties and general
    // categories, which stay: a rewriter over them takes its place.
    {from: '  var pp$1 = Parser.prototype;\n\n  // Track disjunction structure to determine whether a duplicate', to: '  // Object type used to represent tokens. Note that normally, tokens', with: ACORN_REWRITER},
    // readRegexp's call into the validator and its forgiving construction of the value.
    {from: '    // Validate pattern\n', to: '    return this.finishToken(types$1.regexp, {pattern: pattern, flags: flags, value: value})', with: ACORN_REGEXP},
  ],
};
export function standIn(name, source) {
  let text = source;
  for (const cut of STAND_INS[name] || []) {
    const at = text.indexOf(cut.from), end = text.indexOf(cut.to, at);
    if (at < 0 || text.indexOf(cut.from, at + 1) >= 0 || end < 0 || text.indexOf(cut.to, end + 1) >= 0)
      throw new Error(name + ': a stand-in cut does not match exactly once: ' + JSON.stringify(cut.from.slice(0, 60)));
    text = text.slice(0, at) + cut.with + text.slice(end);
  }
  return text;
}

// The one pass: the stand-in for `name` when it has one, then Terser. Unpinned -- what a probe
// proves before a new pair is pinned; without a name it is the Terser pass alone.
export const deriveVendor = (source, name = null) => minify_sync(name ? standIn(name, source) : source, structuredClone(BROWSER_MINIFY.tool.options)).code + '\n';

// The derived text of the vendor whose upstream span is `name`; null for a vendor the JSON does
// not list (it ships as upstream wrote it). Its span is named by the pin's `derived.name`.
export function minifyVendor(name, source) {
  const pin = BROWSER_MINIFY.vendors.find(row => row.upstream.name === name);
  if (!pin) return null;
  if (sha256(source) !== pin.upstream.sha256) throw new Error(name + ' is not the upstream agent/vendor/BROWSER-MINIFY.json pins: prove it (tools/probes/vendor-minify-equivalence.mjs, and tools/probes/acorn-engine-regexp.mjs for a stand-in), then pin both ends');
  const text = deriveVendor(source, name);
  if (sha256(text) !== pin.derived.sha256) throw new Error(pin.derived.name + ' came out as bytes nobody proved (Terser, its options or a stand-in changed): prove them, then pin them');
  return text;
}
