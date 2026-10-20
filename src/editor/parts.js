// SPDX-License-Identifier: AGPL-3.0-only
var _rapierDrawPart = null, _rapierNotesPart = null, _rapierDocumentPart = null, _rapierComposerPart = null, _rapierPresetPart = null;
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
function _rapierPartWait(id) {
	const noun = RapierParts.pin(id)?.label || id, popup = _rapierProgressOpen({label: 'Loading ' + noun, after: 500});
	const follow = ({detail: {id: part, status, progress}}) => {
		if (part !== id) return;
		if (status === 'downloading') popup.set(progress > 0 ? progress : null, 'Downloading ' + noun);
		else if (status === 'installing') popup.set(null, 'Starting ' + noun);
	};
	addEventListener('rapier:part', follow);
	return RapierParts.need(id).finally(() => { removeEventListener('rapier:part', follow); popup.end(); });
}
async function _rapierPartReady(id) {
	try { await _rapierPartWait(id); return true; }
	catch (error) { showToast(String(error?.message || error), 'error'); return false; }
}
function _rapierOpenDrawPart() {
	if (_rapierDrawOffered()) void _rapierPartReady('drawing').then(ready => { if (ready) _rapierDrawPart.open(); });
}
function _rapierPartRowPaint(id, name, prefix) {
	const row = document.getElementById(prefix + '-plugin-row'), action = document.getElementById(prefix + '-plugin-action'), installed = document.getElementById(prefix + '-plugin-installed');
	if (!row || !action || !installed) return;
	row.hidden = !_rapierPartAvailable(id);
	if (row.hidden) return;
	const status = RapierParts.status(id)?.status, held = ['ready', 'carried', 'stored'].includes(status);
	action.hidden = held; installed.hidden = !held;
	action.disabled = status === 'downloading' || status === 'installing';
	action.textContent = status === 'downloading' ? 'DOWNLOADING ' + name + '…' : status === 'installing' ? 'INSTALLING ' + name + '…'
		: status === 'error' ? 'INSTALL ' + name + ' (RETRY)' : 'INSTALL ' + name;
}
function _rapierDrawingRowPaint() { _rapierPartRowPaint('drawing', 'DRAWING', 'drawing'); }
function _rapierNotesPartRowPaint() { _rapierPartRowPaint('notes', 'NOTES', 'notes'); }
for (const [id, paint, act] of [['drawing', _rapierDrawingRowPaint, 'drawing-install'], ['notes', _rapierNotesPartRowPaint, 'notes-part-install']]) {
	if (!_rapierPartAvailable(id)) continue;
	addEventListener('rapier:part', event => { if (event.detail?.id === id) paint(); });
	document.addEventListener('click', event => { if (event.target.closest?.('[data-action="' + act + '"]')) void _rapierPartReady(id); });
	_rapierBootFactsPublished.then(() => RapierParts.check(id)).then(paint, () => {});
}
addEventListener('pointerdown', event => {
	const control = event.target instanceof Element ? event.target.closest('[data-command="insert.draw"], [data-action="open-draw"], .rapier-image-tools__draw, [data-action="notes-open"]') : null;
	const id = !control ? null : control.matches('[data-action="notes-open"]') ? 'notes' : 'drawing';
	if (id && _rapierPartAvailable(id) && !RapierParts.ready(id)) RapierParts.need(id).catch(() => {});
}, true);

function _rapierComposerAct(name) { void _rapierPartReady('presets').then(ready => { if (ready) _rapierComposerPart[name](); }); }
function _rapierComposerOffered() { return !!_rapierComposerPart || _rapierPartAvailable('presets'); }
function _rapierElementImage(image) {
	const url = (image && _rapierDrawImageDataUrl(image)) || '';
	return url.startsWith('data:image/svg+xml;base64,') && atob(url.slice(26, 1226)).includes('id="rapier-element"');
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
function _rapierPartCommands() {
	return [
	{ id: 'insert.draw', label: 'Draw', group: 'insert', icon: 'pen-tool', glyph: '✎',
		keywords: ['sketch', 'shape', 'svg', 'picture', 'pen', 'finger', 'circle', 'triangle', 'arrow'], mutates: true, run: () => { _rapierOpenDrawPart(); } },
	{ id: 'insert.starters', label: 'Gallery', group: 'insert', icon: 'book-open', glyph: '▤',
		keywords: ['starter', 'template', 'border', 'title page', 'frame', 'art', 'classical', 'page'], run: () => _rapierOpenPresets() },
	];
}
function _rapierCommandSet(list) {
	return Object.freeze(list.concat(_rapierComposerCommands()).filter(command => command.id !== 'insert.draw' || _rapierDrawOffered())
		.map(command => Object.freeze({ ...command, keywords: Object.freeze(command.keywords.slice()) })));
}
document.addEventListener('click', event => {
	if (!event.target.closest?.('[data-action="starters"]')) return;
	void _rapierOpenPresets();
});

function _rapierTemplatePage() { return /^template:[ \t]*page[ \t]*$/m.test(String(rapier.document.frontmatter || '')); }
function _rapierWordPage() { const layout = RapierPreferences.read('layout'); return layout === 'docx' || layout === 'rapier' && _rapierTemplatePage(); }
function _rapierSyncDocumentMode() {
	if (_rapierDocumentPart) _rapierDocumentPart.sync();
	else if (_rapierWordPage()) void _rapierPartReady('document').then(ready => { if (ready) _rapierDocumentPart.sync(); });
}
