// SPDX-License-Identifier: AGPL-3.0-only
async function _rapierDocumentSpacingOpen() {
	const spec = globalThis.RapierMarkdownSpec, held = await _rapierCaptureSettledExternalDocument();
	if (!held) return false;
	const before = held.canonical, authored = spec.readDocumentSettings(before);
	const settings = RapierPreferences.read('layout') === 'docx' ? spec.wordDocumentSettings(authored) : authored;
	let draft = JSON.parse(JSON.stringify(settings.spacing || {preset: 'standard'})), type = 'paragraph';
	const current = () => _rapierMutationStampIsCurrent(held.stamp) && _rapierSourceText() === before &&
		!rapier.composition.block && !rapier.composition.source;
	const labels = {paragraph: 'Paragraphs', list: 'Lists', item: 'List items', table: 'Tables', picture: 'Pictures', drawing: 'Drawings',
		quote: 'Quotes', code: 'Code', rule: 'Rules', footnote: 'Footnotes', toc: 'Contents'};
	const row = () => spec.documentSpacing({...settings, spacing: draft}, type);
	const dialog = _openFieldDialog({title: 'Spacing',
		fields: [
			{type: 'select', label: 'Preset', value: draft.preset || 'standard', options: Object.keys(spec.SPACING_PRESETS).map(value => ({value, label: value[0].toUpperCase() + value.slice(1)}))},
			{type: 'select', label: 'Element', value: type, options: spec.SPACING_TYPES.map(value => ({value, label: labels[value] || 'Heading ' + value.slice(1)}))},
			...['before', 'after', 'line'].map(field => ({label: field === 'line' ? 'Line spacing' : 'Space ' + field + ' (pt)', value: String(row()[field])}))
		], okLabel: 'Apply', prepare() {
			remember();
			if (!current()) throw new Error('The document changed. Open Spacing again.');
			return spec.updateDocumentSettings(before, {spacing: draft});
		}, async onOk(_, next) {
			if (next === before) return;
			if (!current() || !await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(before, next)], 'document.spacing', null, null,
				_rapierCaptureEditorViewport(), null, current)) showToast('The document changed. Open Spacing again.', 'error');
		}});
	const paint = () => ['before', 'after', 'line'].forEach((field, index) => {
		const input = dialog.inputs[index + 2]; input.value = String(Number(row()[field].toFixed(2))); input.dataset.initial = input.value;
		input.inputMode = 'decimal';
	});
	function remember() {
		for (const [index, field] of ['before', 'after', 'line'].entries()) {
			const input = dialog.inputs[index + 2];
			if (input.value === input.dataset.initial) continue;
			const value = Number(input.value), min = field === 'line' ? .5 : 0, max = field === 'line' ? 4 : 720;
			if (!input.value.trim() || !Number.isFinite(value) || value < min || value > max) throw new Error('Use ' + min + ' to ' + max + ' for ' + field + '.');
			draft[type] = {...draft[type], [field]: value};
		}
	}
	dialog.inputs[0].addEventListener('change', () => { draft = {preset: dialog.inputs[0].value}; paint(); });
	dialog.inputs[1].addEventListener('change', () => {
		try { remember(); type = dialog.inputs[1].value; paint(); }
		catch (error) { dialog.inputs[1].value = type; showToast(error.message, 'error'); }
	});
	paint();
	return true;
}
const _rapierWordView = (() => {
	let frame = 0, observer = null, active = false;
	const host = () => document.getElementById('editor-blocks');
	function paint() {
		frame = 0;
		const root = host(); if (!root) return;
		const enabled = RapierPreferences.read('layout') === 'docx';
		observer?.disconnect();
		for (const block of root.children) { block.style.removeProperty('--docx-page-gap'); block.removeAttribute('data-docx-page'); }
		if (!enabled) {
			for (const key of ['--docx-sheet', '--docx-margin', '--docx-scale']) root.style.removeProperty(key);
			active = false; return;
		}
		active = true;
		const settings = globalThis.RapierMarkdownSpec.readDocumentSettings(_rapierSourceText());
		const width = (settings.papersize?.width || 12240) / 15, height = (settings.papersize?.height || 15840) / 15;
		const margin = (settings.geometry?.twips ?? 1440) / 15;
		const zoom = Number(getComputedStyle(root).getPropertyValue('--rapier-step')) || 1;
		const scale = Math.min(1, Math.max(1, (root.parentElement.clientWidth || document.documentElement.clientWidth) - 16) / width) * zoom;
		root.style.setProperty('--docx-sheet', width + 'px');
		root.style.setProperty('--docx-margin', margin + 'px');
		root.style.setProperty('--docx-scale', String(scale));
		const pageHeight = Math.max(1, (height - 2 * margin) * scale);
		let used = 0, page = 1;
		for (const block of root.children) {
			if (!block.classList.contains('block-wrapper') || block.hidden || block.classList.contains('block-wrapper--metadata')) continue;
			const box = block.getBoundingClientRect(), explicit = !!block.querySelector('[data-md-break="page"]');
			if (used && (explicit || box.height <= pageHeight && used + box.height > pageHeight)) {
				block.style.setProperty('--docx-page-gap', Math.max(0, pageHeight - used) / scale + 2 * margin + 'px');
				block.dataset.docxPage = String(++page); used = 0;
			}
			used += box.height;
			if (used > pageHeight) { page += Math.floor(used / pageHeight); used %= pageHeight; }
		}
		observer ||= new MutationObserver(sync);
		observer.observe(root, {childList: true, subtree: true, characterData: true});
	}
	function sync() {
		if (!active && RapierPreferences.read('layout') !== 'docx') return;
		if (!frame) frame = requestAnimationFrame(paint);
	}
	addEventListener('resize', sync);
	document.fonts?.addEventListener('loadingdone', sync);
	return {sync};
})();
function _rapierClipboardPictures(html, rtf) {
	const template = document.createElement('template'); template.innerHTML = html;
	const local = Array.from(template.content.querySelectorAll('img[src]')).filter(image => /^file:/i.test(image.getAttribute('src')));
	if (!local.length) return html;
	const names = [...new Set(local.map(image => image.getAttribute('src')))];
	const pictures = globalThis.RapierClipboardPictures.rtfPictures(rtf);
	const originals = document.createElement('template');
	originals.innerHTML = html.replace(/<!--\[if[^\]]*\]>/gi, '').replace(/<!\[endif\]-->/gi, '');
	const shapes = Array.from(originals.content.querySelectorAll('v\\:shape')).filter(shape => shape.querySelector('v\\:imagedata[src]'));
	const byShape = shapes.length === pictures.length && shapes.length > 0;
	if (!byShape && pictures.length !== names.length) { showToast('Some pictures were not in the clipboard. Copy them with the text.', 'info'); return html; }
	const urls = pictures.map(({bytes, type}) => {
		let binary = ''; for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
		return 'data:' + type + ';base64,' + btoa(binary);
	});
	let missing = false;
	for (const image of local) {
		const ids = (image.getAttribute('v:shapes') || '').split(/\s+/);
		const index = byShape ? shapes.findIndex(shape => ids.includes(shape.id)) : names.indexOf(image.getAttribute('src'));
		if (index >= 0) image.setAttribute('src', urls[index]);
		else { missing = true; image.replaceWith(document.createTextNode(image.getAttribute('alt') || '')); }
	}
	if (missing) showToast('Some Word shapes were not in the clipboard.', 'info');
	return template.innerHTML;
}
_rapierDocumentPart = Object.freeze({spacing: _rapierDocumentSpacingOpen, sync: _rapierWordView.sync, clipboard: _rapierClipboardPictures});
