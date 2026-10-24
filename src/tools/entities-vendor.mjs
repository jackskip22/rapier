// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
const {minify_sync} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');

export const BROWSER_ENTITIES = JSON.parse(readFileSync(new URL('../agent/vendor/BROWSER-ENTITIES.json', import.meta.url), 'utf8'));
const sha256 = text => createHash('sha256').update(text).digest('hex');

const TRIE = ['var BASE91_INVERSE=', '})(BinTrieFlags||(BinTrieFlags={}));'];
const TRIE_DATA = ['var BASE91_INVERSE=', ';var BinTrieFlags;'];
const DECODER = ['var CharCodes;', 'function decodeHTMLStrict(htmlString){return decodeWithTrie(htmlString,true,false)}'];
function once(text, anchor) {
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0) throw new Error('markdown-it entity derivation: expected exactly one ' + JSON.stringify(anchor.slice(0, 48)));
  return at;
}

export function entityTrie(source) {
  const from = once(source, TRIE_DATA[0]), to = once(source, TRIE_DATA[1]);
  const words = new Script(source.slice(from, to) + ';htmlDecodeTree').runInNewContext({}, {timeout: 1000});
  if (Object.prototype.toString.call(words) !== '[object Uint16Array]' || words.length > 65536)
    throw new Error('markdown-it entity trie: unexpected decoded table');
  return words;
}

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
      record(names, name, value);
      if (!(word & 0x2000)) record(legacy, name, value);
      if (size === 1) return;
    }
    const branches = (word & 0x1f80) >> 7, base = word & 0x7f, start = index + Math.max(1, size);
    if (!branches) { if (base) visit(start, name + String.fromCharCode(base)); return; }
    if (base) { for (let k = 0; k < branches; k++) { const to = node(start + k); if (to) visit((start + branches + to - 1) & 65535, name + String.fromCharCode(base + k)); } return; }
    const half = (branches + 1) >> 1;
    for (let k = 0; k < branches; k++) visit((start + half + branches + node(start + half + k)) & 65535, name + String.fromCharCode(node(start + (k >> 1)) >> (k & 1) * 8 & 255));
  };
  visit(0, '');
  for (const [name, value] of legacy) if (names.get(name) !== value) throw new Error('markdown-it entity trie: legacy ' + name + ' has no semicolon twin of the same value');
  return {names, legacy};
}

const templateText = text => text.replace(/[\\`]/g, c => '\\' + c).replace(/\$\{/g, '$\\{').replace(/\r/g, '\\r');

export function deriveEntities(source, {drop = null} = {}) {
  const {names} = entityTable(source);
  if (drop !== null && !names.delete(drop)) throw new Error('no entity ' + drop + ' to drop');
  const seeded = [...names].filter(([, value]) => /[A-Za-z\d ]/.test(value));
  const byValue = new Map();
  for (const [name, value] of names) if (!seeded.some(([n]) => n === name)) (byValue.get(value) || byValue.set(value, []).get(value)).push(name);
  const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const list = [...byValue.keys()].sort(order).map(value => value + byValue.get(value).sort(order).join(' ')).join('');
  const table = 'var entityNames=new Map(' + (seeded.length ? JSON.stringify(seeded) : '') + ');{let e=/([^A-Za-z\\d ]+)|[A-Za-z\\d]+/g,t,n,r=`' + templateText(list) + '`;for(;n=e.exec(r);)n[1]?t=n[1]:entityNames.set(n[0],t)}';
  const decoder = 'function decodeHTMLStrict(e){return e.replace(/&(?:#(?:[xX]([\\dA-Fa-f]+)|(\\d+))|([A-Za-z\\d]+));/g,(e,t,n,r)=>r?entityNames.has(r)?entityNames.get(r):e:String.fromCodePoint(replaceCodePoint(t?parseInt(t,16):+n)))}';
  const trieFrom = once(source, TRIE[0]), trieTo = once(source, TRIE[1]) + TRIE[1].length;
  const decoderFrom = once(source, DECODER[0]), decoderTo = once(source, DECODER[1]) + DECODER[1].length;
  if (!(trieTo <= decoderFrom)) throw new Error('markdown-it entity derivation: the trie must precede its decoder');
  const compact = source.slice(0, trieFrom) + table + source.slice(trieTo, decoderFrom) + decoder + source.slice(decoderTo);
  return minify_sync(compact, structuredClone(BROWSER_ENTITIES.tool.options)).code + '\n';
}

export function entitiesVendor(name, source) {
  const pin = BROWSER_ENTITIES.vendors.find(row => row.upstream.name === name);
  if (!pin) return null;
  if (sha256(source) !== pin.upstream.sha256) throw new Error(name + ' is not the upstream agent/vendor/BROWSER-ENTITIES.json pins: prove its entity and parser equivalence, then pin both ends');
  const {names, legacy} = entityTable(source);
  if (names.size !== pin.entities.names || legacy.size !== pin.entities.legacy) throw new Error(name + ': the trie holds ' + names.size + ' names and ' + legacy.size + ' legacy forms, not the pinned ' + pin.entities.names + ' and ' + pin.entities.legacy);
  const text = deriveEntities(source);
  if (sha256(text) !== pin.derived.sha256 || Buffer.byteLength(text) !== pin.derived.bytes) throw new Error(pin.derived.name + ' came out as bytes nobody proved: prove their entity and parser equivalence, then pin them');
  return {name: pin.derived.name, source: text};
}

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
