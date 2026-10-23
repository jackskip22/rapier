// SPDX-License-Identifier: AGPL-3.0-only
var _rapierDrawPart = null, _rapierJxlPart = null, _rapierJxlCompletePart = null, _rapierNotesPart = null, _rapierDocumentPart = null, _rapierComposerPart = null, _rapierPresetPart = null;
async function _rapierOpenPresets() {
	if (!_rapierSettlePendingDocumentChange()) return;
	const capture = _rapierCaptureEngineDialogTarget(), stamp = Object.freeze(_rapierMutationStamp());
	if (await _rapierPartReady('presets') && _rapierMutationStampIsCurrent(stamp)) _rapierPresetPart.open(capture);
}
async function _rapierOpenSpacing() {
	if (await _rapierPartReady('document')) return _rapierDocumentPart.spacing();
}
async function _rapierOpenBlockSpacing(wrapper) {
	if (await _rapierPartReady('document')) return _rapierDocumentPart.blockSpacing(wrapper);
}
function _rapierPartAvailable(id) { return typeof RapierParts !== 'undefined' && RapierParts.has(id); }
function _rapierDrawOffered() { return !!_rapierDrawPart || _rapierPartAvailable('drawing'); }
function _rapierPartWait(id, said = '') {
	const noun = said || RapierParts.pin(id)?.label || id, popup = _rapierProgressOpen({label: (said ? 'Downloading ' : 'Loading ') + noun, after: 500});
	const follow = ({detail: {id: part, status, progress}}) => {
		if (part !== id) return;
		if (status === 'downloading') popup.set(progress > 0 ? progress : null, 'Downloading ' + noun);
		else if (status === 'installing') popup.set(null, said ? 'Downloading ' + noun : 'Starting ' + noun);
	};
	addEventListener('rapier:part', follow);
	return RapierParts.need(id).finally(() => { removeEventListener('rapier:part', follow); popup.end(); });
}
async function _rapierPartReady(id, said = '') {
	try {
		await RapierParts.check(id).catch(() => {});
		if (RapierParts.status(id)?.update?.required && !await _rapierPartUpdateAsk(id, said)) return false;
		await _rapierPartWait(id, said); return true;
	}
	catch (error) {
		if (error?.cause?.code === 'part_not_carried') void _rapierFullEditorOnly(said || (id === 'drawing' ? 'Draw' : RapierParts.pin(id)?.label || id));
		else showToast(_rapierErrorWords(error, 'Couldn’t load that part of Rapier.'), 'error');
		return false;
	}
}
async function _rapierFullEditorOnly(feature) {
	const answer = await rapierConfirm({title: feature, plain: true, confirmLabel: 'Open rapier.website',
		message: 'This file has no ' + feature + '. Open it at rapier.website.'});
	if (answer === true) window.open('https://rapier.website/', '_blank', 'noopener');
}
function _rapierSealedMark() {
	if (typeof RapierParts === 'undefined' || !RapierParts.sealed()) return;
	const root = document.documentElement;
	root.dataset.rapierSealed = '';
	const name = () => { root.dataset.rapierCarries = [...document.querySelectorAll('script[id^="rapier-part-"], script[id^="rapier-plugin-"]')].map(element => element.id.replace(/^rapier-(?:part|plugin)-/, '')).join(' '); };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', name, {once: true}); else name();
}
_rapierSealedMark();
async function _rapierPartUpdateRun(id, said = '') {
	const noun = said || RapierParts.pin(id)?.label || id, popup = _rapierProgressOpen({label: 'Updating ' + noun, after: 0});
	const follow = ({detail: {id: part, status, progress}}) => { if (part === id && status === 'downloading') popup.set(progress > 0 ? progress : null, 'Updating ' + noun + (progress > 0 ? ' \u00b7 ' + Math.floor(progress * 100) + '%' : '')); };
	addEventListener('rapier:part', follow);
	try { await RapierParts.update(id); return true; }
	catch (error) { showToast(_rapierErrorWords(error, 'Couldn’t update.'), 'error'); return false; }
	finally { removeEventListener('rapier:part', follow); popup.end(); }
}
async function _rapierPartUpdateAsk(id, said = '') {
	const noun = said || RapierParts.pin(id)?.label || id, update = RapierParts.status(id).update;
	const answer = await rapierConfirm({title: 'Update ' + noun + '?', message: 'Needed for this version \u00b7 ' + _rapierPluginSize(update.bytes), confirmLabel: 'Update', plain: true});
	if (answer !== true) { showToast(noun + ' needs the update', 'info'); return false; }
	return await _rapierPartUpdateRun(id, said);
}
function _rapierOpenDrawPart() {
	if (_rapierDrawOffered()) void _rapierPartReady('drawing').then(ready => { if (ready) _rapierDrawPart.open(); });
}
function _rapierPartRowPaint(id, name, prefix) {
	const row = document.getElementById(prefix + '-plugin-row'), action = document.getElementById(prefix + '-plugin-action'), installed = document.getElementById(prefix + '-plugin-installed');
	if (!row || !action || !installed) return;
	row.hidden = !_rapierPartAvailable(id);
	if (row.hidden) return;
	const state = RapierParts.status(id), status = state?.status, update = state?.update, here = ['ready', 'carried', 'stored'].includes(status);
	const held = here && !update;
	action.hidden = held; installed.hidden = !held;
	action.disabled = status === 'downloading' || status === 'installing';
	action.textContent = status === 'downloading' ? 'DOWNLOADING ' + name + '…' : status === 'installing' ? 'INSTALLING ' + name + '…'
		: update ? 'UPDATE ' + name + ' \u00b7 ' + _rapierPluginSize(update.bytes)
		: status === 'error' ? 'INSTALL ' + name + ' (RETRY)' : 'INSTALL ' + name;
}
async function _rapierPartRowTap(id, paint) {
	if (RapierParts.status(id)?.update) await _rapierPartUpdateRun(id); else await _rapierPartReady(id);
	paint();
}
function _rapierDrawingRowPaint() { _rapierPartRowPaint('drawing', 'DRAWING', 'drawing'); }
function _rapierNotesPartRowPaint() { _rapierPartRowPaint('notes', 'NOTES', 'notes'); }
for (const [id, paint, act] of [['drawing', _rapierDrawingRowPaint, 'drawing-install'], ['notes', _rapierNotesPartRowPaint, 'notes-part-install']]) {
	if (!_rapierPartAvailable(id)) continue;
	addEventListener('rapier:part', event => { if (event.detail?.id === id) paint(); });
	document.addEventListener('click', event => { if (event.target.closest?.('[data-action="' + act + '"]')) void _rapierPartRowTap(id, paint); });
	_rapierBootFactsPublished.then(() => RapierParts.check(id)).then(paint, () => {});
}
const RAPIER_GALLERY_ROWS = Object.freeze([
	{id: 'borders', name: 'PAGE BORDERS', noun: 'Page borders', stores: ['templates']},
	{id: 'elements', name: 'ELEMENTS', noun: 'Elements', stores: ['elements-ac', 'elements-dn', 'elements-oz']},
	{id: 'letters', name: 'LETTER SETS', noun: 'Letter sets', stores: ['lettersets']},
]);
const _rapierGalleryRows = new Map(RAPIER_GALLERY_ROWS.map(row => [row.id, {held: false, live: null, update: null}]));
async function _rapierGalleryHeld(row) {
	if (!['ready', 'carried', 'stored'].includes(RapierParts.status('presets')?.status)) return false;
	try {
		const mark = await RapierBundleIO.store('gallery').get(row.id);
		if (!mark) return false;
		if (mark.sri !== RapierParts.pin('presets')?.sri) return null;
		if (typeof window.RapierPlatform?.resources?.ensure === 'function') return true;
		const sets = Array.isArray(mark.sets) ? mark.sets : [];
		if (sets.length !== row.stores.length) return false;
		for (const set of sets) {
			const record = await RapierBundleIO.store(set.slot).get(set.version);
			if (!record?.files || !set.names.every(name => record.files[name] && (record.files[name].byteLength || record.files[name].length || record.files[name].size))) return false;
		}
		return true;
	} catch (_) { return false; }
}
function _rapierGalleryRowsPaint() {
	for (const row of RAPIER_GALLERY_ROWS) {
		const node = document.getElementById(row.id + '-plugin-row'), action = document.getElementById(row.id + '-plugin-action'), installed = document.getElementById(row.id + '-plugin-installed');
		if (!node || !action || !installed) continue;
		node.hidden = !_rapierPartAvailable('presets');
		if (node.hidden) continue;
		const state = _rapierGalleryRows.get(row.id), status = state.live || (state.held ? 'ready' : 'absent');
		const held = status === 'ready' && !state.update;
		action.hidden = held; installed.hidden = !held;
		action.disabled = status === 'downloading';
		action.textContent = status === 'downloading' ? 'DOWNLOADING ' + row.name + '…' : state.update ? 'UPDATE ' + row.name + ' · ' + _rapierPluginSize(state.update.bytes)
			: status === 'error' ? 'INSTALL ' + row.name + ' (RETRY)' : 'INSTALL ' + row.name;
	}
}
async function _rapierGalleryRowsCheck() {
	if (!_rapierPartAvailable('presets')) return;
	for (const row of RAPIER_GALLERY_ROWS) {
		let held = await _rapierGalleryHeld(row), update = null;
		if (held === null) {
			try {
				await RapierParts.need('presets');
				const here = await _rapierComposerPart.gallery.status(row.id);
				held = here.status === 'ready'; update = here.update || null;
				if (held && !update) await _rapierComposerPart.gallery.mark(row.id);
			} catch (_) { held = false; }
		}
		Object.assign(_rapierGalleryRows.get(row.id), {held, update});
	}
	_rapierGalleryRowsPaint();
}
async function _rapierGalleryInstall(id) {
	if (!await _rapierPartReady('presets', RAPIER_GALLERY_ROWS.find(row => row.id === id)?.noun)) return;
	try { await _rapierComposerPart.gallery[_rapierGalleryRows.get(id)?.update ? 'update' : 'install'](id); }
	catch (error) { if (!error?.canceled) showToast(_rapierErrorWords(error, 'Couldn’t download.'), 'error'); }
	await _rapierGalleryRowsCheck();
}
function _rapierGalleryRowsBuild() {
	const model = document.getElementById('notes-plugin-row');
	if (!model || document.getElementById('borders-plugin-row')) return;
	let after = model;
	for (const row of RAPIER_GALLERY_ROWS) {
		const node = model.cloneNode(true), action = node.querySelector('#notes-plugin-action'), installed = node.querySelector('#notes-plugin-installed');
		node.id = row.id + '-plugin-row'; action.id = row.id + '-plugin-action'; installed.id = row.id + '-plugin-installed';
		action.dataset.action = 'gallery-install'; action.dataset.gallery = row.id; installed.dataset.plugin = row.id; installed.querySelector('span').textContent = row.name + ' INSTALLED';
		action.textContent = 'INSTALL ' + row.name; node.hidden = true;
		after.after(node); after = node;
	}
	addEventListener('rapier:gallery', event => {
		const {id, status} = event.detail || {}, state = _rapierGalleryRows.get(id);
		if (!state) return;
		state.live = status === 'downloading' || status === 'error' ? status : null;
		if (status === 'ready') state.held = true; else if (status === 'absent') state.held = false;
		_rapierGalleryRowsPaint();
	});
	addEventListener('rapier:part', event => { if (event.detail?.id === 'presets') _rapierGalleryRowsPaint(); });
	document.addEventListener('click', event => { const control = event.target.closest?.('[data-action="gallery-install"]'); if (control) void _rapierGalleryInstall(control.dataset.gallery); });
	_rapierBootFactsPublished.then(() => RapierParts.check('presets')).then(_rapierGalleryRowsCheck, () => {});
}
if (_rapierPartAvailable('presets')) _rapierGalleryRowsBuild();
function _rapierJxlCompleteRowPaint() { _rapierPartRowPaint('jxlcomplete', 'JPEG XL COMPLETE', 'jxl-complete'); }
if (_rapierPartAvailable('jxlcomplete')) {
	const model = document.getElementById('notes-plugin-row');
	if (model && !document.getElementById('jxl-complete-plugin-row')) {
		const node = model.cloneNode(true), action = node.querySelector('#notes-plugin-action'), installed = node.querySelector('#notes-plugin-installed');
		node.id = 'jxl-complete-plugin-row'; action.id = 'jxl-complete-plugin-action'; installed.id = 'jxl-complete-plugin-installed';
		action.dataset.action = 'jxl-complete-install'; installed.dataset.plugin = 'jxl-complete'; installed.querySelector('span').textContent = 'JPEG XL COMPLETE INSTALLED';
		action.textContent = 'INSTALL JPEG XL COMPLETE'; node.hidden = true;
		(document.getElementById('letters-plugin-row') || model).after(node);
	}
	addEventListener('rapier:part', event => { if (event.detail?.id === 'jxlcomplete') _rapierJxlCompleteRowPaint(); });
	document.addEventListener('click', event => { if (event.target.closest?.('[data-action="jxl-complete-install"]')) void _rapierPartRowTap('jxlcomplete', _rapierJxlCompleteRowPaint); });
	_rapierBootFactsPublished.then(() => RapierParts.check('jxlcomplete')).then(_rapierJxlCompleteRowPaint, () => {});
}
addEventListener('pointerdown', event => {
	const control = event.target instanceof Element ? event.target.closest('[data-command="insert.draw"], [data-action="open-draw"], .rapier-image-tools__draw, [data-action="notes-open"]') : null;
	const id = !control ? null : control.matches('[data-action="notes-open"]') ? 'notes' : 'drawing';
	if (id && _rapierPartAvailable(id) && !RapierParts.ready(id)) RapierParts.need(id).catch(() => {});
}, true);

