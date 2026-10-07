// Plain Markdown links, immutable sibling files. No document payload, no private note syntax.
import {attachmentFileName, isAttachmentName, NOTES_ATTACHMENT_DIR} from './model.mjs';
import {scanLinks, escapeLinkAttribute, linkRemovalEnd} from './links.mjs';
import {addSiblingLinkLine} from './sibling-links.mjs';
import {escapeImageAlt} from '../spec/md-assets.mjs';
import {ZIP_ENTRY_MEMORY_BYTES} from './zip.mjs';
import {attachmentSizeWords} from './size-words.mjs';

// The streamed File path is measured at 300 MB. Already-materialised import members keep
// their own 16 MiB bound; raising the File limit must not widen a whole-buffer importer.
export const ATTACHMENT_MAX_BYTES = 300_000_000;
export const ATTACHMENT_BATCH_BYTES = ATTACHMENT_MAX_BYTES;
export const ATTACHMENT_MEMORY_BYTES = ZIP_ENTRY_MEMORY_BYTES;
export const ATTACHMENT_LARGE_BYTES = 1024 * 1024;
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function attachmentHref(name) {
	if (!isAttachmentName(name)) throw new Error('This attachment name is not a portable sibling file.');
	return NOTES_ATTACHMENT_DIR + '/' + encode(name);
}
export function attachmentFromHref(href) {
	if (typeof href !== 'string' || !/^(?:\.\/)?attachments\//.test(href) || href.includes('?')) return null;
	let name;
	try { name = decodeURIComponent(href.replace(/^\.\//, '').slice(NOTES_ATTACHMENT_DIR.length + 1).split('#')[0]); }
	catch (_) { return null; }
	return isAttachmentName(name) ? name : null;
}
// Search can lend its scan of this same source; recognition still belongs to this owner.
// An Array callback supplies its index as argument two, not a borrowed scan.
export function attachmentsOf(text, links = null) {
	const source = String(text ?? '');
	return (Array.isArray(links) ? links : scanLinks(source)).flatMap(link => {
		if (!['inline', 'reference', 'wikilink', 'embed', 'html'].includes(link.kind) || link.unresolvedDecode) return [];
		const name = attachmentFromHref(link.dest);
		if (!name) return [];
		// scanLinks gives an element's span as its open tag: removal takes the whole paired element.
		// Incomplete HTML still references its file; only deletion of an uncertain span is refused.
		const end = linkRemovalEnd(source, link) ?? link.end;
		return [{...link, end, name, label: link.text || name, href: attachmentHref(name), raw: source.slice(link.start, end)}];
	});
}
export function attachmentLine({name, label = name}) {
	const word = escapeImageAlt(String(label || name).toWellFormed().replace(/[\r\n\u0000-\u001f\u007f]/g, ' '));
	return '[' + word + '](' + attachmentHref(name) + ')';
}
export function addAttachmentLine(text, entry) { return addSiblingLinkLine(text, attachmentLine(entry)); }
export function removeAttachmentLink(text, entry) {
	const s = String(text ?? ''), row = attachmentsOf(s).find(r => r.name === entry.name && r.start === entry.start && r.raw === entry.raw);
	if (!row) throw new Error('This file link changed. Its words and file were kept.');
	const end = linkRemovalEnd(s, row);
	if (end === null) throw new Error('This file link is incomplete. Edit it in Source; its file was kept.');
	return s.slice(0, row.start) + s.slice(end);
}
export function rewriteAttachmentNames(text, mapping) {
	let out = String(text ?? ''); const seen = new Set();
	for (const row of attachmentsOf(out).sort((a, b) => b.destStart - a.destStart)) {
		const name = mapping instanceof Map ? mapping.get(row.name) : mapping?.[row.name];
		if (!name || seen.has(row.destStart)) continue;
		seen.add(row.destStart); const href = attachmentHref(name);
		out = out.slice(0, row.destStart) + (row.kind === 'html' ? escapeLinkAttribute(href) : href) + out.slice(row.destEnd);
	}
	return out;
}
const KINDS = {pdf: 'PDF', xls: 'Spreadsheet', xlsx: 'Spreadsheet', ods: 'Spreadsheet', csv: 'Spreadsheet', tsv: 'Spreadsheet',
	doc: 'Document', docx: 'Document', odt: 'Document', rtf: 'Document', ppt: 'Presentation', pptx: 'Presentation', odp: 'Presentation',
	zip: 'Archive', gz: 'Archive', '7z': 'Archive', rar: 'Archive', tar: 'Archive',
	mp3: 'Audio', m4a: 'Audio', ogg: 'Audio', opus: 'Audio', wav: 'Audio', flac: 'Audio', aac: 'Audio',
	mp4: 'Video', webm: 'Video', mov: 'Video', mkv: 'Video',
	png: 'Image', jpg: 'Image', jpeg: 'Image', jxl: 'Image', svg: 'Image', gif: 'Image', webp: 'Image',
	txt: 'Text', md: 'Markdown', json: 'JSON', html: 'HTML', htm: 'HTML'};
const MIMES = {pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip',
	mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
	mp4: 'video/mp4', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
	gif: 'image/gif', jxl: 'image/jxl', webp: 'image/webp', txt: 'text/plain', md: 'text/markdown', json: 'application/json'};
const extension = name => /\.([a-z0-9]{1,24})$/i.exec(String(name))?.[1].toLowerCase() || '';
export function attachmentKind(name) { const ext = extension(name); return KINDS[ext] || (ext ? ext.toUpperCase() + ' file' : 'File'); }
export function attachmentMime(name) { return MIMES[extension(name)] || 'application/octet-stream'; }
// Size words live in notes/size-words.mjs (import-free for the backup worker); republished here.
export {attachmentSizeWords};
// Pure admission before File.arrayBuffer(), before allocation, before writing anything.
export function attachmentIntake(files, {streaming = false, memoryBackupRemaining = null} = {}) {
	const picked = Array.from(files || []), limit = streaming ? ATTACHMENT_MAX_BYTES : ATTACHMENT_MEMORY_BYTES; let bytes = 0;
	// Nothing is asked of a large admission: `large` is for the result's notice, which says how much was kept and that it outlives the note.
	const result = refusal => ({files: picked, bytes, refusal, large: !refusal && bytes >= ATTACHMENT_LARGE_BYTES});
	if (!picked.length) return result('No files were selected.');
	for (const file of picked) {
		if (typeof file?.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) return result('One selected file has no reliable name or size. Nothing was added.');
		bytes += file.size;
		// Size and limit in the same words, and where a larger file goes.
		if (file.size > limit) return result(file.name + ' is ' + attachmentSizeWords(file.size) + '; ' + (streaming ? 'one file can be at most ' + attachmentSizeWords(limit) + '.'
			: 'here one file can be at most ' + attachmentSizeWords(limit) + ', or ' + attachmentSizeWords(ATTACHMENT_MAX_BYTES) + ' through + → Add file.') + ' Nothing was added.');
	}
	if (!Number.isSafeInteger(bytes) || bytes > (streaming ? ATTACHMENT_BATCH_BYTES : ATTACHMENT_MEMORY_BYTES)) return result('These files total ' + attachmentSizeWords(bytes) + '; add at most ' + attachmentSizeWords(streaming ? ATTACHMENT_BATCH_BYTES : ATTACHMENT_MEMORY_BYTES) + ' at a time. Nothing was added.');
	if (memoryBackupRemaining !== null && (!Number.isSafeInteger(memoryBackupRemaining) || memoryBackupRemaining < bytes)) return result('These files would make the notes in this tab too large to back up. Nothing was added.');
	return result('');
}
// Capture the platform's File objects during the paste/drop event, before its protected store
// becomes unreadable. Text-only paste and image-only intake keep their existing editor owner.
export function attachmentTransfer(transfer) {
	const files = Array.from(transfer?.files || []);
	if (!files.length) for (const item of Array.from(transfer?.items || [])) {
		if (item.kind !== 'file') continue;
		const file = item.getAsFile?.(); if (file) files.push(file);
	}
	return files.length && files.some(f => !/^image\//i.test(f.type || '') && !['Image'].includes(attachmentKind(f.name))) ? files : [];
}
export function planAttachment(name, bytes, existing = [], options = {}) {
	if (!(bytes instanceof Uint8Array)) throw new TypeError('An attachment needs its original bytes.');
	const decision = attachmentIntake([{name, size: bytes.byteLength}]);
	if (decision.refusal) throw new Error(decision.refusal);
	const file = attachmentFileName(name, existing, options);
	return {name: file, path: NOTES_ATTACHMENT_DIR + '/' + file, bytes: bytes.slice(), label: name, href: attachmentHref(file)};
}

// One explicit file decision. The folder supplies every reference, never just a UI cache.
export function attachmentDeletionQuestion(report) {
	if (!isAttachmentName(report?.name) || !Number.isSafeInteger(report.size) || report.size < 0 ||
		!['live', 'trash', 'history'].every(key => Array.isArray(report[key]))) throw new Error('The file deletion review is incomplete.');
	const {name, size, live, trash, history} = report;
	// What goes and whose links break, by name; backups still hold it; no undo. No stamp, no raw byte count.
	const names = rows => [...new Set(rows.map(row => row.file))].join(', ');
	const where = [live.length ? names(live) : '', trash.length ? 'the recycle bin’s ' + names(trash) : '',
		history.length ? history.length + (history.length === 1 ? ' earlier version of ' : ' earlier versions of ') + names(history) : ''].filter(Boolean);
	return {title: 'delete ' + name + ' forever?',
		message: name + ' (' + attachmentSizeWords(size) + ') leaves saved files' + (where.length ? ', and its links stop working in ' + where.join('; ') + '.' : '; no note links to it.') + ' backups made before still hold it. there is no undo.',
		cancelLabel: 'Keep file', confirmLabel: 'Delete forever', destructive: true};
}
export function attachmentReferenceWords(refs) {
	if (!refs) return 'References could not be checked — review required before deletion';
	const past = refs.history.length;
	return refs.live.length + ' live ' + (refs.live.length === 1 ? 'note' : 'notes') + ' · ' + refs.trash.length + ' in the recycle bin · ' + past + ' retained ' + (past === 1 ? 'version' : 'versions') + (past ? ' will lose this file if deleted' : '');
}
