// SPDX-License-Identifier: AGPL-3.0-only
import {RAPIER_HIGHLIGHT_COLORS} from '../agent/markdown-spec.mjs';

function _rapierExpandWholeRunMarks(raw, innerStart, innerEnd, helpers) {
	raw = String(raw || '');
	let s = innerStart, e = innerEnd;
	if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e) || s < 0) s = 0;
	if (!Number.isSafeInteger(e) || e < s) e = s;
	if (e > raw.length) e = raw.length;

	const escaped = at => {
		let n = 0;
		for (let i = at - 1; i >= 0 && raw.charAt(i) === '\\'; i--) n++;
		return n % 2 === 1;
	};
	const highlightOpenLen = at => {
		const markers = Object.values(RAPIER_HIGHLIGHT_COLORS);
		for (let i = 0; i < markers.length; i++) {
			const marker = markers[i];
			const L = 2 + marker.length;
			if (at >= L && raw.slice(at - L, at - marker.length) === '==' &&
					raw.slice(at - marker.length, at) === marker && !escaped(at - L)) return L;
		}
		if (at >= 2 && raw.slice(at - 2, at) === '==' && !escaped(at - 2)) return 2;
		return 0;
	};
	const pairs = [['**', '**'], ['__', '__'], ['++', '++'], ['~~', '~~'], ['*', '*'], ['_', '_']];

	const linkEnd = at => {
		const tail = raw.slice(at + 2), source = tail.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
		let pos = 0;
		while (pos < source.length && /[ \t\n]/.test(source.charAt(pos))) pos++;
		if (pos >= source.length) return -1;
		if (source.charAt(pos) !== ')') {
			const destination = helpers.parseLinkDestination(source, pos, source.length);
			if (!destination.ok) return -1;
			pos = destination.pos;
			const destinationEnd = pos;
			while (pos < source.length && /[ \t\n]/.test(source.charAt(pos))) pos++;
			if (pos > destinationEnd) {
				const title = helpers.parseLinkTitle(source, pos, source.length);
				if (title.ok) {
					pos = title.pos;
					while (pos < source.length && /[ \t\n]/.test(source.charAt(pos))) pos++;
				}
			}
		}
		if (source.charAt(pos) !== ')') return -1;
		// Helpers consume parser-normalized source; keep the caller's raw UTF-16 boundary.
		let consumed = pos + 1;
		for (const match of tail.matchAll(/\r\n/g)) {
			if (match.index >= consumed) break;
			consumed++;
		}
		return at + 2 + consumed;
	};

	while (true) {
		const h = highlightOpenLen(s);
		if (h && e + 2 <= raw.length && raw.slice(e, e + 2) === '==') { s -= h; e += 2; continue; }
		if (h) {
			const closeAt = raw.indexOf('==', s);
			if (closeAt >= 0 && closeAt <= e) { s -= h; continue; }
		}
		if (e + 2 <= raw.length && raw.slice(e, e + 2) === '==') {
			const openAt = raw.lastIndexOf('==', e - 1);
			if (openAt >= s && !escaped(openAt)) { e += 2; continue; }
		}

		let grew = false;
		for (let i = 0; i < pairs.length; i++) {
			const open = pairs[i][0], close = pairs[i][1];
			const Lo = open.length, Lc = close.length;
			if (s >= Lo && e + Lc <= raw.length && raw.slice(s - Lo, s) === open &&
					raw.slice(e, e + Lc) === close && !escaped(s - Lo)) {
				s -= Lo; e += Lc; grew = true; break;
			}
		}
		if (grew) continue;
		for (let i = 0; i < pairs.length; i++) {
			const open = pairs[i][0], close = pairs[i][1];
			const Lo = open.length;
			if (s < Lo || raw.slice(s - Lo, s) !== open || escaped(s - Lo)) continue;
			if (open === '*' && s >= 2 && raw.slice(s - 2, s) === '**') continue;
			if (open === '_' && s >= 2 && raw.slice(s - 2, s) === '__') continue;
			const closeAt = raw.indexOf(close, s);
			if (closeAt >= 0 && closeAt <= e) { s -= Lo; grew = true; break; }
		}
		if (grew) continue;
		for (let i = 0; i < pairs.length; i++) {
			const open = pairs[i][0], close = pairs[i][1];
			const Lo = open.length, Lc = close.length;
			if (e + Lc > raw.length || raw.slice(e, e + Lc) !== close) continue;
			if (close === '*' && raw.slice(e, e + 2) === '**') continue;
			if (close === '_' && raw.slice(e, e + 2) === '__') continue;
			const openAt = raw.lastIndexOf(open, e - Lo);
			if (openAt >= s && !escaped(openAt)) { e += Lc; grew = true; break; }
		}
		if (grew) continue;

		if (s >= 1 && raw.charAt(s - 1) === '[' && !escaped(s - 1) && raw.slice(e, e + 2) === '](') {
			const end = linkEnd(e);
			if (end >= 0) { s -= 1; e = end; continue; }
		}
		if (s >= 1 && raw.charAt(s - 1) === '[' && !escaped(s - 1)) {
			const mid = raw.indexOf('](', s);
			if (mid >= 0 && mid <= e) {
				const end = linkEnd(mid);
				if (end >= 0 && end <= e) { s -= 1; continue; }
			}
		}
		if (raw.slice(e, e + 2) === '](') {
			const end = linkEnd(e);
			const openAt = raw.lastIndexOf('[', e - 1);
			if (end >= 0 && openAt >= s && !escaped(openAt)) { e = end; continue; }
		}

		if (s >= 1 && e < raw.length && raw.charAt(s - 1) === '`' && raw.charAt(e) === '`' && !escaped(s - 1)) {
			s -= 1; e += 1; continue;
		}
		if (s >= 1 && raw.charAt(s - 1) === '`' && !escaped(s - 1)) {
			const closeAt = raw.indexOf('`', s);
			if (closeAt >= 0 && closeAt < e) { s -= 1; continue; }
		}
		if (e < raw.length && raw.charAt(e) === '`') {
			const openAt = raw.lastIndexOf('`', e - 1);
			if (openAt >= s && !escaped(openAt)) { e += 1; continue; }
		}
		break;
	}
	return {start: s, end: e, text: raw.slice(s, e)};
}

export { _rapierExpandWholeRunMarks };