function _rapierComposerAct(name) { void _rapierPartReady('presets', name === 'borders' ? 'Page borders' : 'Elements').then(ready => { if (ready) _rapierComposerPart[name](); }); }
function _rapierComposerOffered() { return !!_rapierComposerPart || _rapierPartAvailable('presets'); }
function _rapierElementImage(image) {
	const url = (image && _rapierDrawImageDataUrl(image)) || '';
	return RapierImageAssets.svgDataPrefix(url).includes('id="rapier-element"');
}
function _rapierComposerPaint() {
	const bar = document.getElementById('fmt-btn-elements');
	if (bar) bar.hidden = !_rapierComposerOffered();
}
function _rapierSyncStartersButton() {
	const host = document.getElementById('editor-blocks');
	if (!host) return;
	let box = host.querySelector(':scope > .rapier-empty-starters');
	const empty = _rapierPartAvailable('presets') && rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source' && !rapier.access.readOnly &&
		typeof globalThis.RAPIER_PAIRED_DOCUMENT !== 'string' && !_rapierEmbed.active && rapier.document.source.length === 0;
	if (!empty) { box?.remove(); return; }
	if (!box) {
		box = document.createElement('div'); box.className = 'rapier-empty-starters'; box.contentEditable = 'false';
		const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-action-btn rapier-empty-starters__btn'; button.textContent = 'Gallery';
		button.dataset.action = 'starters';
		box.append(button);
	}
	const line = host.querySelector(':scope > .block-wrapper');
	if (line ? line.nextElementSibling !== box : box.parentNode !== host) (line ? line.after(box) : host.append(box));
}
function _rapierComposerCommands() {
	return !_rapierComposerOffered() ? [] : [
		{ id: 'insert.elements', label: 'Elements', group: 'insert', icon: 'image', glyph: '❦',
			keywords: ['ornament', 'border', 'frame', 'divider', 'flourish', 'corner', 'fleuron', 'decoration', 'svg'], mutates: true, run: () => _rapierComposerAct('elements') },
	];
}
function _rapierOpenJxlPart() { if (_rapierPartAvailable('jxl')) void _rapierPartReady('jxl').then(ready => { if (ready) _rapierJxlPart.open(); }); }
function _rapierPartCommands() {
	return [
	{ id: 'insert.draw', label: 'Draw', group: 'insert', icon: 'pen-tool', glyph: '✎',
		keywords: ['sketch', 'shape', 'svg', 'picture', 'pen', 'finger', 'circle', 'triangle', 'arrow'], mutates: true, run: () => { _rapierOpenDrawPart(); } },
	{ id: 'insert.jxl', label: 'JPEG XL converter', group: 'insert', icon: 'image', glyph: 'XL',
		keywords: ['jxl', 'jpeg xl', 'convert', 'jpg', 'png', 'picture', 'image', 'batch', 'zip', 'compress', 'offline'], run: () => _rapierOpenJxlPart() },
	{ id: 'insert.starters', label: 'Gallery', group: 'insert', icon: 'book-open', glyph: '▤',
		keywords: ['starter', 'template', 'border', 'title page', 'frame', 'art', 'classical', 'page'], run: () => _rapierOpenPresets() },
	];
}
function _rapierCommandSet(list) {
	return Object.freeze(list.concat(_rapierComposerCommands()).filter(command => command.id !== 'insert.draw' || _rapierDrawOffered()).filter(command => command.id !== 'insert.jxl' || _rapierPartAvailable('jxl'))
		.map(command => Object.freeze({ ...command, keywords: Object.freeze(command.keywords.slice()) })));
}
document.addEventListener('click', event => {
	if (!event.target.closest?.('[data-action="starters"]')) return;
	void _rapierOpenPresets();
});

