// SPDX-License-Identifier: AGPL-3.0-only
const numbers = new WeakMap();
const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object';
const valid = (holder, key) => {
	const fields = object(holder) ? numbers.get(holder) : null, token = fields?.get(String(key));
	if (!token) return null;
	if (own(holder, key) && typeof holder[key] === 'number' && Object.is(holder[key], token.value)) return token;
	fields.delete(String(key));
	if (!fields.size) numbers.delete(holder);
	return null;
};
function keep(holder, key, token) {
	let fields = numbers.get(holder);
	if (!fields) numbers.set(holder, fields = new Map());
	fields.set(String(key), token);
}

export function parseJSON(text) {
	text = String(text);
	const value = JSON.parse(text), frames = [];
	let at = 0, root = null;
	const attach = token => {
		const frame = frames.at(-1);
		if (!frame) root = token;
		else {
			const key = frame.array ? String(frame.next++) : frame.key;
			if (token) frame.node.fields.set(key, token); else frame.node.fields.delete(key);
		}
	};
	const stringEnd = start => {
		let end = start + 1;
		while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
		return end + 1;
	};
	while (at < text.length) {
		const ch = text[at], frame = frames.at(-1);
		if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === ':') { at++; continue; }
		if (ch === ',') { if (frame && !frame.array) frame.keyNext = true; at++; continue; }
		if (ch === '}' || ch === ']') { const closed = frames.pop(); attach(closed.node.fields.size ? closed.node : null); at++; continue; }
		if (ch === '"') {
			const end = stringEnd(at);
			if (frame && !frame.array && frame.keyNext) { frame.key = JSON.parse(text.slice(at, end)); frame.keyNext = false; }
			else attach(null);
			at = end; continue;
		}
		if (ch === '{' || ch === '[') {
			const node = {fields: new Map()};
			frames.push({node, array: ch === '[', next: 0, key: null, keyNext: true}); at++; continue;
		}
		if (ch === '-' || ch >= '0' && ch <= '9') {
			const start = at;
			while (at < text.length && '0123456789eE+.-'.includes(text[at])) at++;
			const literal = text.slice(start, at), number = Number(literal);
			attach({literal, value: number}); continue;
		}
		attach(null); at += ch === 'f' ? 5 : 4;
	}
	const pending = [[value, root]];
	while (pending.length) {
		const [container, tokens] = pending.pop();
		if (!object(container) || !tokens?.fields) continue;
		for (const [key, token] of tokens.fields) {
			if (!token || !own(container, key)) continue;
			if (token.fields) pending.push([container[key], token]);
			else if (typeof container[key] === 'number' && Object.is(container[key], token.value)) keep(container, key, token);
		}
	}
	return value;
}

export function inheritJSONField(target, key, source, sourceKey = key) {
	const token = valid(source, sourceKey);
	if (token && own(target, key) && Object.is(target[key], token.value)) keep(target, key, token);
	else if (object(target)) numbers.get(target)?.delete(String(key));
	return target;
}
export function inheritJSON(target, ...sources) {
	if (!object(target)) return target;
	for (const source of sources) {
		if (!object(source)) continue;
		const keys = new Set([...(numbers.get(source)?.keys() || []), ...(numbers.get(target)?.keys() || [])]);
		for (const key of keys) if (own(source, key) && own(target, key) && Object.is(target[key], source[key])) inheritJSONField(target, key, source);
	}
	return target;
}
export function cloneJSON(value) {
	const clone = structuredClone(value), pending = [[value, clone]], seen = new Set();
	while (pending.length) {
		const [source, target] = pending.pop();
		if (!object(source) || !object(target) || seen.has(source)) continue;
		seen.add(source); inheritJSON(target, source);
		for (const key of Object.keys(source)) if (object(source[key])) pending.push([source[key], target[key]]);
	}
	return clone;
}
export function sliceJSON(array, start = 0, end = array.length) {
	const result = array.slice(start, end), number = Number(start);
	const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
	const first = integer < 0 ? Math.max(0, array.length + integer) : Math.min(array.length, integer);
	for (let at = 0; at < result.length; at++) inheritJSONField(result, String(at), array, String(first + at));
	return result;
}
export function appendJSON(array, rows) {
	for (let at = 0; at < rows.length; at++) {
		const key = String(array.length); array.push(rows[at]); inheritJSONField(array, key, rows, String(at));
	}
	return array;
}

