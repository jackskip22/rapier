// SPDX-License-Identifier: AGPL-3.0-only
// their dates are draw/vendor-notices/luidl-huber-ornaments-CC0.txt). Two shapes, each a file the plug-in door brings:
export const ORNAMENT_LIMITS = Object.freeze({ side: 8000, template: 900000, item: 600000, items: 1500, pack: 4000000, text: 200 });

const ID = /^[a-z][a-z0-9-]{0,47}$/, NAME = /^[\p{L}\p{N} ]{1,40}$/u;
const whole = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

export function ornamentPath(d, limit) {
	if (typeof d !== 'string' || !d.length || d.length > limit) return false;
	let i = 0, outlines = 0;
	const n = d.length, digits = () => { const s = i; while (i < n && d.charCodeAt(i) >= 48 && d.charCodeAt(i) <= 57) i++; return i > s && i - s < 8; };
	const number = () => { if (d[i] === '-') i++; return digits(); };
	while (i < n) {
		if (d[i] !== 'M') return false;
		i++;
		if (!number()) return false;
		if (d[i] === ' ') i++; else if (d[i] !== '-') return false;
		if (!number()) return false;
		let command = '', first = true;
		for (;;) {
			const c = d[i];
			if (c === 'z') { i++; break; }
			if (c === 'l' || c === 'c') { command = c; i++; first = true; }
			else if (!command) return false;
			const count = command === 'l' ? 2 : 6;
			for (let k = 0; k < count; k++) {
				if (k > 0 || !first) { if (d[i] === ' ') i++; else if (d[i] !== '-') return false; }
				if (!number()) return false;
			}
			first = false;
			if (i >= n) return false;
			if (d[i] === ' ' || d[i] === '-') continue;
		}
		outlines++;
	}
	return outlines > 0;
}

function parse(raw, limit) {
	try {
		if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) raw = new TextDecoder('utf-8', { fatal: true }).decode(raw);
		if (typeof raw === 'string') { if (raw.length > limit) return null; raw = JSON.parse(raw); }
	} catch (_) { return null; }
	return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}
const text = value => typeof value === 'string' && value.length <= ORNAMENT_LIMITS.text ? value : '';

export function admitTemplate(raw) {
	raw = parse(raw, ORNAMENT_LIMITS.template + 4096);
	if (!raw || !ID.test(raw.id) || typeof raw.name !== 'string' || !NAME.test(raw.name) || raw.kind !== 'template') return null;
	const { w, h, frame, content } = raw;
	if (!whole(w, 1, ORNAMENT_LIMITS.side) || !whole(h, 1, ORNAMENT_LIMITS.side) || !frame || typeof frame !== 'object' || !ornamentPath(frame.path, ORNAMENT_LIMITS.template)) return null;
	if (!content || typeof content !== 'object' || !whole(content.x, 0, w - 1) || !whole(content.y, 0, h - 1) || !whole(content.w, 1, w - content.x) || !whole(content.h, 1, h - content.y)) return null;
	return Object.freeze({ id: raw.id, name: raw.name, kind: 'template', source: text(raw.source), w, h, frame: Object.freeze({ path: frame.path }), content: Object.freeze({ x: content.x, y: content.y, w: content.w, h: content.h }), notes: text(raw.notes) });
}

export function admitElements(raw) {
	raw = parse(raw, ORNAMENT_LIMITS.pack + 65536);
	if (!raw || !ID.test(raw.id) || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > ORNAMENT_LIMITS.items) return null;
	const items = [], seen = new Set();
	let bytes = 0;
	for (const item of raw.items) {
		if (!item || typeof item !== 'object' || !ID.test(item.id) || seen.has(item.id) || typeof item.name !== 'string' || !NAME.test(item.name) || typeof item.group !== 'string' || !NAME.test(item.group)) return null;
		if (!whole(item.w, 1, ORNAMENT_LIMITS.side) || !whole(item.h, 1, ORNAMENT_LIMITS.side) || !ornamentPath(item.path, ORNAMENT_LIMITS.item) || (item.tile !== undefined && item.tile !== true)) return null;
		bytes += item.path.length;
		if (bytes > ORNAMENT_LIMITS.pack) return null;
		seen.add(item.id);
		items.push(Object.freeze(item.tile ? { id: item.id, name: item.name, group: item.group, w: item.w, h: item.h, path: item.path, tile: true } : { id: item.id, name: item.name, group: item.group, w: item.w, h: item.h, path: item.path }));
	}
	return Object.freeze({ id: raw.id, items: Object.freeze(items) });
}
