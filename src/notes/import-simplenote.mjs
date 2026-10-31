import {parseImportJson} from './import.mjs';
import {scanLinks} from './links.mjs';
import {noteFileName, orderAfter} from './model.mjs';
import {importTags, literalBlock, importMetadata, importDate, importTrash, readJsonInputs as unwrap} from './import.mjs';
import {reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

function tagsOf(raw) {
	const out = [], seen = new Set();
	for (const t of Array.isArray(raw) ? raw : []) {
		const name = typeof t === 'string' ? t.trim() : '';
		if (!name || name.length > 48 || seen.has(name) || out.length >= 16) continue;
		seen.add(name); out.push(name);
	}
	return out;
}

function isExport(raw) { return raw && typeof raw === 'object' && !Array.isArray(raw) && (Array.isArray(raw.activeNotes) || Array.isArray(raw.trashedNotes)); }

function noteText(data) {
	const raw = String(data.content || '').replace(/\r\n?/g, '\n');
	let text = raw;
	if (data.markdown !== true) {
		let at = 0; text = '';
		for (const link of scanLinks(raw).filter(link => !link.image && /^simplenote:\/\/note\/[^/?#]+$/.test(link.dest))) {
			text += literalBlock(raw.slice(at, link.start)) + raw.slice(link.start, link.end); at = link.end;
		}
		text += literalBlock(raw.slice(at));
	}
	return text + (text.endsWith('\n') ? '' : '\n');
}

export async function importSimplenote(entries, options) {
	const list = Array.isArray(entries) ? entries : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [];
	const named = await unwrap(list, skipped);

	const sources = [], recovered = [];
	const pool = existing.slice();
	for (const e of named) {
		if (!/\.(?:json|txt|text)$/i.test(e.name) || typeof e.text !== 'string') continue;
		const jsonFile = /\.json$/i.test(e.name), text = e.text.replace(/^\uFEFF/, '');
		if (!jsonFile && !/^\s*\{/.test(text)) continue;
		let raw;
		try { raw = parseImportJson(text); } catch (_) { if (jsonFile) {
			skipped.push({name: e.name, why: 'invalid JSON; literal source retained'});
			recovered.push({...literalImportSource(e, pool, 'Simplenote JSON was damaged and could not be parsed.', e.characterWarnings, 'json'), created: -Infinity});
		} continue; }
		if (!isExport(raw)) { if (jsonFile) skipped.push({name: e.name, why: 'not a Simplenote export'}); continue; }
		sources.push({raw, input: e});
	}

	const built = recovered, seenSections = new Set(), sections = [];
	function addSection(name) { if (name && !seenSections.has(name.toLowerCase())) { seenSections.add(name.toLowerCase()); sections.push(name); } }

	function addNote(data, trashed, label, input) {
		if (!data || typeof data !== 'object') { skipped.push({name: label, why: 'not a note object'}); return; }
		const id = typeof data.id === 'string' && data.id ? data.id : label;
		if (typeof data.content !== 'string' || !data.content.trim()) { skipped.push({name: id, why: 'empty note'}); return; }
		const warnings = [...(input.characterWarnings || [])], text = noteText(data);
		reportCharacterChange(data.content, text, warnings, 'Simplenote body');
		importMetadata(data, ['id','content','creationDate','lastModified','tags','pinned','markdown'], warnings, 'Simplenote fields');
		const file = noteFileName(text, pool); pool.push(file);
		const tags = tagsOf(data.tags);
		const entry = {order: '', pinned: data.pinned === true, skill: false, archived: false, trashed, colour: ''};
		importTrash(entry, options, warnings);
		if (tags.length) { entry.category = tags[0]; addSection(tags[0]); }
		const modified = importDate(data.lastModified, Date.parse(data.lastModified), warnings, 'Simplenote edit date');
		if (Number.isFinite(modified)) entry.modified = modified;
		const created = importDate(data.creationDate, Date.parse(data.creationDate), warnings, 'Simplenote creation date');
		built.push({file, text: importTags(text, data.tags, warnings, id), entry, sourceName: input.name, rootId: input.rootId ?? '', sourceItem: id, sourceAliases: typeof data.id === 'string' && data.id ? ['simplenote://note/' + encodeURIComponent(data.id)] : [], warnings, created: Number.isFinite(created) ? created : -Infinity});
	}

	if (sources.length) {
		for (const {raw: source, input} of sources) {
			(Array.isArray(source.activeNotes) ? source.activeNotes : []).forEach((n, i) => { try { addNote(n, false, 'activeNotes[' + i + ']', input); } catch (_) { skipped.push({name: 'activeNotes[' + i + ']', why: 'could not be read'}); } });
			(Array.isArray(source.trashedNotes) ? source.trashedNotes : []).forEach((n, i) => { try { addNote(n, true, 'trashedNotes[' + i + ']', input); } catch (_) { skipped.push({name: 'trashedNotes[' + i + ']', why: 'could not be read'}); } });
		}
	} else {
		for (const e of named) {
			if (!/\.txt$/i.test(e.name) || typeof e.text !== 'string') continue;
			try {
				if (!e.text.trim()) { skipped.push({name: e.name, why: 'empty note'}); continue; }
				const warnings = [...(e.characterWarnings || [])];
				const text = literalBlock(e.text.replace(/\r\n?/g, '\n')).trim() + '\n';
				reportCharacterChange(e.text, text, warnings, 'Simplenote plain-text body');
				const file = noteFileName(text, pool); pool.push(file);
				built.push({file, text, entry: {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''}, sourceName: e.name, rootId: e.rootId ?? '', warnings, created: -Infinity});
			} catch (_) { skipped.push({name: e.name, why: 'could not be read'}); }
		}
	}

	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, pictures: []});
}
