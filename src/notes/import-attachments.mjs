// A relocation plan, not a write. One root and exact source path identify an object;
// two uses share that object, two different exports never share it by accident.
import {scanLinks, normalizeSourcePath, resolveAssetPath, resolveLink, escapeLinkAttribute} from './links.mjs';
import {attachmentHref, planAttachment} from './attachments.mjs';
import {isCodeFile} from './model.mjs';

const root = row => String(row.rootId || '');
const sourceName = row => String(row.sourceName || row.name || '');
const key = (a, b) => JSON.stringify([a, b]);
const fileLabel = row => {
	const leaf = row.sourceName.split('/').pop(), extension = /\.[^.]{1,24}$/.exec(leaf)?.[0] || '';
	const label = row.label || leaf;
	return extension && !label.toLowerCase().endsWith(extension.toLowerCase()) ? label + extension : label;
};
// The recording owner already reported these exact source paths. The attachment pass and
// record's prose share this match; neither hides another folder's same-named file. The record
// still retains the unresolved-link descriptor, but need not say its warning a second time.
export function missingRecordingPaths(note) {
	return new Set((note.warnings || []).filter(row => row?.code === 'recording_missing' && typeof row.sourcePath === 'string')
		.map(row => resolveAssetPath(note.sourceName, row.sourcePath)).filter(path => !path.outside && path.path).map(path => path.path));
}
export function importAttachments(notes, sources, {existing = [], ascii = false} = {}) {
	const paths = new Map(), aliases = new Map(), byInput = new Map(), objects = [], used = [], files = [], unread = [], taken = [...existing];
	for (const original of sources || []) {
		const bytes = original.bytes instanceof Uint8Array ? original.bytes : original.bytes instanceof ArrayBuffer ? new Uint8Array(original.bytes) : null;
		if (!bytes || original.oversize || original.unreadable && original.unreadable !== 'no readable text') continue;
		const path = normalizeSourcePath(sourceName(original));
		if (path.outside || !path.path) continue;
		const id = original.inputId && key(root(original), original.inputId);
		let row = id && byInput.get(id);
		if (!row) {
			row = {...original, bytes, sourceName: sourceName(original)};
			objects.push(row); if (id) byInput.set(id, row);
			const k = key(root(row), path.path), found = paths.get(k) || []; found.push(row); paths.set(k, found);
		}
		if (original.retainUnlinked) row.retainUnlinked = true;
		if (original.label) row.label = original.label;
		if (original.ownerSource) row.ownerSource = original.ownerSource;
		for (const alias of original.sourceAliases || []) {
			if (typeof alias !== 'string' || !alias) continue;
			const k = key(root(row), alias), found = aliases.get(k) || []; if (!found.includes(row)) found.push(row); aliases.set(k, found);
		}
	}
	const stored = new Map(), finalNames = new Set(notes.map(n => n.file));
	const result = notes.map(note => {
		if (note.exactBackup || isCodeFile(note.file)) return note;
		let text = note.text; const edits = new Map(), warnings = [...(note.warnings || [])], linked = [];
		const missingRecordings = missingRecordingPaths(note);
		for (const link of scanLinks(text)) {
			if (link.unresolvedDecode || !link.dest || /^(?:data:|#)/i.test(link.dest)) continue;
			// Finalized links between notes are already owned by importLinkPatches.
			// Destinations may be percent-escaped, reference links or extensionless wiki links.
			// Compare their resolved identity, not their spelling, before considering attachment bytes.
			if (!link.image && resolveLink(link, {from: note.file, files: finalNames, sourceFiles: true}).file) continue;
			const aliased = aliases.get(key(root(note), link.dest));
			const resolved = aliased ? {} : resolveAssetPath(note.sourceName, link.dest);
			if (resolved.outside) continue;
			let candidates = aliased || paths.get(key(root(note), resolved.path || '')) || [];
			if (!candidates.length && ['wikilink', 'embed'].includes(link.kind)) {
				// Wiki file lookup is an established convention; never guess between two matches.
				const wanted = normalizeSourcePath(link.dest).path;
				if (wanted) candidates = objects.filter(row => root(row) === root(note) && (row.sourceName === wanted || row.sourceName.endsWith('/' + wanted)));
			}
			candidates = candidates.filter(row => !row.ownerSource || row.ownerSource === note.sourceName);
			if (candidates.length !== 1) {
				if (!missingRecordings.has(resolved.path) && (candidates.length || /\.[^/]+$/.test(link.dest))) warnings.push({code: candidates.length ? 'attachment_ambiguous' : 'attachment_missing', name: link.dest,
					message: candidates.length ? 'More than one picked file has this path. The original link remains; no file was guessed.' : 'This linked file was not in the selected files; its original link remains. Pick the note and its file together.'});
				continue;
			}
			const object = candidates[0];
			let plan = stored.get(object);
			if (!plan) {
				try { plan = planAttachment(fileLabel(object), object.bytes, taken, {ascii}); }
				catch (error) { warnings.push({code: 'attachment_not_copied', name: object.sourceName, message: String(error.message) + ' The original link and source file were kept.'}); continue; }
				plan = {...plan, rootId: root(object), sourceName: object.sourceName, inputId: object.inputId};
				stored.set(object, plan); taken.push(plan.name); files.push(plan);
			}
			const href = attachmentHref(plan.name);
			if (link.kind === 'wikilink' || link.kind === 'embed') {
				// A file is an ordinary link even when the source app wrote a wiki embed.
				const label = (link.alias || object.label || plan.label).replace(/[\r\n]/g, ' ').replace(/[\\`*_{}\[\]<>!|]/g, '\\$&');
				edits.set(link.start, {start: link.start, end: link.end, text: '[' + label + '](' + href + (link.anchor ? '#' + encodeURIComponent(link.anchor).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) : '') + ')'});
			} else {
				edits.set(link.destStart, {start: link.destStart, end: link.destEnd, text: link.kind === 'html' ? escapeLinkAttribute(href) : href});
				if (link.image && link.kind !== 'html') { edits.set(link.start, {start: link.start, end: link.start + 1, text: ''}); warnings.push({code: 'attachment_picture_preserved', name: object.sourceName, message: 'The original picture was kept as a separate file, linked from the note.'}); }
			}
			linked.push(plan.name); used.push({object, file: note.file, attachment: plan.name});
		}
		for (const edit of [...edits.values()].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
		return {...note, text, ...(text !== note.text ? {bytes: new TextEncoder().encode(text)} : {}), warnings, linkedAttachments: [...new Set(linked)]};
	});
	for (const object of objects) if (object.retainUnlinked && !stored.has(object)) {
		try {
			const plan = {...planAttachment(fileLabel(object), object.bytes, taken, {ascii}), rootId: root(object), sourceName: object.sourceName, inputId: object.inputId};
			stored.set(object, plan); taken.push(plan.name); files.push(plan); used.push({object, file: plan.path, attachment: plan.name});
		} catch (error) { unread.push({object, why: String(error?.message || error)}); }
	}
	return {notes: result, attachments: files, used, unread};
}
