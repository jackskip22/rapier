import {noteFileName, orderAfter, NOTE_COLOURS} from './model.mjs';
import {audioMime, appendImportedRecording, findAudioAttachment} from './audio.mjs';
import {importTags, literalInline, literalBlock, literalDestination, importMetadata, importTrash, importClock} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';
import {htmlToMarkdown} from './html-md.mjs';

const COLOURS = {DEFAULT: '', RED: 'red', ORANGE: 'orange', YELLOW: 'yellow', GREEN: 'green', TEAL: 'teal', BLUE: 'blue', DARKBLUE: 'blue', PURPLE: 'purple', PINK: 'pink', BROWN: 'brown', GRAY: ''};
function colourOf(value) {
	const mapped = COLOURS[typeof value === 'string' ? value.toUpperCase() : ''];
	return NOTE_COLOURS.includes(mapped) ? mapped : '';
}

function labelsOf(raw) {
	const out = [], seen = new Set();
	for (const l of Array.isArray(raw) ? raw : []) {
		const name = l && typeof l.name === 'string' ? l.name.trim() : '';
		if (!name || name.length > 48 || seen.has(name) || out.length >= 16) continue;
		seen.add(name); out.push(name);
	}
	return out;
}

function keepTime(value, warnings, what) {
	if (value === undefined) return undefined;
	const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
	if (!Number.isSafeInteger(n) || n < 0) {
		warnings.push({code: 'invalid_time', value, message: 'The Keep ' + what + ' could not be read, so no date was set. Its value stays in the original export and in this import record.'}); return undefined;
	}
	if (n % 1000) warnings.push({code: 'time_precision', microseconds: value, message: 'The Keep ' + what + ' was rounded to the millisecond. Its exact value stays in the original export and in this import record.'});
	return Math.round(n / 1000);
}


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
			body = htmlToMarkdown(item.textHtml, {warnings, plainText: item.text}).replace(/\n+$/, '').replace(/\n/g, '\n  ');
		} else body = literalInline(item && typeof item.text === 'string' ? item.text.replace(/\r\n?/g, '\n') : '').replace(/\n/g, '  \n  ');
		return '- [' + (item && item.isChecked ? 'x' : ' ') + '] ' + body;
	}).join('\n'));
	const attachments = (Array.isArray(data.attachments) ? data.attachments : []).filter(a => a && typeof a.filePath === 'string' && a.filePath && !audioMime(a.mimetype || a.mimeType, a.filePath));
	if (attachments.length) blocks.push(attachments.map(a => { const path = a.filePath.replace(/\\/g, '/'), base = path.split('/').pop(), image = /^image\//i.test(a.mimetype || a.mimeType || '') || /\.(?:png|jpe?g|gif|webp|jxl|svg|heic|heif)$/i.test(path); return (image ? '!' : '') + '[' + literalInline(base) + '](' + literalDestination(path) + ')'; }).join('\n'));
	const links = (Array.isArray(data.annotations) ? data.annotations : [])
		.filter(a => a && a.source === 'WEBLINK' && typeof a.url === 'string' && a.url)
		.map(a => '- [' + literalInline(a.title || a.url) + '](' + literalDestination(a.url) + ')');
	if (links.length) blocks.push(links.join('\n'));
	return blocks.join('\n\n').replace(/\r\n?/g, '\n').trimEnd() + '\n';
}

export function importTakeout(files, options) {
	const list = Array.isArray(files) ? files : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const now = importClock(options);
	const skipped = [], built = [], pool = existing.slice(), audio = [], audioPool = [...(options?.audioExisting || [])];
	const sections = [], seenSections = new Set();

	for (const f of list) {
		try {
			if (!f || typeof f.name !== 'string' || !/\.(?:json|txt|text)$/i.test(f.name)) continue;
			const warnings = [], source = readImportText(f, warnings);
			let data;
			try { data = JSON.parse(source.replace(/^\uFEFF/, '')); } catch (_) {
				skipped.push({name: f.name, why: 'invalid JSON; literal source retained'});
				built.push({...literalImportSource({...f, text: source, bytes: undefined}, pool, 'Keep JSON was damaged and could not be parsed.', warnings, 'json'), created: -Infinity}); continue;
			}
			if (!data || typeof data !== 'object' || Array.isArray(data)) { skipped.push({name: f.name, why: 'invalid JSON'}); continue; }
			if (!/\.json$/i.test(f.name) && !(typeof data.textContent === 'string' || typeof data.textContentHtml === 'string' || Array.isArray(data.listContent) || Array.isArray(data.attachments) || typeof data.isPinned === 'boolean')) { skipped.push({name: f.name, why: 'not a Keep export'}); continue; }
			let text;
			try {
				if (Object.hasOwn(data, 'textContentHtml') && typeof data.textContentHtml !== 'string') throw new TypeError('Keep HTML body is not a string.');
				text = textOf(data, warnings);
			} catch (_) {
				skipped.push({name: f.name, why: 'unreadable note body; literal source retained'});
				built.push({...literalImportSource({...f, text: source, bytes: undefined}, pool, 'The Keep note body could not be converted.', warnings, 'json'), created: -Infinity}); continue;
			}
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
			skipped.push({name: f && typeof f.name === 'string' ? f.name : '(unnamed)', why: 'could not be read'});
		}
	}

	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, audio});
}
