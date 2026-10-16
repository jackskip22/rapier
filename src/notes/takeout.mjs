import {noteFileName, orderAfter, NOTE_COLOURS, isBuiltinSectionName} from './model.mjs';
import {resolveAssetPath, scanLinks} from './links.mjs';
import {audioMime, appendImportedRecording, findAudioAttachment} from './audio.mjs';
import {importTags, literalInline, literalBlock, literalDestination, importMetadata, importTrash, importClock} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';
import {htmlToMarkdown} from './html-md.mjs';

const COLOURS = {DEFAULT: '', RED: 'red', ORANGE: 'orange', YELLOW: 'yellow', GREEN: 'green', TEAL: 'teal', BLUE: 'blue', DARKBLUE: 'blue', CERULEAN: 'blue', PURPLE: 'purple', PINK: 'pink', BROWN: 'brown', GRAY: ''};
function colourOf(value) {
	const mapped = COLOURS[typeof value === 'string' ? value.toUpperCase() : ''];
	return NOTE_COLOURS.includes(mapped) ? mapped : '';
}

function labelsOf(raw, warnings) {
	const out = [], seen = new Set();
	for (const l of Array.isArray(raw) ? raw : []) {
		const name = l && typeof l.name === 'string' ? l.name.trim() : '';
		if (!name || seen.has(name)) continue;
		if (name.length > 48) { warnings.push({code: 'label_section', label: name, message: 'This label was kept as a tag; it is too long for a section.'}); continue; }
		seen.add(name); out.push(name);
	}
	return out;
}

function keepTime(value, warnings, what) {
	if (value === undefined || value === 0 || value === '0') return undefined;
	const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
	if (!Number.isSafeInteger(n) || n < 0) {
		warnings.push({code: 'invalid_time', value, message: 'The Keep ' + what + ' could not be read, so no date was set. Its value stays in the original export and in this import record.'}); return undefined;
	}
	if (n % 1000) warnings.push({code: 'time_precision', microseconds: value, message: 'The Keep ' + what + ' was rounded to the millisecond. Its exact value stays in the original export and in this import record.'});
	return Math.round(n / 1000);
}


