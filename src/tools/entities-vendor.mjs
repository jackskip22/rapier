// SPDX-License-Identifier: AGPL-3.0-only
// markdown-it's entity table re-encoded: the 2,125 names as plain text read into a Map, with a strict decoder for the inline rule and unescapeAll.
// Read from the upstream trie, so it cannot drift. Deliberately does not decode non-names (`&pm1;`) as the upstream walk did.
// Both ends pinned in agent/vendor/BROWSER-ENTITIES.json (tools/probes/markdown-it-entities.mjs). agent/vendor/markdownit.mjs embeds the derived bytes.
// node tools/entities-vendor.mjs [--write]
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BROWSER_ENTITIES = JSON.parse(readFileSync(new URL('../agent/vendor/BROWSER-ENTITIES.json', import.meta.url), 'utf8'));
const sha256 = text => createHash('sha256').update(text).digest('hex');

// The upstream text each edit replaces, verbatim; each must occur exactly once. The trie literal sits
// between the two halves of TRIE; DECODER runs from the first of the decoder's declarations to the last.
const TRIE = ['function ce(e){let t=atob(e),n=t.length&-2,r=new Uint16Array(n/2);for(let e=0,i=0;e<n;e+=2){let n=t.charCodeAt(e),a=t.charCodeAt(e+1);r[i++]=n|a<<8}return r}var le=ce(`',
  '`),C;(function(e){e[e.VALUE_LENGTH=49152]=`VALUE_LENGTH`,e[e.FLAG13=8192]=`FLAG13`,e[e.BRANCH_LENGTH=8064]=`BRANCH_LENGTH`,e[e.JUMP_TABLE=127]=`JUMP_TABLE`})(C||(C={}));'];
const DECODER = ['var E;(function(e){e[e.NUM=35]=`NUM`', 'function be(e){return ye(e,k.Strict)}'];
function once(text, anchor) {
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0) throw new Error('markdown-it entity derivation: expected exactly one ' + JSON.stringify(anchor.slice(0, 48)));
  return at;
}

// The trie as the upstream's own `ce` reads it: base64, then little-endian 16-bit words.
export function entityTrie(source) {
  const from = once(source, TRIE[0]) + TRIE[0].length, to = once(source, TRIE[1]);
  const bytes = Buffer.from(source.slice(from, to), 'base64'), words = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < words.length; i++) words[i] = bytes[2 * i] | bytes[2 * i + 1] << 8;
  return words;
}

// Every entry of the trie, read with the layout the upstream decoder walks: a node's top two bits are its
// value's length (0, 1 inline in the low 13 bits, 2 or 3 in the words after it), bit 13 marks a run of
// characters (no value) or a value the semicolon ends; bits 7-12 count branches and bits 0-6 hold a
// single branch character or a jump table's base. A name followed by `;` is a semicolon name; a value
// reached without one is a legacy name (`&amp` in attribute-less HTML), which markdown-it never asks for.
export function entityTable(source) {
  const tree = entityTrie(source), names = new Map(), legacy = new Map();
  const node = index => { if (!(index >= 0 && index < tree.length)) throw new Error('markdown-it entity trie: node ' + index + ' is outside the trie'); return tree[index]; };
  const record = (map, name, value) => {
    if (!/^[A-Za-z][A-Za-z\d]*$/.test(name) || map.has(name)) throw new Error('markdown-it entity trie: unexpected name ' + JSON.stringify(name));
    if (!value.isWellFormed() || [...value].length > 2) throw new Error('markdown-it entity trie: unexpected value for ' + name);
    map.set(name, value);
  };
  const visit = (index, name) => {
    if (name.length > 64) throw new Error('markdown-it entity trie: a path longer than any name at ' + JSON.stringify(name.slice(0, 64)));
    let word = node(index);
    const size = word >> 14;
    if (size === 0 && word & 0x2000) {
      const length = (word & 0x1f80) >> 7;
      let run = String.fromCharCode(word & 0x7f);
      for (let k = 0; k < length - 1; k++) run += String.fromCharCode(node(index + 1 + (k >> 1)) >> (k % 2 ? 8 : 0) & 255);
      return visit(index + 1 + (length >> 1), name + run);
    }
    if (size) {
      const value = size === 1 ? String.fromCodePoint(word & 0x1fff) : String.fromCodePoint(node(index + 1)) + (size === 3 ? String.fromCodePoint(node(index + 2)) : '');
      if (name.endsWith(';')) record(names, name.slice(0, -1), value);
      else record(word & 0x2000 ? names : legacy, name, value);
      if (size === 1) return; // an inline value is a leaf: its low bits are the value, never branches
    }
    const branches = (word & 0x1f80) >> 7, base = word & 0x7f, start = index + Math.max(1, size);
    if (!branches) { if (base) visit(start, name + String.fromCharCode(base)); return; }
    if (base) { for (let k = 0; k < branches; k++) { const to = node(start + k); if (to) visit(to - 1, name + String.fromCharCode(base + k)); } return; }
    const half = (branches + 1) >> 1;
    for (let k = 0; k < branches; k++) visit(node(start + half + k), name + String.fromCharCode(node(start + (k >> 1)) >> (k & 1) * 8 & 255));
  };
  visit(0, '');
  for (const [name, value] of legacy) if (names.get(name) !== value) throw new Error('markdown-it entity trie: legacy ' + name + ' has no semicolon twin of the same value');
  return {names, legacy};
}

