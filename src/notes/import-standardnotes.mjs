// notes/import-standardnotes.mjs -- Standard Notes' decrypted backup into ordinary Rapier notes.
// Pure: no DOM, no fs, no fetch; shared import transport and literal grammar.
//
// standardnotes.com/help/14/how-do-i-create-and-import-backups-of-my-standard-notes-data confirms
// the shape but not the field names: "a decrypted backup file that may be restored to Standard
// Notes, as well as a folder containing each of your notes in individual plain text files" --
// despite its ".txt" name the backup file is JSON, an {items: [...]} array. The field names below
// (content_type, content.title/.text/.noteType/.trashed, content.appData['org.standardnotes.sn']
// for pinned/archived, content.references for a tag's own notes) are read from Standard Notes'
// public source, github.com/standardnotes/app: packages/models/src/Domain/Abstract/Item/Mutator/
// DecryptedItemMutator.ts (the pinned/archived/trashed setters), .../Types/DefaultAppDomain.ts (the
// 'org.standardnotes.sn' domain key), .../Syncable/Note/NoteContent.ts and
// packages/features/src/Domain/Component/NoteType.ts (the noteType enum, including 'super'). The
// literal content_type strings ("Note", "Tag") are asserted by this task's own brief and are not
// directly confirmed here -- @standardnotes/domain-core, where ContentType.TYPES is defined, is a
// separate package this pass did not fetch; docs/import-json.md says so.
import {noteFileName, orderAfter} from './model.mjs';
import {importTags, literalInline, literalBlock, literalDestination, importMetadata, importDate, importTrash, readJsonInputs as unwrap} from './import.mjs';
import {htmlToMarkdown} from './html-md.mjs';
import {reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

// Plain-text content is escaped; Markdown and Super content keep their actual marks.
const APP_DOMAIN = 'org.standardnotes.sn';
const trimTitleSpace = text => text.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');

// What Standard Notes writes for "nothing set" carries nothing and is not kept (standardnotes/app
// 000d2d7). A false switch whose off state is the note Rapier makes: an item not deleted
// (ContextPayload.deleted), a note not protected, locked, starred or published to Listed, its preview
// shown (ItemContent, NoteContent; appData's AppDataField.Locked and the legacy prefersPlainEditor).
// A preview its editor cut from the note's own text carries nothing the text does not
// (Controllers/NoteSyncController.ts: the first 160 characters, then '...'). A server clock in
// microseconds, or the client's edit time, is the date the note took only when it is exactly that
// instant; otherwise it is kept, as a Keep date's microseconds are. A spellcheck switch either way, an
// editor, an edited preview are a person's settings, and are kept.
const SN_CONTENT_OFF = new Set(['protected', 'hidePreview', 'locked', 'starred', 'authorizedForListed']);
const SN_APP_OFF = new Set(['locked', 'prefersPlainEditor']);
const SN_LABELS = {created_at_timestamp: 'creation time in microseconds', updated_at_timestamp: 'edit time in microseconds', duplicate_of: 'duplicate of',
	preview_plain: 'preview', preview_html: 'preview html', hidePreview: 'hidden preview', editorIdentifier: 'editor', client_updated_at: 'client edit time', locked: 'edit lock'};

// Tags have authored settings of their own (TagContent/TagPreferences). Admit only those
// documented scalar preferences: the backup may also hold extension data and account keys.
const TAG_BOOLEAN_PREFERENCES = new Set(['sortReverse', 'showArchived', 'showTrashed', 'hideProtected', 'hidePinned', 'hideNotePreview', 'hideDate', 'hideTags', 'hideEditorIcon', 'useTableView']);
const TAG_STRING_PREFERENCES = new Set(['sortBy', 'newNoteTitleFormat', 'customNoteTitleFormat', 'editorIdentifier', 'entryMode']);
function tagFields(content) {
	const fields = {};
	if (content?.expanded === true) fields.expanded = true;
	if (typeof content?.iconString === 'string') fields.iconString = content.iconString;
	const preferences = Object.fromEntries(Object.entries(content?.preferences && typeof content.preferences === 'object' ? content.preferences : {}).filter(([key, value]) =>
		TAG_BOOLEAN_PREFERENCES.has(key) && typeof value === 'boolean' || TAG_STRING_PREFERENCES.has(key) && typeof value === 'string' || key === 'panelWidth' && Number.isFinite(value)));
	if (Object.keys(preferences).length) fields.preferences = preferences;
	return fields;
}


// Super is Lexical JSON. Its supported nodes become HTML for the one HTML-to-Markdown owner;
// unknown nodes retain their complete source instead of flattening away authored structure.
const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function sourceBlock(value) {
	const text = JSON.stringify(value, null, 2);
	const fence = '`'.repeat(Math.max(3, 1 + Math.max(0, ...(text.match(/`+/g) || []).map(s => s.length))));
	return fence + 'json\n' + text + '\n' + fence;
}
function superLines(doc, warnings) {
	if (!doc?.root || !Array.isArray(doc.root.children)) return null;
	const render = (node, parent) => {
		if (!node || typeof node !== 'object') throw new Error('unsupported node');
		const children = () => (node.children || []).map(child => render(child, node)).join('');
		if (node.type === 'text') {
			if (typeof node.text !== 'string' || node.format !== undefined && (!Number.isInteger(node.format) || node.format < 0 || node.format > 255)) throw new Error('unsupported text format');
			let text = escapeHtml(node.text);
			for (const [bit, tag] of [[16,'code'],[1,'strong'],[2,'em'],[4,'s'],[8,'u'],[32,'sub'],[64,'sup'],[128,'mark']]) if (node.format & bit) text = '<' + tag + '>' + text + '</' + tag + '>';
			return node.style ? '<span style="' + escapeHtml(node.style) + '">' + text + '</span>' : text;
		}
		if (node.type === 'linebreak') return '<br>';
		if (node.type === 'link' || node.type === 'autolink') {
			if (typeof node.url !== 'string') throw new Error('unsupported link');
			return '<a href="' + escapeHtml(node.url) + '">' + children() + '</a>';
		}
		if (node.type === 'paragraph') return '<p>' + children() + '</p>';
		if (node.type === 'quote') return '<blockquote>' + children() + '</blockquote>';
		if (node.type === 'heading' && /^h[1-6]$/.test(node.tag)) return '<' + node.tag + '>' + children() + '</' + node.tag + '>';
		if (node.type === 'list') {
			if (!['bullet','number','check'].includes(node.listType)) throw new Error('unsupported list');
			const tag = node.listType === 'number' ? 'ol' : 'ul';
			return '<' + tag + (tag === 'ol' && Number.isSafeInteger(node.start) ? ' start="' + node.start + '"' : '') + '>' + children() + '</' + tag + '>';
		}
		if (node.type === 'listitem') return '<li>' + (parent?.listType === 'check' ? '<input type="checkbox"' + (node.checked ? ' checked' : '') + '>' : '') + children() + '</li>';
		if (node.type === 'code') return '<pre><code' + (node.language ? ' class="language-' + escapeHtml(node.language) + '"' : '') + '>' + children() + '</code></pre>';
		if (node.type === 'horizontalrule' || node.type === 'divider') return '<hr>';
		if (node.type === 'image' && typeof node.src === 'string') {
			warnings.push({code: 'attachment_reference', message: 'Picture reference retained; its bytes must be supplied separately.'});
			return '<img src="' + escapeHtml(node.src) + '" alt="' + escapeHtml(node.altText || '') + '"' + (Number.isFinite(node.width) && node.width > 0 ? ' width="' + node.width + '"' : '') + '>';
		}
		if (node.type === 'table') return '<table>\n' + children() + '\n</table>';
		if (node.type === 'tablerow') return '<tr>' + children() + '</tr>\n';
		if (node.type === 'tablecell') return '<td' + (Number.isSafeInteger(node.colSpan) && node.colSpan > 1 ? ' colspan="' + node.colSpan + '"' : '') + (Number.isSafeInteger(node.rowSpan) && node.rowSpan > 1 ? ' rowspan="' + node.rowSpan + '"' : '') + '>' + children() + '</td>';
		throw new Error('unsupported node');
	};
	const inspect = node => {
		if (!node || typeof node !== 'object') return;
		const fields = {};
		for (const key of ['direction','indent','format','style','mode','detail','headerState','backgroundColor','height','colWidths']) {
			if (node[key] && !(key === 'format' && node.type === 'text') && !(key === 'style' && node.type === 'text') && !(key === 'mode' && node[key] === 'normal')) fields[key] = node[key];
		}
		importMetadata(fields, [], warnings, 'Super layout fields');
		for (const child of node.children || []) inspect(child);
	};
	return doc.root.children.map(node => {
		try { const html = render(node); inspect(node); return htmlToMarkdown(html, {warnings}); }
		catch (_) { warnings.push({code: 'unsupported_block', block: node?.type || 'unknown', message: 'Unsupported Super content kept as literal JSON, including descendant text and attachment fields.'}); return sourceBlock(node); }
	}).join('\n\n');
}

export async function importStandardNotes(entries, options) {
	const list = Array.isArray(entries) ? entries : [];
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [], warnings = [];
	const named = await unwrap(list, skipped);

	// The backup file keeps its ".txt" name from Standard Notes' own export, so it is found by its
	// JSON shape (an {items: [...]} array) rather than by its extension; every note's own plain-text
	// twin beside it is the same words with no tags, pins or timestamps, and is never read once the
	// backup is found (the same "ignore the twin" rule takeout.mjs applies to its own source's .html twin).
	const sources = [], pool = existing.slice(), built = [], seenSections = new Set(), sections = [];
	function addSection(name) { if (name && !seenSections.has(name.toLowerCase())) { seenSections.add(name.toLowerCase()); sections.push(name); } }
	// Everything this loop declines to read is REMEMBERED rather than dropped. Ignoring a file here
	// is only correct once a backup has actually been found: the twins the comment above describes
	// are the same words the backup already carries, so reporting them would be noise. When no
	// backup is found at all -- the person exported only the plain-text folder, or the one archive
	// is damaged and is neither named .json nor shaped like an object -- the very same `continue`
	// throws away every file they chose, and the import finishes reporting nothing whatever. That
	// is a person's export disappearing in silence, so the decision is deferred until after the loop,
	// when whether a backup exists is finally known (R87L, mimo-v2.6-pro audit, refined: the bare
	// `continue` is right for a twin and wrong for a lone file, and only the backup tells them apart).
	const unread = [];
	for (const e of named) {
		if (typeof e.text !== 'string') { unread.push({entry: e, why: 'the file carried no readable text'}); continue; }
		let raw;
		try { raw = JSON.parse(e.text.replace(/^\uFEFF/, '')); } catch (_) {
			if (/\.json$/i.test(e.name) || /^\s*\{/.test(e.text)) {
				skipped.push({name: e.name, why: 'invalid JSON; literal source retained'});
				built.push({...literalImportSource(e, pool, 'Standard Notes JSON was damaged and could not be parsed.', e.characterWarnings, 'json'), created: -Infinity});
			} else unread.push({entry: e, why: 'not a Standard Notes backup'});
			continue;
		}
		if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) { unread.push({entry: e, why: 'not a Standard Notes backup'}); continue; }
		sources.push({items: raw.items, source: e});
	}
	// A backup was found, so the rest are its twins and are rightly ignored, exactly as before. With
	// no backup at all, the person is TOLD what was not read. Nothing is fabricated -- no note is
	// invented from a twin, which is this importer's own settled rule and the reason the witness
	// cell below it says so -- but a file they chose does not leave without a word either.
	if (!sources.length) for (const {entry, why} of unread) skipped.push({name: entry.name, why});
	for (const {items, source} of sources) {

	// A tag's own references name its notes; a note may also carry the reverse reference, since a
	// real account keeps both sides current for local queries -- both directions are read and
	// unioned, tag-file order first, so which side happened to carry a given link never matters.
	const tagTitle = new Map(), noteTags = new Map(), noteTagIds = new Map(), tagWarnings = new Map(), appliedTags = new Set();
	const addTag = (noteUuid, title, tagUuid) => {
		if (typeof title !== 'string') return;
		if (!noteTags.has(noteUuid)) noteTags.set(noteUuid, []);
		if (!noteTags.get(noteUuid).includes(title)) noteTags.get(noteUuid).push(title);
		if (!noteTagIds.has(noteUuid)) noteTagIds.set(noteUuid, new Set());
		noteTagIds.get(noteUuid).add(tagUuid);
	};
	for (const it of items) {
		if (!it || it.content_type !== 'Tag' || !it.content || typeof it.content.title !== 'string') continue;
		tagTitle.set(it.uuid, it.content.title);
		const rows = [];
		importMetadata(tagFields(it.content), [], rows, 'Standard Notes tag fields', {at: 'tags.' + it.uuid});
		tagWarnings.set(it.uuid, rows);
	}
	for (const it of items) {
		if (!it || it.content_type !== 'Tag' || !it.content) continue;
		for (const ref of Array.isArray(it.content.references) ? it.content.references : []) if (ref && ref.content_type === 'Note' && typeof ref.uuid === 'string') addTag(ref.uuid, it.content.title, it.uuid);
	}
	for (const it of items) {
		if (!it || it.content_type !== 'Note' || !it.content) continue;
		for (const ref of Array.isArray(it.content.references) ? it.content.references : []) if (ref && ref.content_type === 'Tag' && typeof ref.uuid === 'string' && tagTitle.has(ref.uuid)) addTag(it.uuid, tagTitle.get(ref.uuid), ref.uuid);
	}

	items.forEach((it, i) => {
		if (!it || it.content_type !== 'Note') {
			// A file, a component, a theme, the account's items key: named in the receipt by type, name
			// and id, never copied into it. A File item carries its own decryption key beside its name, a
			// component its hosted URL, an items key the account's key material; the folder is synced
			// and backed up, and another app's keys do not belong in it. Its bytes are not here either.
			if (it?.content_type !== 'Tag') {
				const kind = typeof it?.content_type === 'string' && it.content_type ? it.content_type : 'item';
				const name = typeof it?.content?.name === 'string' ? it.content.name : typeof it?.content?.title === 'string' ? it.content.title : '';
				warnings.push({code: 'source_item', rootId: source.rootId ?? '', sourceName: source.name, sourceItem: it?.uuid, item: {uuid: it?.uuid, content_type: it?.content_type, ...(name ? {name} : {})},
					message: 'Not a note, not imported: Standard Notes ' + kind + (name ? ' "' + name + '"' : '') + '. Only its name is kept, never its keys or a file\'s bytes.'});
			}
			return;
		}
		try {
			const label = typeof it.uuid === 'string' && it.uuid ? it.uuid : 'items[' + i + ']';
			if (typeof it.content === 'string') {
				const kept = literalImportSource({...source, text: JSON.stringify(it, null, 2), bytes: undefined}, pool, 'This Standard Notes note is encrypted and was not decrypted; export a decrypted backup to recover its text.', source.characterWarnings, 'json');
				built.push({...kept, sourceName: source.name, rootId: source.rootId ?? '', sourceItem: label, created: -Infinity}); return;
			}
			const content = it.content && typeof it.content === 'object' ? it.content : {};
			const title = typeof content.title === 'string' ? trimTitleSpace(content.title) : '';
			const raw = typeof content.text === 'string' ? content.text : '';
			if (!title && !raw.trim()) { skipped.push({name: label, why: 'empty note'}); return; }
			const warnings = [...(source.characterWarnings || []), ...[...(noteTagIds.get(it.uuid) || [])].flatMap(uuid => tagWarnings.get(uuid) || [])];
			const modified = importDate(it.updated_at, Date.parse(it.updated_at), warnings, 'Standard Notes edit date');
			const created = importDate(it.created_at, Date.parse(it.created_at), warnings, 'Standard Notes creation date');
			importMetadata(it, ['uuid','content_type','content','created_at','updated_at'], warnings, 'Standard Notes fields', {labels: SN_LABELS,
				unset: (key, value) => key === 'deleted' && value === false || key === 'created_at_timestamp' && value === created * 1000 || key === 'updated_at_timestamp' && value === modified * 1000});
			importMetadata(content, ['title','text','noteType','trashed','references','appData'], warnings, 'Standard Notes fields', {at: 'content', labels: SN_LABELS,
				unset: (key, value) => SN_CONTENT_OFF.has(key) && value === false || key === 'preview_plain' && typeof value === 'string' && raw.startsWith(value.endsWith('...') ? value.slice(0, -3) : value)});
			importMetadata(content.appData?.[APP_DOMAIN], ['pinned','archived'], warnings, 'Standard Notes fields', {at: 'content.appData.' + APP_DOMAIN, labels: SN_LABELS,
				unset: (key, value) => SN_APP_OFF.has(key) && value === false || key === 'client_updated_at' && Date.parse(value) === modified});
			importMetadata(content.appData, [APP_DOMAIN], warnings, 'Standard Notes extension data', {at: 'content.appData'});
			reportCharacterChange(content.title, title.replace(/[ \t\r\n\f]+/g, ' '), warnings, 'Standard Notes title');
			let body;
			if (content.noteType === 'super') {
				let doc = null; try { doc = JSON.parse(raw); } catch (_) { /* falls through to plain-text below */ }
				let flattened = null;
				try { flattened = doc && superLines(doc, warnings); }
				catch (_) { warnings.push({code: 'import-source-retained', message: 'Damaged Super character data was kept as literal source; nested structure could not be converted.'}); }
				body = flattened !== null && flattened !== undefined ? flattened : literalBlock(raw);
				if (flattened === null || flattened === undefined) warnings.push({code: 'unsupported_block', message: 'Unrecognised Super document kept as literal text.'});
			} else if (content.noteType === 'markdown') body = raw.replace(/\r\n?/g, '\n');
			else body = literalBlock(raw); // plain-text and every other editor kind: escaped, never guessed at further
			reportCharacterChange(raw, body, warnings, 'Standard Notes body');
			const blocks = [];
			// The note's own title field is its level-one heading, the title the card and the open note's
			// Title field read (task #369, docs/notes-cards.md §16), its characters literal.
			if (title) blocks.push('# ' + literalInline(title.replace(/[ \t\r\n\f]+/g, ' ')).replace(/(\s+#+)$/, m => m.replace('#', '\\#')));
			if (body) blocks.push(body);
			const joined = blocks.join('\n\n');
			let text = joined + (joined.endsWith('\n') ? '' : '\n');
			// Linking-menu relationships are exported by UUID, not by title. Ordinary links
			// carry them into Markdown; the shared final map binds only a unique same-root UUID.
			for (const ref of Array.isArray(content.references) ? content.references : []) if (ref?.content_type === 'Note' && typeof ref.uuid === 'string') {
				const targets = items.filter(item => item?.content_type === 'Note' && item.uuid === ref.uuid);
				const name = targets.length === 1 && typeof targets[0].content?.title === 'string' ? targets[0].content.title : ref.uuid;
				text += '\n[' + literalInline(name) + '](' + literalDestination('standardnotes://note/' + ref.uuid) + ')\n';
			}
			if (text === '\n') { skipped.push({name: label, why: 'empty note'}); return; }
			const file = noteFileName(text, pool); pool.push(file);
			const appData = content.appData && content.appData[APP_DOMAIN];
			const tags = noteTags.get(it.uuid) || [];
			const entry = {order: '', pinned: !!(appData && appData.pinned), skill: false, archived: !!(appData && appData.archived), trashed: content.trashed === true, colour: ''};
			importTrash(entry, options, warnings);
			if (tags.length) { entry.category = tags[0]; addSection(tags[0]); }
			if (Number.isFinite(modified)) entry.modified = modified;
			// A tag is its own item in the backup, never part of the note's text: the names both
			// directions agree on are written into the note's own metadata block, in that same order.
			built.push({file, text: importTags(text, tags, warnings, label), entry, sourceName: source.name, rootId: source.rootId ?? '', sourceItem: label, sourceAliases: typeof it.uuid === 'string' ? ['standardnotes://note/' + it.uuid] : [], warnings, created: Number.isFinite(created) ? created : -Infinity});
			for (const uuid of noteTagIds.get(it.uuid) || []) appliedTags.add(uuid);
		} catch (_) { skipped.push({name: typeof it.uuid === 'string' ? it.uuid : 'items[' + i + ']', why: 'could not be read'}); }
	});
	// An empty/orphan tag cannot become note frontmatter. Its name still belongs to the
	// export, including a backup with no notes, so the source-scoped receipt must account for it.
	for (const [uuid, name] of tagTitle) if (!appliedTags.has(uuid)) {
		warnings.push({code: 'source_item', rootId: source.rootId ?? '', sourceName: source.name, sourceItem: uuid, item: {uuid, content_type: 'Tag', name},
			message: 'Standard Notes tag "' + name + '" had no imported note. Its name is kept in this import record.'});
		for (const row of tagWarnings.get(uuid) || []) warnings.push({...row, rootId: source.rootId ?? '', sourceName: source.name, sourceItem: uuid});
	}

	}
	// Order: chained orderAfter keys after lastOrder, newest first -- see takeout.mjs's own comment on
	// importTakeout for why the newest-to-oldest direction hands the newest note the lowest key.
	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	// Standard Notes carries no per-note colour of its own (docs/notes-import-sources.md section 3)
	// and a decrypted backup has no file attachments to recover.
	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, warnings, pictures: []});
}