function textOf(data, warnings, resolvePath) {
	const blocks = [];
	const attachments = (Array.isArray(data.attachments) ? data.attachments : []).filter(a => a && typeof a.filePath === 'string' && a.filePath && !audioMime(a.mimetype || a.mimeType, a.filePath));
	const isImage = a => /^image\//i.test(a.mimetype || a.mimeType || '') || /\.(?:png|jpe?g|gif|webp|jxl|svg|heic|heif)$/i.test(a.filePath);
	const attachmentLink = (a, image) => {
		const path = resolvePath(a.filePath.replace(/\\/g, '/')), base = path.split('/').pop();
		return (image ? '!' : '') + '[' + literalInline(base) + '](' + literalDestination(path) + ')';
	};
	const photos = attachments.filter(isImage);
	if (photos.length) blocks.push(photos.map(a => attachmentLink(a, true)).join('\n\n'));
	const title = typeof data.title === 'string' ? data.title.replace(/\s+/g, ' ').trim() : '';
	reportCharacterChange(data.title, title, warnings, 'Keep title');
	if (title) blocks.push('# ' + literalInline(title).replace(/(\s+#+)$/, m => m.replace('#', '\\#')));
	const bodyAt = blocks.length;
	if (Object.hasOwn(data, 'textContentHtml')) {
		const body = htmlToMarkdown(data.textContentHtml, {warnings, plainText: data.textContent});
		if (body.trim()) blocks.push(body);
	} else if (typeof data.textContent === 'string' && data.textContent.trim()) {
		const body = literalBlock(data.textContent);
		reportCharacterChange(data.textContent, body, warnings, 'Keep body'); blocks.push(body);
	}
	const items = Array.isArray(data.listContent) ? data.listContent : [];
	if (items.length) blocks.push(items.map((item, i) => {
		let body;
		const indent = i > 0 && /^  \S/.test(item?.text || '') ? '  ' : '';
		if (item && Object.hasOwn(item, 'textHtml')) {
			if (typeof item.textHtml !== 'string') throw new TypeError('Keep checklist HTML is not a string.');
			body = htmlToMarkdown(item.textHtml, {warnings, plainText: item.text}).replace(/\n+$/, '').replace(/\n/g, '\n  ');
		} else body = literalInline(item && typeof item.text === 'string' ? item.text.slice(indent.length).replace(/\r\n?/g, '\n') : '').replace(/\n/g, '  \n  ');
		return indent + '- [' + (item && item.isChecked ? 'x' : ' ') + '] ' + body;
	}).join('\n'));
	const files = attachments.filter(a => !isImage(a));
	if (files.length) blocks.push(files.map(a => attachmentLink(a, false)).join('\n\n'));
	const bodyLinks = new Set(blocks.flatMap(block => scanLinks(block).filter(link => !link.image).map(link => link.dest)));
	const rawLinks = new Set([data.textContent, ...items.map(item => item?.text)].filter(value => typeof value === 'string')
		.flatMap(value => value.match(/https?:\/\/[^\s<>"'`]+/gi) || []));
	for (const a of Array.isArray(data.annotations) ? data.annotations : []) {
		if (!a || a.source !== 'WEBLINK' || typeof a.url !== 'string' || !a.url) continue;
		const link = '[' + literalInline(a.title || a.url) + '](' + literalDestination(a.url) + ')';
		if (!Object.hasOwn(data, 'textContentHtml') && !title && !attachments.length && !items.length && data.textContent?.trim() === a.url) blocks[bodyAt] = link;
		else if (!bodyLinks.has(a.url) && !rawLinks.has(a.url) && ![...rawLinks].some(url => url.replace(/[.,;!?)\]]+$/, '') === a.url)) { blocks.push('- ' + link); bodyLinks.add(a.url); }
		else if (a.title && a.title !== a.url) importMetadata({title: a.title}, [], warnings, 'Keep link fields', {at: 'annotations[' + data.annotations.indexOf(a) + ']'});
	}
	return blocks.join('\n\n').replace(/\r\n?/g, '\n').replace(/\n+$/, '') + '\n';
}

export function importTakeout(files, options) {
	const list = Array.isArray(files) ? files : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const now = importClock(options);
	const skipped = [], built = [], pool = existing.slice(), audio = [], audioPool = [...(options?.audioExisting || [])];
	const jpegPaths = new Map(), paths = new Set(list.map(f => f.name));
	for (const file of list) if (file.bytes && /\.jpe?g$/i.test(file.name)) {
		const key = file.name.replace(/\.jpe?g$/i, '.jpg'), rows = jpegPaths.get(key) || [];
		rows.push(file.name); jpegPaths.set(key, rows);
	}
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
				text = textOf(data, warnings, path => {
					const resolved = resolveAssetPath(f.name, path);
					if (resolved.outside || paths.has(resolved.path) || !/\.jpe?g$/i.test(path)) return path;
					const siblings = jpegPaths.get(resolved.path?.replace(/\.jpe?g$/i, '.jpg'));
					return siblings?.length === 1 ? path.replace(/\.jpe?g$/i, siblings[0].slice(siblings[0].lastIndexOf('.'))) : path;
				});
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
				text = mapped.text; audio.push({...mapped.audio, sourceName: source.name}); audioPool.push(mapped.audio.name);
			}
			const reminder = keepTime(data.reminderTimeUsec, warnings, 'reminder');
			importMetadata(data, ['title','textContent','textContentHtml','listContent','attachments','annotations','labels','color','isPinned','isArchived','isTrashed','createdTimestampUsec','userEditedTimestampUsec', ...(reminder > 0 ? ['reminderTimeUsec'] : [])], warnings, 'Keep fields');
			for (const [key, represented, subject] of [['listContent', ['text','textHtml','isChecked'], 'checklist'], ['attachments', ['filePath','mimetype','mimeType'], 'attachment'], ['labels', ['name'], 'label'], ['annotations', ['source','url','title'], 'link']]) {
				for (const [i, item] of (Array.isArray(data[key]) ? data[key] : []).entries()) importMetadata(item, key === 'annotations' && item?.source !== 'WEBLINK' ? [] : represented, warnings, 'Keep ' + subject + ' fields', {at: key + '[' + i + ']'});
			}
			const labels = labelsOf(data.labels, warnings);
			const tagNames = (Array.isArray(data.labels) ? data.labels : []).map(label => label?.name).filter(name => typeof name === 'string');
			text = importTags(text, tagNames, warnings, f.name);
			const entry = {order: '', pinned: data.isPinned === true, skill: false, archived: data.isArchived === true && data.isTrashed !== true, trashed: data.isTrashed === true, ...(data.isTrashed === true ? {trashedAt: now} : {}), colour: colourOf(data.color)};
			if (data.isArchived === true && data.isTrashed === true) importMetadata({isArchived: true}, [], warnings, 'Keep archived state before deletion');
			if (reminder > 0) entry.remind = {at: reminder};
			importTrash(entry, {now}, warnings);
			if (typeof data.color === 'string' && (['DARKBLUE', 'CERULEAN', 'GRAY'].includes(data.color.toUpperCase()) || !Object.hasOwn(COLOURS, data.color.toUpperCase()))) warnings.push({code: 'colour_mapping', sourceColour: data.color, targetColour: entry.colour, message: 'Keep colour ' + data.color + ' became ' + (entry.colour || 'no colour') + '; there is no separate matching colour in Rapier.'});
			const category = labels.find(label => !isBuiltinSectionName(label));
			if (category) {
				entry.category = category;
				const key = category.toLowerCase();
				if (!seenSections.has(key)) { seenSections.add(key); sections.push(category); }
			}
			const created = keepTime(data.createdTimestampUsec, warnings, 'creation date');
			const modified = keepTime(data.userEditedTimestampUsec, warnings, 'edit date') ?? created;
			if (modified !== undefined) entry.modified = modified;

			built.push({file, text, entry, sourceName: f.name, rootId: f.rootId ?? '', warnings, created: created ?? modified ?? -Infinity});
		} catch (_) {
			skipped.push({name: f && typeof f.name === 'string' ? f.name : '(unnamed)', why: 'could not be read'});
		}
	}

	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, audio});
}
