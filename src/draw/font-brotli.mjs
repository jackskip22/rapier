// SPDX-License-Identifier: AGPL-3.0-only
import {brotliDictionary} from './font-brotli-dictionary.mjs';

function invalid(detail) { throw Object.assign(new Error('The WOFF2 Brotli stream is invalid: ' + detail + '.'), {code: 'drawing_font_invalid'}); }
class Bits {
	constructor(bytes) { this.bytes = bytes; this.at = 0; this.word = 0; this.count = 0; }
	peek(n) {
		while (this.count < n && this.at < this.bytes.length) { this.word |= this.bytes[this.at++] << this.count; this.count += 8; }
		if (n > 24) invalid('bit width');
		return this.word & ((1 << n) - 1);
	}
	read(n) { const value = this.peek(n); if (this.count < n) invalid('truncated bits'); this.word >>>= n; this.count -= n; return value; }
	drop(n) { if (this.count < n) invalid('truncated prefix code'); this.word >>>= n; this.count -= n; }
	align() { if (this.read(this.count & 7)) invalid('nonzero padding'); }
	part(length) {
		if (this.count & 7) invalid('unaligned byte block');
		const at = this.at - this.count / 8;
		if (length < 0 || at > this.bytes.length - length) invalid('truncated byte block');
		this.at = at + length; this.count = 0; this.word = 0;
		return this.bytes.subarray(at, this.at);
	}
	end() { this.align(); if (this.count || this.at !== this.bytes.length) invalid('trailing data'); }
}

const reversed = new Uint16Array(32768);
for (let value = 1; value < 32768; value++) reversed[value] = (reversed[value >> 1] >> 1) | ((value & 1) << 14);
function prefix(lengths, allowSingle = false) {
	const counts = new Uint16Array(16); let symbols = 0, lone = -1, space = 32768;
	for (let i = 0; i < lengths.length; i++) if (lengths[i]) { const n = lengths[i]; if (n > 15) invalid('prefix length'); counts[n]++; symbols++; lone = i; space -= 32768 >> n; }
	if (symbols === 1 && allowSingle) return {read: () => lone};
	if (symbols < 2 || space) invalid('incomplete prefix tree');
	const offsets = new Uint16Array(16), sorted = new Uint16Array(symbols);
	for (let n = 1; n < 16; n++) offsets[n] = offsets[n - 1] + counts[n - 1];
	for (let symbol = 0; symbol < lengths.length; symbol++) if (lengths[symbol]) sorted[offsets[lengths[symbol]]++] = symbol;
	const fast = new Int32Array(256), next = new Uint16Array(16); let code = 0, index = 0;
	for (let n = 1; n < 16; n++) { code = (code + counts[n - 1]) * 2; next[n] = code; }
	for (let symbol = 0; symbol < lengths.length; symbol++) {
		const n = lengths[symbol]; if (!n || n > 8) continue;
		const value = reversed[next[n]++] >> (15 - n);
		for (let fill = value; fill < 256; fill += 1 << n) fast[fill] = (n << 16) | (symbol + 1);
	}
	let first = 0;
	for (let n = 1; n <= 8; n++) { index += counts[n]; first = (first + counts[n]) * 2; }
	const firstLong = first, indexLong = index;
	return {read(bits) {
		const entry = fast[bits.peek(8)];
		if (entry > 0) { bits.drop(entry >>> 16); return (entry & 65535) - 1; }
		if (bits.count < 8) invalid('truncated prefix code');
		const value = reversed[bits.peek(15)];
		let start = firstLong, at = indexLong;
		for (let n = 9; n < 16; n++) {
			const code = value >> (15 - n), count = counts[n];
			if (code - start < count) {
				if (bits.count < n) invalid('truncated bits');
				bits.word >>>= n; bits.count -= n;
				return sorted[at + code - start];
			}
			at += count; start = (start + count) * 2;
		}
		invalid('missing prefix branch');
	}};
}
function readPrefix(bits, alphabet) {
	const kind = bits.read(2), lengths = new Uint8Array(alphabet);
	if (kind === 1) {
		const count = bits.read(2) + 1, width = Math.ceil(Math.log2(alphabet)), symbols = [];
		for (let i = 0; i < count; i++) { const value = bits.read(width); if (value >= alphabet || symbols.includes(value)) invalid('simple prefix symbol'); symbols.push(value); }
		if (count === 1) return {read: () => symbols[0]};
		const sizes = count === 2 ? [1, 1] : count === 3 ? [1, 2, 2] : bits.read(1) ? [1, 2, 3, 3] : [2, 2, 2, 2];
		for (let i = 0; i < count; i++) lengths[symbols[i]] = sizes[i];
		return prefix(lengths);
	}
	const order = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15], codes = new Uint8Array(18);
	let space = 32, nonzero = 0;
	for (let i = kind; i < order.length && space; i++) {
		const low = bits.read(2), n = low === 3 ? bits.read(1) ? bits.read(1) ? 5 : 1 : 2 : [0, 4, 3][low];
		codes[order[i]] = n; if (n) { space -= 32 >> n; nonzero++; }
		if (space < 0) invalid('code length tree');
	}
	if (space && nonzero !== 1) invalid('incomplete code length tree');
	const tree = prefix(codes, true); space = 32768;
	let at = 0, previous = 8, previousCode = -1, repeat = 0;
	while (at < alphabet && space) {
		const value = tree.read(bits); let count = 1, length = value;
		if (value >= 16) {
			const width = value === 16 ? 2 : 3, next = (value === previousCode ? 2 ** width * (repeat - 2) : 0) + bits.read(width) + 3;
			count = next - (value === previousCode ? repeat : 0); repeat = next; length = value === 16 ? previous : 0;
		} else { repeat = 0; if (value) previous = value; }
		if (count < 1 || at > alphabet - count) invalid('code length repeat');
		lengths.fill(length, at, at + count); at += count; previousCode = value;
		if (length) space -= count * (32768 >> length);
		if (space < 0) invalid('oversubscribed prefix tree');
	}
	if (space) invalid('incomplete prefix lengths');
	return prefix(lengths);
}

