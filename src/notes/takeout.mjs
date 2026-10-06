// notes/takeout.mjs -- turning a Google Keep Takeout export into ordinary Rapier notes.
//
// Pure: no DOM, no fs, no storage. Given the files out of a Takeout/Keep folder, this hands back Markdown text and a sidecar entry per note,
// in exactly the shapes notes/model.mjs already deals in -- the caller (the notes shell) does the actual writing, the same "write a file,
// write a sidecar entry" path an ordinary save already uses. Nothing here is Rapier-private: a Keep checklist becomes a GFM task list, a
// Keep colour becomes one of NOTE_COLOURS, and that is the whole note.
//
// The export's labels are not carried into the category system as a list -- a note's FIRST label becomes its one category. The labels
// themselves live in the export's own JSON, not in the note, so every one of them is written into the note's own metadata block as a tag,
// where the person keeps it if the folder goes elsewhere. importTakeout also hands back `sections`: every distinct category name the batch
// needs, in the order it was first seen, so the caller creates them (notes/model.mjs addSection, in that order) before writing the notes --
// a note's category always names a section that exists by the time it lands.
import {noteFileName, orderAfter, NOTE_COLOURS} from './model.mjs';
import {audioMime, appendImportedRecording, findAudioAttachment} from './audio.mjs';
import {importTags, literalInline, literalBlock, literalDestination, importMetadata, importTrash, importClock} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';
import {htmlToMarkdown} from './html-md.mjs';

// Keep's colour enum to ours. DARKBLUE and BLUE both read as 'blue' -- Rapier has one blue, not
// two -- and anything unrecognised or absent is '', the same "no colour" the model already uses.
const COLOURS = {DEFAULT: '', RED: 'red', ORANGE: 'orange', YELLOW: 'yellow', GREEN: 'green', TEAL: 'teal', BLUE: 'blue', DARKBLUE: 'blue', PURPLE: 'purple', PINK: 'pink', BROWN: 'brown', GRAY: ''};
function colourOf(value) {
	const mapped = COLOURS[typeof value === 'string' ? value.toUpperCase() : ''];
	return NOTE_COLOURS.includes(mapped) ? mapped : '';
}

// Up to sixteen label names, each 48 characters or under, exact duplicates dropped, export order
// kept -- the same shape notes/model.mjs's own cleanEntry already enforces on a hand-edited sidecar.
function labelsOf(raw) {
	const out = [], seen = new Set();
	for (const l of Array.isArray(raw) ? raw : []) {
		const name = l && typeof l.name === 'string' ? l.name.trim() : '';
		if (!name || name.length > 48 || seen.has(name) || out.length >= 16) continue;
		seen.add(name); out.push(name);
	}
	return out;
}

// A millisecond "last touched" for the sidecar: Keep's own edit stamp when it is usable, else the
// creation stamp, else nothing -- the field is left off rather than filled with a guess.
function keepTime(value, warnings, what) {
	if (value === undefined) return undefined;
	const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
	if (!Number.isSafeInteger(n) || n < 0) {
		warnings.push({code: 'invalid_time', value, message: 'The Keep ' + what + ' could not be read, so no date was set. Its value stays in the original export and in this import record.'}); return undefined;
	}
	if (n % 1000) warnings.push({code: 'time_precision', microseconds: value, message: 'The Keep ' + what + ' was rounded to the millisecond. Its exact value stays in the original export and in this import record.'});
	return Math.round(n / 1000);
}

// The note's Markdown, as a list of blocks joined with one blank line apiece -- which is also
// exactly the spacing the brief asks for between a title and the body, and between text and a
// checklist, so there is no second rule to keep in sync with this one.