export function numberJSON(value, holder = null, key = '', strict = false) {
	const token = valid(holder, key);
	if (token && Object.is(token.value, value)) return token.literal;
	if (!Number.isFinite(value)) throw Object.assign(new Error('A nonfinite JSON number has no retained source literal.'), {code: 'corrupt'});
	if (strict && Object.is(value, -0)) throw Object.assign(new Error('A negative zero has no retained canonical JSON source literal.'), {code: 'corrupt'});
	return Object.is(value, -0) ? '-0' : JSON.stringify(value);
}

function same(a, b, ah = null, ak = '', bh = null, bk = '', seen = new Map()) {
	if (typeof a === 'number' || typeof b === 'number') {
		if (!Object.is(a, b)) return false;
		const x = valid(ah, ak), y = valid(bh, bk);
		return !x || !y || x.literal === y.literal;
	}
	if (Object.is(a, b)) return true;
	if (!object(a) || !object(b) || Array.isArray(a) !== Array.isArray(b)) return false;
	if (seen.get(a)?.has(b)) return true;
	if (!seen.has(a)) seen.set(a, new Set()); seen.get(a).add(b);
	const ka = Object.keys(a), kb = Object.keys(b);
	if (ka.length !== kb.length || Array.isArray(a) && a.length !== b.length) return false;
	for (const key of ka) if (!own(b, key) || !same(a[key], b[key], a, key, b, key, seen)) return false;
	return true;
}
export const equalJSON = (a, b) => same(a, b);
export const equalJSONFields = (a, ak, b, bk = ak) => same(a?.[ak], b?.[bk], a, ak, b, bk);

export function stringifyJSON(value, space = 0, sorted = false, holder = null, key = '') {
	const gap = typeof space === 'string' ? space.slice(0, 10) : ' '.repeat(Math.min(10, Math.max(0, Math.trunc(Number(space)) || 0)));
	const output = [], ancestors = new Set(), events = [{value, holder, key, depth: 0}];
	while (events.length) {
		const event = events.pop();
		if (event.text !== undefined) { output.push(event.text); continue; }
		if (event.close) { ancestors.delete(event.close); continue; }
		const row = event.value, kind = typeof row;
		if (row === null || kind === 'boolean' || kind === 'string') { output.push(JSON.stringify(row)); continue; }
		if (kind === 'number') { output.push(numberJSON(row, event.holder, event.key)); continue; }
		if (kind === 'undefined' || kind === 'function' || kind === 'symbol') {
			if (event.depth === 0) return undefined;
			output.push('null'); continue;
		}
		if (kind === 'bigint') throw new TypeError('A BigInt is not a JSON value.');
		if (ancestors.has(row)) throw new TypeError('A cyclic value is not JSON.');
		ancestors.add(row);
		const array = Array.isArray(row), keys = array ? Array.from({length: row.length}, (_, i) => String(i))
			: Object.keys(row).filter(key => !['undefined', 'function', 'symbol'].includes(typeof row[key]));
		if (!array && sorted) keys.sort();
		const left = array ? '[' : '{', right = array ? ']' : '}'; output.push(left);
		events.push({close: row});
		if (!keys.length) { events.push({text: right}); continue; }
		const padding = gap.repeat(event.depth), indent = padding + gap;
		events.push({text: (gap ? '\n' + padding : '') + right});
		for (let i = keys.length - 1; i >= 0; i--) {
			const key = keys[i];
			events.push({value: row[key], holder: row, key, depth: event.depth + 1});
			events.push({text: (i ? ',' : '') + (gap ? '\n' + indent : '') + (array ? '' : JSON.stringify(key) + (gap ? ': ' : ':'))});
		}
	}
	return output.join('');
}