function count256(bits) { if (!bits.read(1)) return 1; const n = bits.read(3); return n ? 2 ** n + bits.read(n) + 1 : 2; }
const blockBits = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 9, 10, 11, 12, 13, 24];
function bases(widths, first) { let at = first; return widths.map(n => { const base = at; at += 2 ** n; return base; }); }
const blockBases = bases(blockBits, 1);
function blockState(bits) {
	const count = count256(bits), typeTree = count > 1 ? readPrefix(bits, count + 2) : null, lengthTree = count > 1 ? readPrefix(bits, 26) : null;
	const length = () => { const symbol = lengthTree.read(bits); return blockBases[symbol] + bits.read(blockBits[symbol]); };
	let remaining = count > 1 ? length() : 0x7fffffff, current = 0, previous = 1;
	return {count, next() {
		if (!remaining) {
			const symbol = typeTree.read(bits), type = symbol === 0 ? previous : symbol === 1 ? (current + 1) % count : symbol - 2;
			if (type >= count || type === current) invalid('block type');
			previous = current; current = type; remaining = length();
		}
		remaining--; return current;
	}};
}
function contextMap(bits, size) {
	const count = count256(bits), map = new Uint8Array(size);
	if (count > 1) {
		const runs = bits.read(1) ? bits.read(4) + 1 : 0, tree = readPrefix(bits, count + runs); let at = 0;
		while (at < size) {
			const symbol = tree.read(bits);
			if (symbol && symbol <= runs) { const repeat = 2 ** symbol + bits.read(symbol); if (at > size - repeat) invalid('context map repeat'); at += repeat; }
			else map[at++] = symbol ? symbol - runs : 0;
		}
		if (bits.read(1)) {
			const values = Uint8Array.from({length: 256}, (_, i) => i);
			for (let i = 0; i < size; i++) { const index = map[i], value = values[index]; values.copyWithin(1, 0, index); values[0] = value; map[i] = value; }
		}
	}
	return {count, map};
}

const utf8 = [0,0,0,0,0,0,0,0,0,4,4,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,12,16,12,12,20,12,16,24,28,12,12,32,12,36,12,44,44,44,44,44,44,44,44,44,44,32,32,24,40,28,12,12,48,52,52,52,48,52,52,52,48,52,52,52,52,52,48,52,52,52,52,52,48,52,52,52,52,52,24,12,28,12,12,12,56,60,60,60,56,60,60,60,56,60,60,60,60,60,56,60,60,60,60,60,56,60,60,60,60,60,24,12,28,12,0];
const signed = new Uint8Array(256), first = new Uint8Array(256), second = new Uint8Array(256);
for (let value = 0; value < 256; value++) {
	signed[value] = !value ? 0 : value < 16 ? 1 : value < 64 ? 2 : value < 128 ? 3 : value < 192 ? 4 : value < 240 ? 5 : value < 255 ? 6 : 7;
	first[value] = value < 128 ? utf8[value] : (value < 192 ? 0 : 2) | (value & 1);
	second[value] = value >= 224 ? 2 : value < 33 || value >= 127 ? 0 : value >= 97 && value <= 122 ? 3 : value >= 65 && value <= 90 || value >= 48 && value <= 57 ? 2 : 1;
}
const insertBits = [0,0,0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,7,8,9,10,12,14,24], insertBases = bases(insertBits, 0);
const copyBits = [0,0,0,0,0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,7,8,9,10,24], copyBases = bases(copyBits, 2);
const insertRange = [0,0,0,0,8,8,0,16,8,16,16], copyRange = [0,8,0,8,0,8,16,0,16,8,16];

