
const _rapierPluginDelete = {asking: null, busy: false, bound: false};
const RAPIER_PLUGIN_DELETE = Object.freeze({
	math: {name: 'math', what: 'the math renderer', after: 'Math shows as its TeX source until you install it again.',
		held: () => _rapierProviders.math?.status === 'ready' && _rapierProviders.math.deletable,
		async forget() { await _rapierProviders.math.forget(); _rapierUiMath.dismissed = true; if (typeof rerenderMathBlocks === 'function') rerenderMathBlocks(); }},
	mermaid: {name: 'diagram', what: 'the diagram renderer', after: 'Diagrams that need this plug-in show their source until you install it again.',
		held: () => _rapierProviders.mermaid?.status === 'ready' && _rapierProviders.mermaid.deletable,
		async forget() { await _rapierProviders.mermaid.forget(); await _rapierProviders['mermaid-zenuml']?.forget(); _rapierUiDiagram.dismissed = true; if (typeof rerenderDiagramBlocks === 'function') rerenderDiagramBlocks(); }},
	pdf: {name: 'PDF import', what: 'the PDF reader', after: 'Importing a PDF asks to download it again.',
		held: () => { const state = globalThis.RapierPdfPlugin?.state(); return !!state?.installed && state.deletable; },
		async forget() { await globalThis.RapierPdfPlugin.forget(); if (typeof _rapierPdfSettingsRefresh === 'function') _rapierPdfSettingsRefresh(); }},
	drawing: {name: 'Drawing', what: 'the Drawing part kept on this device', after: 'Draw, Paint and Water download it again when you next open them. Your drawings stay in your documents.',
		held: () => RapierParts.status('drawing')?.status === 'stored' || RapierParts.status('drawing')?.status === 'ready' && RapierParts.deletable('drawing'),
		async forget() { await RapierParts.forget('drawing'); _rapierDrawingRowPaint(); }},
	notes: {name: 'Notes', what: 'the Notes part kept on this device', after: 'Notes downloads it again when you next open it. Your notes stay where they are.',
		held: () => RapierParts.status('notes')?.status === 'stored' || RapierParts.status('notes')?.status === 'ready' && RapierParts.deletable('notes'),
		async forget() { await RapierParts.forget('notes'); _rapierNotesPartRowPaint(); }},
	'jxl-complete': {name: 'JPEG XL complete', what: 'JPEG XL complete kept on this device', after: 'Converting a video or an animation downloads it again. Pictures convert as before.',
		held: () => RapierParts.status('jxlcomplete')?.status === 'stored' || RapierParts.status('jxlcomplete')?.status === 'ready' && RapierParts.deletable('jxlcomplete'),
		async forget() { await RapierParts.forget('jxlcomplete'); _rapierJxlCompleteRowPaint(); }},
	borders: {host: 'templates', name: 'Page borders', what: 'the page borders kept on this device', after: 'They download again when you next open them.',
		held: () => _rapierGalleryRows.get('borders').held,
		async forget() {
			if (!_rapierComposerPart) await RapierParts.need('presets');
			await _rapierComposerPart.gallery.forget('borders');
			_rapierGalleryRows.get('borders').held = false; _rapierGalleryRowsPaint();
		}},
	elements: {host: 'elements', name: 'Elements', what: 'every Element kept on this device', after: 'They download again when you next open them.',
		held: () => _rapierGalleryRows.get('elements').held,
		async forget() {
			if (!_rapierComposerPart) await RapierParts.need('presets');
			await _rapierComposerPart.gallery.forget('elements');
			_rapierGalleryRows.get('elements').held = false; _rapierGalleryRowsPaint();
		}},
	letters: {host: 'lettersets', name: 'Letter sets', what: 'the letter sets kept on this device', after: 'They download again when you next open them.',
		held: () => _rapierGalleryRows.get('letters').held,
		async forget() {
			if (!_rapierComposerPart) await RapierParts.need('presets');
			await _rapierComposerPart.gallery.forget('letters');
			_rapierGalleryRows.get('letters').held = false; _rapierGalleryRowsPaint();
		}},
	ocr: {name: 'text in pictures', what: 'the text reader and every word it read in your pictures', after: 'Search stops finding the words in pictures.',
		held: () => _rapierProviders.ocr?.status === 'ready' && _rapierProviders.ocr.deletable,
		async forget() { await _rapierOcrForgetPlugin(); }},
});

