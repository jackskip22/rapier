// SPDX-License-Identifier: AGPL-3.0-only
var _rapierDrawPart = null, _rapierNotesPart = null, _rapierDocumentPart = null;
async function _rapierOpenSpacing() {
	if (await _rapierPartReady('document')) return _rapierDocumentPart.spacing();
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
function _rapierDrawingRowPaint() {
	const row = document.getElementById('drawing-plugin-row'), action = document.getElementById('drawing-plugin-action'), installed = document.getElementById('drawing-plugin-installed');
	if (!row || !action || !installed) return;
	row.hidden = !_rapierPartAvailable('drawing');
	if (row.hidden) return;
	const status = RapierParts.status('drawing')?.status, held = ['ready', 'carried', 'stored'].includes(status);
	action.hidden = held; installed.hidden = !held;
	action.disabled = status === 'downloading' || status === 'installing';
	action.textContent = status === 'downloading' ? 'DOWNLOADING DRAWING…' : status === 'installing' ? 'INSTALLING DRAWING…'
		: status === 'error' ? 'INSTALL DRAWING (RETRY)' : 'INSTALL DRAWING';
}
if (_rapierPartAvailable('drawing')) {
	addEventListener('rapier:part', event => { if (event.detail?.id === 'drawing') _rapierDrawingRowPaint(); });
	document.addEventListener('click', event => { if (event.target.closest?.('[data-action="drawing-install"]')) void _rapierPartReady('drawing'); });
	_rapierBootFactsPublished.then(() => RapierParts.check('drawing')).then(_rapierDrawingRowPaint, () => {});
}
addEventListener('pointerdown', event => {
	const control = event.target instanceof Element ? event.target.closest('[data-command="insert.draw"], [data-action="open-draw"], .rapier-image-tools__draw, [data-action="notes-open"]') : null;
	const id = !control ? null : control.matches('[data-action="notes-open"]') ? 'notes' : 'drawing';
	if (id && _rapierPartAvailable(id) && !RapierParts.ready(id)) RapierParts.need(id).catch(() => {});
}, true);

function _rapierSyncDocumentMode() {
	if (_rapierDocumentPart) _rapierDocumentPart.sync();
	else if (RapierPreferences.read('layout') === 'docx') void _rapierPartReady('document').then(ready => { if (ready) _rapierDocumentPart.sync(); });
}