export function decodeBrotli(bytes, limit, {dictionary = true} = {}) {
	if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(limit) || limit < 0 || limit > 128 * 1024 * 1024) invalid('output limit');
	const bits = new Bits(bytes); let windowBits = 16;
	if (bits.read(1)) { const value = bits.read(3); if (value) windowBits = 17 + value; else { const value = bits.read(3); if (value === 1) invalid('window size'); windowBits = value ? 8 + value : 17; } }
	const window = 2 ** windowBits - 16, out = new Uint8Array(limit), distances = new Int32Array([4, 11, 15, 16]);
	let at = 0, last = false, commands = 0;
	while (!last) {
		last = !!bits.read(1); if (last && bits.read(1)) break;
		const nibbles = bits.read(2) + 4;
		if (nibbles === 7) {
			if (bits.read(1)) invalid('metadata reserved bit');
			const width = bits.read(2), encoded = bits.read(width * 8);
			if (width > 1 && encoded < 2 ** ((width - 1) * 8)) invalid('metadata length');
			bits.align(); bits.part(width ? encoded + 1 : 0); continue;
		}
		const encoded = bits.read(nibbles * 4), end = at + encoded + 1;
		if (nibbles > 4 && encoded < 2 ** ((nibbles - 1) * 4)) invalid('meta-block length');
		if (end > limit) invalid('expanded size exceeds the font directory');
		if (!last && bits.read(1)) { bits.align(); out.set(bits.part(end - at), at); at = end; continue; }
		const literals = blockState(bits), lengths = blockState(bits), matches = blockState(bits), postfix = bits.read(2), direct = bits.read(4) * 2 ** postfix;
		const modes = Array.from({length: literals.count}, () => bits.read(2)), literalMap = contextMap(bits, literals.count * 64), distanceMap = contextMap(bits, matches.count * 4);
		const literalTrees = Array.from({length: literalMap.count}, () => readPrefix(bits, 256)), lengthTrees = Array.from({length: lengths.count}, () => readPrefix(bits, 704)), distanceTrees = Array.from({length: distanceMap.count}, () => readPrefix(bits, 16 + direct + 48 * 2 ** postfix));
		const contextTrees = Array.from(literalMap.map, tree => literalTrees[tree]);
		while (at < end) {
			if (++commands > Math.max(1048576, limit * 2)) invalid('excessive command count');
			const command = lengthTrees[lengths.next()].read(bits), range = command >> 6, insertCode = insertRange[range] + ((command >> 3) & 7), copyCode = copyRange[range] + (command & 7);
			const insert = insertBases[insertCode] + bits.read(insertBits[insertCode]), copy = copyBases[copyCode] + bits.read(copyBits[copyCode]);
			if (at > end - insert) invalid('literal count exceeds the meta-block');
			for (let n = 0; n < insert; n++) {
				const block = literals.next(), mode = modes[block], a = at > 0 ? out[at - 1] : 0, b = at > 1 ? out[at - 2] : 0;
				const id = mode === 0 ? a & 63 : mode === 1 ? a >> 2 : mode === 3 ? signed[a] * 8 + signed[b] : first[a] | second[b];
				out[at++] = contextTrees[block * 64 + id].read(bits);
			}
			if (at === end) break;
			let code = 0, distance = distances[0];
			if (command >= 128) {
				const block = matches.next(); code = distanceTrees[distanceMap.map[block * 4 + Math.min(copy - 2, 3)]].read(bits);
				if (code < 4) distance = distances[code];
				else if (code < 16) { const pair = code < 10 ? code - 4 : code - 10; distance = distances[code < 10 ? 0 : 1] + (pair & 1 ? 1 : -1) * (1 + (pair >> 1)); }
				else if (code < 16 + direct) distance = code - 15;
				else {
					const value = code - direct - 16, high = value >> postfix, low = value & ((1 << postfix) - 1), width = 1 + (high >> 1), offset = ((2 + (high & 1)) << width) - 4;
					distance = ((offset + bits.read(width)) << postfix) + low + direct + 1;
				}
			}
			if (distance <= 0) invalid('nonpositive distance');
			const maximum = Math.min(window, at);
			if (distance > maximum) {
				if (!dictionary) invalid('dictionary reference in the dictionary bootstrap');
				const word = brotliDictionary(copy, distance - maximum - 1, decodeBrotli);
				if (at > end - word.length) invalid('dictionary word exceeds the meta-block');
				out.set(word, at); at += word.length;
			} else {
				if (at > end - copy) invalid('copy exceeds the meta-block');
				if (code) { distances[3] = distances[2]; distances[2] = distances[1]; distances[1] = distances[0]; distances[0] = distance; }
				if (copy > 32 && distance >= copy) { out.copyWithin(at, at - distance, at - distance + copy); at += copy; }
				else for (let from = at - distance, stop = at + copy; at < stop;) out[at++] = out[from++];
			}
		}
	}
	bits.end(); return at === out.length ? out : out.slice(0, at);
}