const templateText = text => text.replace(/[\\`]/g, c => '\\' + c).replace(/\$\{/g, '$\\{').replace(/\r/g, '\\r');

// The derived bundle. `drop` leaves one name out: the probe's red, never a build's.
export function deriveEntities(source, {drop = null} = {}) {
  const {names} = entityTable(source);
  if (drop !== null && !names.delete(drop)) throw new Error('no entity ' + drop + ' to drop');
  // A value holding a letter, a digit or a space (only `fjlig`, "fj") cannot sit in the list, whose
  // names are letters and digits and whose separator is a space: it is seeded into the Map itself.
  const seeded = [...names].filter(([, value]) => /[A-Za-z\d ]/.test(value));
  const byValue = new Map();
  for (const [name, value] of names) if (!seeded.some(([n]) => n === name)) (byValue.get(value) || byValue.set(value, []).get(value)).push(name);
  const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const list = [...byValue.keys()].sort(order).map(value => value + byValue.get(value).sort(order).join(' ')).join('');
  const table = 'var le=new Map(' + (seeded.length ? JSON.stringify(seeded) : '') + ');{let e=/([^A-Za-z\\d ]+)|[A-Za-z\\d]+/g,t,n,r=`' + templateText(list) + '`;for(;n=e.exec(r);)n[1]?t=n[1]:le.set(n[0],t)}';
  const decoder = 'function be(e){return e.replace(/&(?:#(?:[xX]([\\dA-Fa-f]+)|(\\d+))|([A-Za-z\\d]+));/g,(e,t,n,r)=>r?le.has(r)?le.get(r):e:String.fromCodePoint(se(t?parseInt(t,16):+n)))}';
  const trieFrom = once(source, TRIE[0]), trieTo = once(source, TRIE[1]) + TRIE[1].length;
  const decoderFrom = once(source, DECODER[0]), decoderTo = once(source, DECODER[1]) + DECODER[1].length;
  if (!(trieTo <= decoderFrom)) throw new Error('markdown-it entity derivation: the trie must precede its decoder');
  return source.slice(0, trieFrom) + table + source.slice(trieTo, decoderFrom) + decoder + source.slice(decoderTo);
}

// The re-encoded span for the vendor whose upstream span is `name`, as {name, source}; null for a vendor
// the JSON does not list. Refuses an upstream that is not the pinned bytes and a derivation that is not.
export function entitiesVendor(name, source) {
  const pin = BROWSER_ENTITIES.vendors.find(row => row.upstream.name === name);
  if (!pin) return null;
  if (sha256(source) !== pin.upstream.sha256) throw new Error(name + ' is not the upstream agent/vendor/BROWSER-ENTITIES.json pins: prove it with tools/probes/markdown-it-entities.mjs, then pin both ends');
  const {names, legacy} = entityTable(source);
  if (names.size !== pin.entities.names || legacy.size !== pin.entities.legacy) throw new Error(name + ': the trie holds ' + names.size + ' names and ' + legacy.size + ' legacy forms, not the pinned ' + pin.entities.names + ' and ' + pin.entities.legacy);
  const text = deriveEntities(source);
  if (sha256(text) !== pin.derived.sha256 || Buffer.byteLength(text) !== pin.derived.bytes) throw new Error(pin.derived.name + ' came out as bytes nobody proved: prove them with tools/probes/markdown-it-entities.mjs, then pin them');
  return {name: pin.derived.name, source: text};
}

// agent/vendor/markdownit.mjs: the Node agent's module around exactly the bytes the page carries.
export const NODE_MIRROR = {path: 'agent/vendor/markdownit.mjs', head: '// MIT; exact embedded Rapier vendor source (tools/entities-vendor.mjs --write). See NOTICE.txt.\nconst exports = {}; const module = {exports};\n', tail: '\nexport default module.exports;\n'};
export const nodeMirror = text => NODE_MIRROR.head + text + NODE_MIRROR.tail;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const pin of BROWSER_ENTITIES.vendors) {
    const upstream = readFileSync(resolve(root, 'shell/vendor', pin.upstream.name), 'utf8'), {names, legacy} = entityTable(upstream), text = deriveEntities(upstream);
    console.log(JSON.stringify({upstream: {name: pin.upstream.name, bytes: Buffer.byteLength(upstream), sha256: sha256(upstream)}, names: names.size, legacy: legacy.size,
      derived: {name: pin.derived.name, bytes: Buffer.byteLength(text), sha256: sha256(text)}, pinned: sha256(upstream) === pin.upstream.sha256 && sha256(text) === pin.derived.sha256}, null, 1));
    if (process.argv.includes('--write')) {
      const derived = entitiesVendor(pin.upstream.name, upstream);
      writeFileSync(resolve(root, NODE_MIRROR.path), nodeMirror(derived.source));
      console.log('wrote ' + NODE_MIRROR.path + ' around ' + derived.name);
    }
  }
}
