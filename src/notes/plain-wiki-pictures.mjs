// SPDX-License-Identifier: AGPL-3.0-only
import {scanLinks} from './links.mjs';
import {attachmentHref, attachmentFromHref, attachmentKind} from './attachments.mjs';
import {isAttachmentName, isNoteFile} from './model.mjs';

const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const ALIAS = /^[^\[\]|\\\r\n]*$/;
export const isTopPicture = name => typeof name === 'string' && !isNoteFile(name) && isAttachmentName(name) && attachmentKind(name) === 'Image';

function swap(text, rows) {
	let out = '', at = 0;
	for (const row of rows) { out += text.slice(at, row.start) + row.text; at = row.end; }
	return out + text.slice(at);
}
function mapOnce(text, top, direction) {
	const rows = [];
	for (const link of scanLinks(text)) {
		const raw = text.slice(link.start, link.end);
		if (direction === 'in') {
			if (link.kind !== 'embed' || !top.has(link.dest)) continue;
			const alias = link.alias || '';
			if (!ALIAS.test(alias) || raw !== '![[' + link.dest + (alias ? '|' + alias : '') + ']]') continue;
			rows.push({start: link.start, end: link.end, text: '![' + alias + '](' + attachmentHref(link.dest) + ')'});
		} else {
			if (link.kind !== 'inline' || !link.image) continue;
			const name = attachmentFromHref(link.dest);
			if (!name || !top.has(name) || !ALIAS.test(link.text || '') || raw !== '![' + (link.text || '') + '](' + attachmentHref(name) + ')') continue;
			rows.push({start: link.start, end: link.end, text: '![[' + name + (link.text ? '|' + link.text : '') + ']]'});
		}
	}
	return rows.length ? swap(text, rows) : text;
}
export function wikiPictureText(text, top, direction) {
	if (!top.size || !text.includes(direction === 'in' ? '![[' : '](attachments/')) return text;
	const mapped = mapOnce(text, top, direction);
	return mapped !== text && mapOnce(mapped, top, direction === 'in' ? 'out' : 'in') === text ? mapped : text;
}
function mapBytes(bytes, top, direction) {
	let text;
	try { text = td.decode(bytes); } catch { return bytes; }
	const mapped = wikiPictureText(text, top, direction);
	return mapped === text ? bytes : te.encode(mapped);
}

export function withWikiPictures(store) {
	let top = null;
	const topNames = async () => top ?? (top = new Set((await store.list()).filter(row => isTopPicture(row.name)).map(row => row.name)));
	const wrapped = {
		...store,
		async list() {
			const rows = await store.list();
			top = new Set(rows.filter(row => isTopPicture(row.name)).map(row => row.name));
			return top.size ? rows.map(row => isNoteFile(row.name) ? {name: row.name, rev: row.rev} : row) : rows;
		},
		async get(name) {
			const got = await store.get(name);
			return got && isNoteFile(name) ? {...got, bytes: mapBytes(got.bytes, await topNames(), 'in')} : got;
		},
		async put(name, bytes, condition) { return store.put(name, isNoteFile(name) ? mapBytes(bytes, await topNames(), 'out') : bytes, condition); },
	};
	if (typeof store.area === 'function') wrapped.area = folder => folder !== 'attachments' ? store.area(folder) : (() => {
		const attachments = store.area('attachments'), where = new Map();
		const pick = name => where.get(name) === 'top' ? store : attachments;
		return {
			...attachments,
			async list() {
				const kept = await attachments.list(), names = new Set(kept.map(row => row.name));
				where.clear();
				const atTop = (await store.list()).filter(row => isTopPicture(row.name) && !names.has(row.name));
				for (const row of atTop) where.set(row.name, 'top');
				return [...kept, ...atTop];
			},
			get: name => pick(name).get(name),
			put: (name, bytes, condition) => pick(name).put(name, bytes, condition),
			remove: (name, condition) => pick(name).remove(name, condition),
		};
	})();
	return Object.freeze(wrapped);
}
