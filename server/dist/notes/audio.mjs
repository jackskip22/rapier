import {noteFileName} from './model.mjs';
import {scanLinks, linkRemovalEnd} from './links.mjs';
import {addSiblingLinkLine, siblingHref, renameSiblings} from './sibling-links.mjs';

export const RECORDING_TYPES = Object.freeze(['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']);
import {streamingRecordingType, inspectRecording} from './recording-container.mjs';
export {streamingRecordingType, inspectRecording};
const TYPES = {'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/opus': 'opus', 'audio/aac': 'aac', 'audio/3gpp': '3gp', 'video/3gpp': '3gp', 'audio/3gpp2': '3g2', 'audio/amr': 'amr', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac'};
const EXT_TYPES = {webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac', '3gp': 'audio/3gpp', '3gpp': 'audio/3gpp', '3g2': 'audio/3gpp2', amr: 'audio/amr', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac'};
export function audioMime(mime, name = '') {
	const type = String(mime || '').split(';')[0].trim().toLowerCase();
	if (TYPES[type]) return type;
	if (type && !type.startsWith('audio/') && type !== 'application/octet-stream') return '';
	return EXT_TYPES[String(name).split('.').pop().toLowerCase()] || (type.startsWith('audio/') ? type : '');
}
export function validRecordingName(name) {
	return typeof name === 'string' && !!name && name !== '.' && name !== '..' && !/[\/\\\u0000-\u001f\u007f]/.test(name) && !name.startsWith('.');
}
export function recordingName(noteFile, existing = [], mime) {
	const type = audioMime(mime), ext = TYPES[type] || (type.startsWith('audio/') ? 'bin' : '');
	if (!ext) throw new Error('This recording container is not supported');
	const base = noteFileName(String(noteFile || '').replace(/\.md$/i, '')).slice(0, -3);
	const taken = new Set([...existing].map(n => String(n).toLowerCase()));
	let n = 1, name;
	do { name = base + '.' + n++ + '.' + ext; } while (taken.has(name.toLowerCase()));
	return name;
}
export function recordingHref(name) {
	if (!validRecordingName(name)) throw new Error('This recording name is not a sibling file');
	return siblingHref('audio', name);
}
export function recordingFromHref(href) {
	if (typeof href !== 'string' || !/^(?:\.\/)?audio\//.test(href) || /[?#]/.test(href)) return null;
	let name;
	try { name = decodeURIComponent(href.replace(/^\.\//, '').slice(6)); } catch (_) { return null; }
	return validRecordingName(name) ? name : null;
}
export function durationWords(duration) {
	if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return '--:--';
	const seconds = Math.floor(duration);
	return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
export function recordingLine(entry) {
	if (entry.duration != null && (typeof entry.duration !== 'number' || !Number.isFinite(entry.duration) || entry.duration < 0)) throw new Error('Recording duration is not known');
	const duration = entry.duration == null ? '' : ' ' + durationWords(entry.duration);
	return '[Recording' + duration + '](' + recordingHref(entry.name) + ')';
}
export function recordingsOf(text, links = null) {
	const s = String(text ?? ''), out = [];
	let offset = 0, line = 0;
	for (const link of Array.isArray(links) ? links : scanLinks(s)) {
		if (!['inline', 'reference', 'html'].includes(link.kind) || link.image || link.unresolvedDecode || link.anchor) continue;
		const name = recordingFromHref(link.dest); if (!name) continue;
		while (offset < link.start) { if (s[offset++] === '\n') line++; }
		const match = /(?:^|\s)(\d+):([0-5]\d)$/.exec(link.text);
		const value = match ? Number(match[1]) * 60 + Number(match[2]) : null;
		const duration = Number.isSafeInteger(value) ? value : null;
		const end = linkRemovalEnd(s, link) ?? link.end;
		out.push({...link, end, line, name, duration, label: link.text || name, href: recordingHref(name), raw: s.slice(link.start, end)});
	}
	return out;
}
export function addRecordingLine(text, entry) { return addSiblingLinkLine(text, recordingLine(entry)); }
export function removeRecordingLine(text, entry) {
	const s = String(text ?? '');
	const row = recordingsOf(s).find(r => r.name === entry.name && (entry.start == null || r.start === entry.start) && (entry.line == null || r.line === entry.line) && (entry.raw == null || r.raw === entry.raw));
	if (!row) return s;
	if (linkRemovalEnd(s, row) === null) throw new Error('This recording link is incomplete. Edit it in Source; its audio file was kept.');
	const a = Math.max(s.startsWith('\uFEFF') ? 1 : 0, s.lastIndexOf('\n', row.start - 1) + 1, s.lastIndexOf('\r', row.start - 1) + 1);
	const eol = /\r\n|\r|\n/g; eol.lastIndex = row.end; const end = eol.exec(s), b = end ? end.index + end[0].length : s.length;
	return !s.slice(a, row.start).trim() && !s.slice(row.end, b).trim() ? s.slice(0, a) + s.slice(b) : s.slice(0, row.start) + s.slice(row.end);
}
export function rewriteRecordingNames(text, mapping) {
	const s = String(text ?? ''), rows = recordingsOf(s);
	for (const link of scanLinks(s)) if (link.kind === 'inline' && !link.image && /^t=\d+$/.test(link.anchor || '') && !link.unresolvedDecode) {
		const name = recordingFromHref(link.dest); if (name) rows.push({...link, name});
	}
	return renameSiblings(s, rows, mapping, recordingHref);
}
export function recordingBytes(list) {
	let total = 0;
	for (const item of list || []) {
		const size = typeof item?.size === 'number' ? item.size : typeof item?.bytes === 'number' ? item.bytes : item?.bytes?.byteLength;
		if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(total + size)) throw new Error('Recording size is not known');
		total += size;
	}
	return total;
}
export function appendImportedRecording(text, noteFile, source, existing = []) {
	const mime = audioMime(source.mime, source.name);
	const name = recordingName(noteFile, existing, mime);
	const audio = {name, bytes: source.bytes, mime, duration: source.duration ?? null, note: noteFile};
	return {text: addRecordingLine(text, audio), audio};
}
export function findAudioAttachment(entries, note, path) {
	const clean = s => String(s).replace(/\\/g, '/').replace(/^\.\//, '');
	const wanted = clean(path), parent = clean(note.name).replace(/[^/]*$/, '');
	const scope = entries.filter(e => e.bytes && (e.from || '') === (note.from || ''));
	for (const name of [parent + wanted, wanted]) {
		const found = scope.filter(e => clean(e.name) === name);
		if (found.length) return found.length === 1 ? found[0] : null;
	}
	const found = scope.filter(e => clean(e.name).split('/').pop() === wanted.split('/').pop());
	return found.length === 1 ? found[0] : null;
}