function _rapierTemplatePage() { return globalThis.RapierMarkdownSpec.isTemplatePage(String(rapier.document.frontmatter || '')); }
function _rapierWordPage() { const layout = RapierPreferences.read('layout'); return layout === 'docx' || layout === 'rapier' && _rapierTemplatePage(); }
function _rapierKeepPageBorder() {
	if (!_rapierTemplatePage() || rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown') return;
	const host = _editorHostEl(), selection = window.getSelection?.();
	if (!host || !selection?.rangeCount) return;
	const blocks = rapier.document.blocks, block = blocks.find(row => _rapierPageBorderBlock(row)), border = block && _rapierBlockWrapperById(block.id, host);
	if (!border) return;
	const range = selection.getRangeAt(0), focus = document.activeElement;
	if (!(focus === host || host.contains(focus)) || !_nodeInside(host, range.startContainer) && range.startContainer !== host && !range.intersectsNode(border)) return;
	const after = document.createRange(); after.setStartAfter(border); after.collapse(true);
	const reaches = (node, offset) => after.comparePoint(node, offset) < 0;
	if (!reaches(range.startContainer, range.startOffset)) return;
	if (range.collapsed || reaches(range.endContainer, range.endOffset)) {
		if (!range.collapsed && range.startContainer === host && range.endContainer === host && range.endOffset - range.startOffset === 1 &&
			host.childNodes[range.startOffset] === border) return;
		_rapierPageBorderWords(block);
		return;
	}
	const following = blocks[blocks.indexOf(block) + 1], next = following && _rapierBlockWrapperById(following.id, host), live = next && _liveBlockEl(next);
	const trimmed = range.cloneRange();
	if (live) trimmed.setStart(..._rapierBlockStartPoint(live)); else trimmed.setStartAfter(border);
	selection.removeAllRanges(); selection.addRange(trimmed);
}
(() => {
	const keep = () => { try { _rapierKeepPageBorder(); } catch (_) {} };
	for (const type of ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'compositionstart']) window.addEventListener(type, keep, true);
	document.addEventListener('selectionchange', keep);
})();

function _rapierSyncDocumentMode() {
	if (_rapierDocumentPart) _rapierDocumentPart.sync();
	else if (_rapierWordPage()) void _rapierPartReady('document').then(ready => { if (ready) _rapierDocumentPart.sync(); });
}
