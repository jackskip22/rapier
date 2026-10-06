// Delete a plug-in on tap: tapping an installed plug-in's button asks whether to delete it. Every INSTALLED row in the settings panel's plugins -- math, mermaid, PDF import and text in
// pictures, in the main panel and in the Notes panel that borrows it -- carries `data-action="plugin-delete"` and its plug-in's name; a tap asks in the plug-in prompt's own shape
// (#plugin-delete-overlay, the shape of #math-plugin-overlay) whether to delete it, delete or keep. Delete takes what the plug-in keeps in this browser (its own store: the service worker never
// holds a plug-in's files) and the row reads INSTALL again, and a document's math or diagram does not ask to install it again this session (the person just said no). Not an Undo: a download is
// not a person's work, and the words say what happens. Spliced into the editor's one script scope, in both profiles; createElement/textContent only.

const _rapierPluginDelete = {asking: null, busy: false, bound: false};
// Each plug-in's words and its own delete. `what` is what leaves the device; `after` what a person meets afterwards. A math
// or diagram renderer an app keeps and cannot remove (RapierPlatform.resources without remove) is not offered; Android's one
// Google Play pack is removed whole, and every plug-in in it goes together.
const RAPIER_PLUGIN_DELETE = Object.freeze({
	math: {name: 'math', what: 'the MathJax renderer', after: 'Math shows as its TeX source until you install it again.',
		held: () => _rapierProviders.math?.status === 'ready' && _rapierProviders.math.deletable,
		async forget() { await _rapierProviders.math.forget(); _rapierUiMath.dismissed = true; if (typeof rerenderMathBlocks === 'function') rerenderMathBlocks(); }},
	mermaid: {name: 'mermaid', what: 'the Mermaid renderer', after: 'Diagrams that need this plug-in show their source until you install it again.',
		held: () => _rapierProviders.mermaid?.status === 'ready' && _rapierProviders.mermaid.deletable,
		async forget() { await _rapierProviders.mermaid.forget(); _rapierUiDiagram.dismissed = true; if (typeof rerenderDiagramBlocks === 'function') rerenderDiagramBlocks(); }},
	pdf: {name: 'PDF import', what: 'the PDF reader', after: 'Importing a PDF asks to download it again.',
		held: () => { const state = globalThis.RapierPdfPlugin?.state(); return !!state?.installed && state.deletable; },
		async forget() { await globalThis.RapierPdfPlugin.forget(); if (typeof _rapierPdfSettingsRefresh === 'function') _rapierPdfSettingsRefresh(); }},
	ocr: {name: 'text in pictures', what: 'the text reader and every word it read in your pictures', after: 'Search stops finding the words in pictures.',
		held: () => _rapierProviders.ocr?.status === 'ready' && _rapierProviders.ocr.deletable,
		async forget() { await _rapierProviders.ocr.forget(); }},
});

function _rapierPluginDeleteAsk(key) {
	const plugin = RAPIER_PLUGIN_DELETE[key], overlay = document.getElementById('plugin-delete-overlay');
	if (!plugin || !overlay || !plugin.held() || _rapierPluginDelete.busy) return;
	_rapierPluginDelete.asking = key;
	document.getElementById('plugin-delete-title').textContent = 'Delete the ' + plugin.name + ' plugin?';
	// Where the app keeps the plug-ins (Android: one Google Play pack holds math, diagrams and text in pictures), the app's words
	// say that they leave together.
	const hostWords = window.RapierPlatform?.resources.installMessage?.(key, 'delete') || '';
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
		await plugin.forget();
		// This device's delete stays here: the wish other devices synced is left as it was (editor/personal.js).
		if (typeof _rapierPersonal !== 'undefined') _rapierPersonal.declinePlugin(key);
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