function _rapierPluginDeleteAsk(key) {
	const plugin = RAPIER_PLUGIN_DELETE[key], overlay = document.getElementById('plugin-delete-overlay');
	if (!plugin || !overlay || !plugin.held() || _rapierPluginDelete.busy) return;
	_rapierPluginDelete.asking = key;
	document.getElementById('plugin-delete-title').textContent = 'Delete the ' + plugin.name + ' plugin?';
	const hostWords = window.RapierPlatform?.resources.installMessage?.(plugin.host || key, 'delete') || '';
	document.getElementById('plugin-delete-body').textContent = hostWords ? hostWords + '\n• ' + plugin.after
		: '• Removes ' + plugin.what + '.\n• ' + plugin.after;
	document.getElementById('plugin-delete-body').style.whiteSpace = 'pre-line';
	document.getElementById('plugin-delete-error').hidden = true;
	_rapierPluginDeletePaint();
	openDialog(overlay, {panel: '.settings-panel', onEscape: _rapierPluginDeleteKeep});
}
function _rapierPluginDeletePaint() {
	const busy = _rapierPluginDelete.busy, now = document.getElementById('plugin-delete-now');
	if (!now) return;
	now.disabled = busy;
	now.textContent = busy ? 'deleting…' : 'delete';
}
function _rapierPluginDeleteKeep() {
	if (_rapierPluginDelete.busy) return;
	_rapierPluginDelete.asking = null;
	closeDialog(document.getElementById('plugin-delete-overlay'));
}
async function _rapierPluginDeleteNow() {
	const state = _rapierPluginDelete, key = state.asking, plugin = RAPIER_PLUGIN_DELETE[key];
	if (!plugin || state.busy) return;
	state.busy = true; _rapierPluginDeletePaint();
	try {
		if (typeof _rapierPersonal !== 'undefined') _rapierPersonal.declinePlugin(key);
		await plugin.forget();
		state.asking = null;
		closeDialog(document.getElementById('plugin-delete-overlay'));
	} catch (error) {
		const said = document.getElementById('plugin-delete-error');
		said.textContent = 'Not deleted: ' + String(error?.message || error);
		said.hidden = false;
	} finally {
		state.busy = false; _rapierPluginDeletePaint();
		if (typeof renderSettings === 'function') { try { renderSettings(); } catch (_) {} }
	}
}

function _rapierPluginDeleteBind() {
	const state = _rapierPluginDelete;
	if (state.bound) return;
	state.bound = true;
	document.addEventListener('click', event => {
		const control = event.target instanceof Element ? event.target.closest('[data-action]') : null;
		const act = control?.dataset.action;
		if (act === 'plugin-delete') _rapierPluginDeleteAsk(control.dataset.plugin);
		else if (act === 'plugin-delete-now') void _rapierPluginDeleteNow();
		else if (act === 'plugin-delete-keep') _rapierPluginDeleteKeep();
	});
	const overlay = document.getElementById('plugin-delete-overlay');
	overlay?.addEventListener('click', event => { if (event.target === overlay) _rapierPluginDeleteKeep(); });
}
setTimeout(_rapierPluginDeleteBind, 0);

function _rapierPluginRequired(provider) { return provider && provider.status !== 'ready' && provider.update && provider.update.required ? provider.update : null; }
function _rapierPluginRequiredWords(noun, update, plural = false) { return noun + (plural ? ' need' : ' needs') + ' an update to work with this Rapier \u00b7 ' + _rapierPluginSize(update.bytes); }
function _rapierPluginSize(bytes) { return bytes >= 1e6 ? (bytes / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1e3)) + ' KB'; }
const RAPIER_PLUGIN_TOLD = 'rapier:plugin:told';
addEventListener('rapier:plugin-update', event => {
	const {key, noun, plural, version, bytes} = event.detail || {};
	if (!key || !noun) return;
	let told = {};
	try { told = JSON.parse(localStorage.getItem(RAPIER_PLUGIN_TOLD) || '{}') || {}; } catch (_) {}
	if (told[key] === version) return;
	told[key] = version;
	try { localStorage.setItem(RAPIER_PLUGIN_TOLD, JSON.stringify(told)); } catch (_) {}
	const name = String(noun).charAt(0).toUpperCase() + String(noun).slice(1);
	showToast(name + (plural ? ' have' : ' has') + ' an update \u00b7 ' + _rapierPluginSize(bytes), 'info');
});