function textOf(data, warnings) {
	const blocks = [];
	const title = typeof data.title === 'string' ? data.title.replace(/\s+/g, ' ').trim() : '';
	reportCharacterChange(data.title, title, warnings, 'Keep title');
	if (title) blocks.push('# ' + literalInline(title).replace(/(\s+#+)$/, m => m.replace('#', '\\#')));
	if (Object.hasOwn(data, 'textContentHtml')) {
		const body = htmlToMarkdown(data.textContentHtml, {warnings, plainText: data.textContent});
		if (body.trim()) blocks.push(body);
	} else if (typeof data.textContent === 'string' && data.textContent.trim()) {
		const body = literalBlock(data.textContent);
		reportCharacterChange(data.textContent, body, warnings, 'Keep body'); blocks.push(body);
	}
	const items = Array.isArray(data.listContent) ? data.listContent : [];
	if (items.length) blocks.push(items.map(item => {
		let body;
		if (item && Object.hasOwn(item, 'textHtml')) {
			if (typeof item.textHtml !== 'string') throw new TypeError('Keep checklist HTML is not a string.');
			// Takeout rich checklist items carry their own HTML, independently of the note body.
			// Keep converted blocks inside this task; the one HTML owner accounts for lost fields.
			body = htmlToMarkdown(item.textHtml, {warnings, plainText: item.text}).replace(/\n+$/, '').replace(/\n/g, '\n  ');
		} else body = literalInline(item && typeof item.text === 'string' ? item.text.replace(/\r\n?/g, '\n') : '').replace(/\n/g, '  \n  ');
		return '- [' + (item && item.isChecked ? 'x' : ' ') + '] ' + body;
	}).join('\n'));
	// Attachments read like part of the note (a photo, a drawing); the caller copies the bytes over
	// under the same basename, this module only has to agree on the name.
	const attachments = (Array.isArray(data.attachments) ? data.attachments : []).filter(a => a && typeof a.filePath === 'string' && a.filePath && !audioMime(a.mimetype || a.mimeType, a.filePath));
	if (attachments.length) blocks.push(attachments.map(a => { const path = a.filePath.replace(/\\/g, '/'), base = path.split('/').pop(), image = /^image\//i.test(a.mimetype || a.mimeType || '') || /\.(?:png|jpe?g|gif|webp|jxl|svg|heic|heif)$/i.test(path); return (image ? '!' : '') + '[' + literalInline(base) + '](' + literalDestination(path) + ')'; }).join('\n'));
	// Weblinks read like a citation list, so they trail everything else, last of all.
	const links = (Array.isArray(data.annotations) ? data.annotations : [])
		.filter(a => a && a.source === 'WEBLINK' && typeof a.url === 'string' && a.url)
		.map(a => '- [' + literalInline(a.title || a.url) + '](' + literalDestination(a.url) + ')');
	if (links.length) blocks.push(links.join('\n'));
	// One normalisation for the whole thing, once, at the end: Keep's export can carry CRLF, and a
	// note built from several blocks can pick up trailing blank lines nobody asked for.
	return blocks.join('\n\n').replace(/\r\n?/g, '\n').trimEnd() + '\n';
}

export function importTakeout(files, options) {
	const list = Array.isArray(files) ? files : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	// A note Keep's trash held arrives trashed AT THE IMPORT: seven days from now, not from a Keep
	// edit that may be months old (the sweep would have deleted it at the next open), and never
	// for ever (with no trashedAt the seven days never begin).
	const now = importClock(options);
	const skipped = [], built = [], pool = existing.slice(), audio = [], audioPool = [...(options?.audioExisting || [])];
	// Every distinct category the batch needs, in first-appearance order, matched case-insensitively
	// (a second label differing only in case reuses the first's section, the same collision
	// addSection itself would resolve, so there is never a reason to hand the caller both).
	const sections = [], seenSections = new Set();

	for (const f of list) {
		try {
			// Everything that is not a Takeout note's own JSON -- the .html twin Keep writes beside
			// it, the attachment files, anything else -- is not ours to read and is not an error.
			if (!f || typeof f.name !== 'string' || !/\.(?:json|txt|text)$/i.test(f.name)) continue;
			const warnings = [], source = readImportText(f, warnings);
			let data;
			try { data = JSON.parse(source.replace(/^\uFEFF/, '')); } catch (_) {
				skipped.push({name: f.name, why: 'invalid JSON; literal source retained'});
				built.push({...literalImportSource({...f, text: source, bytes: undefined}, pool, 'Keep JSON was damaged and could not be parsed.', warnings, 'json'), created: -Infinity}); continue;
			}
			if (!data || typeof data !== 'object' || Array.isArray(data)) { skipped.push({name: f.name, why: 'invalid JSON'}); continue; }
			if (!/\.json$/i.test(f.name) && !(typeof data.textContent === 'string' || typeof data.textContentHtml === 'string' || Array.isArray(data.listContent) || Array.isArray(data.attachments) || typeof data.isPinned === 'boolean')) { skipped.push({name: f.name, why: 'not a Keep export'}); continue; }
			// A present HTML field owns the body, even when empty. A damaged field or converter
			// failure keeps the original JSON rather than quietly substituting another projection.
			let text;
			try {
				if (Object.hasOwn(data, 'textContentHtml') && typeof data.textContentHtml !== 'string') throw new TypeError('Keep HTML body is not a string.');
				text = textOf(data, warnings);
			} catch (_) {
				skipped.push({name: f.name, why: 'unreadable note body; literal source retained'});
				built.push({...literalImportSource({...f, text: source, bytes: undefined}, pool, 'The Keep note body could not be converted.', warnings, 'json'), created: -Infinity}); continue;
			}
			// Recordings are appended below; a recording-only note is not empty either.
			const hasAttachment = Array.isArray(data.attachments) && data.attachments.some(a => a && typeof a.filePath === 'string' && a.filePath);
			if (!text.trim() && !hasAttachment) { skipped.push({name: f.name, why: 'empty note'}); continue; }
			const file = noteFileName(text, pool);
			pool.push(file);
			for (const a of Array.isArray(data.attachments) ? data.attachments : []) {
				const mime = audioMime(a?.mimetype || a?.mimeType, a?.filePath);
				if (!mime || !a?.filePath) continue;
				const source = findAudioAttachment(list, f, a.filePath);
				if (!source) { warnings.push({code: 'recording_missing', sourcePath: a.filePath, message: 'Recording bytes were missing or ambiguous. The original link was kept; keep the source export.'}); text += '\n[' + literalInline(a.filePath.split('/').pop()) + '](' + literalDestination(a.filePath) + ')\n'; continue; }
				const mapped = appendImportedRecording(text, file, {...source, mime}, audioPool);
				text = mapped.text; audio.push(mapped.audio); audioPool.push(mapped.audio.name);
			}
			importMetadata(data, ['title','textContent','textContentHtml','listContent','attachments','annotations','labels','color','isPinned','isArchived','isTrashed','createdTimestampUsec','userEditedTimestampUsec'], warnings, 'Keep fields');
			for (const item of data.listContent || []) importMetadata(item, ['text','textHtml','isChecked'], warnings, 'Keep checklist fields');
			for (const item of data.attachments || []) importMetadata(item, ['filePath','mimetype','mimeType'], warnings, 'Keep attachment fields');
			for (const item of data.labels || []) importMetadata(item, ['name'], warnings, 'Keep label fields');
			for (const item of data.annotations || []) importMetadata(item, item?.source === 'WEBLINK' ? ['source','url','title'] : [], warnings, 'Keep link fields');
			const labels = labelsOf(data.labels);
			const tagNames = (Array.isArray(data.labels) ? data.labels : []).map(label => label?.name).filter(name => typeof name === 'string');
			text = importTags(text, tagNames, warnings, f.name);
			const entry = {order: '', pinned: data.isPinned === true, skill: false, archived: data.isArchived === true, trashed: data.isTrashed === true, ...(data.isTrashed === true ? {trashedAt: now} : {}), colour: colourOf(data.color)};
			importTrash(entry, {now}, warnings);
			if (typeof data.color === 'string' && (data.color.toUpperCase() === 'DARKBLUE' || data.color.toUpperCase() === 'GRAY' || !Object.hasOwn(COLOURS, data.color.toUpperCase()))) warnings.push({code: 'colour_mapping', sourceColour: data.color, targetColour: entry.colour, message: 'Keep colour ' + data.color + ' became ' + (entry.colour || 'no colour') + '; there is no separate matching colour in Rapier.'});
			// The note's FIRST label becomes its category -- Keep does not promise an order among a
			// note's labels, but the export lists them in one, and the first is as reasonable a
			// "primary" as any; a person can always change it after import.
			if (labels.length) {
				entry.category = labels[0];
				const key = labels[0].toLowerCase();
				if (!seenSections.has(key)) { seenSections.add(key); sections.push(labels[0]); }
			}
			const created = keepTime(data.createdTimestampUsec, warnings, 'creation date');
			const modified = keepTime(data.userEditedTimestampUsec, warnings, 'edit date') ?? created;
			if (modified !== undefined) entry.modified = modified;

			built.push({file, text, entry, sourceName: f.name, rootId: f.rootId ?? '', warnings, created: Number.isFinite(created) ? created : -Infinity});
		} catch (_) {
			// Any one file's own trouble (an odd shape this brief did not name) never stops the rest.
			skipped.push({name: f && typeof f.name === 'string' ? f.name : '(unnamed)', why: 'could not be read'});
		}
	}

	// Order: chained orderAfter keys after options.lastOrder, so the whole import lands behind every
	// note already in the folder, exactly as reconcile() appends an unindexed file after everything.
	// Within the batch, sortedSection sorts a section's files by order ASCENDING, and a fresh capture
	// (notes.js, _rapierNotesCapture) claims the head of Others with orderBefore(the current first)
	// -- so the LOWEST key is the one shown first. Chaining oldest-to-newest would hand the newest
	// imported note the HIGHEST key in the batch, putting it last, behind notes Keep made before it:
	// backwards for an import a person expects to see their latest Keep notes from up front. Going
	// newest-to-oldest instead gives the newest note the lowest (earliest) key of the batch -- right
	// behind whatever was already there, the same place a fresh capture would put it.
	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, audio});
}
