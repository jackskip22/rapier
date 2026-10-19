// SPDX-License-Identifier: AGPL-3.0-only
async function _rapierDocumentSpacingOpen() {
	const spec = globalThis.RapierMarkdownSpec, held = await _rapierCaptureSettledExternalDocument();
	if (!held) return false;
	const before = held.canonical, authored = spec.readDocumentSettings(before);
	const settings = _rapierWordPage() ? spec.wordDocumentSettings(authored) : authored;
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
			return _rapierWithoutBlockSpacing(spec.updateDocumentSettings(before, {spacing: draft}));
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
function _rapierWithoutBlockSpacing(source) {
	if (!source.includes('md-layout:v1')) return source;
	const layout = globalThis.RapierMarkdownLayout, opening = _rapierSplitOpeningFrontmatter(source), body = opening.body;
	const plan = layout.editLayout(body, md, {start: 0, end: body.length}, {before: null, after: null, line: null}, _rapierMarkdownEnvironment());
	if (plan.reason) return source;
	let next = body;
	for (const edit of plan.edits.slice().sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	return source.slice(0, opening.bodyOffset) + next;
}

async function _rapierBlockSpacingOpen(wrapper) {
	const spec = globalThis.RapierMarkdownSpec, layout = globalThis.RapierMarkdownLayout, block = _rapierBoundBlock(wrapper);
	if (!block || _rapierUserMutationBlocked() || rapier.document.docKind !== 'markdown') return false;
	const raw = String(block.raw || ''), id = block.id;
	const targets = layout.layoutTargets(raw, md, _rapierMarkdownEnvironment()).filter(target => !target.reason);
	if (targets.length !== 1 || _rapierListItemTree(raw).list) { showToast('This block follows the document\'s spacing.', 'info'); return false; }
	const authored = spec.readDocumentSettings(_rapierSourceText());
	const settings = _rapierWordPage() ? spec.wordDocumentSettings(authored) : authored;
	const kind = wrapper._rapierRhythmType || (block.type === 'heading' ? 'h' + (wrapper.dataset.headingLevel || 1) : 'paragraph');
	const documentRow = spec.documentSpacing(settings, kind), own = _rapierBlockSpacing(block);
	const shown = field => own[field] == null ? '' : typeof own[field] === 'number' ? String(Number(own[field].toFixed(2))) : own[field];
	const hint = field => String(Number(documentRow[field].toFixed(2)));
	const fields = targets[0].imageOnly ? ['before', 'after'] : ['before', 'after', 'line'];
	const dialog = _openFieldDialog({title: 'Block spacing',
		fields: fields.map(field => ({label: field === 'line' ? 'Line spacing' : 'Space ' + field + ' (pt)', value: shown(field), placeholder: hint(field)})),
		okLabel: 'Apply', prepare() {
			const patch = {};
			for (const [index, field] of fields.entries()) {
				const text = dialog.inputs[index].value.trim(), value = Number(text), min = field === 'line' ? .5 : 0, max = field === 'line' ? 4 : 720;
				if (!text) { patch[field] = null; continue; }
				const height = field === 'line' && /pt\+?$/i.test(text) ? layout.parseLayout('<!--md-layout:v1 line=' + text.toLowerCase() + '-->')?.line : null;
				if (height) { patch.line = height; continue; }
				if (!Number.isFinite(value) || value < min || value > max) throw new Error(field === 'line' ? 'Use 0.5 to 4, or a height such as 14pt, for line spacing.' :
					'Use ' + min + ' to ' + max + ' for space ' + field + '.');
				patch[field] = Math.round(value * 100) / 100;
			}
			return patch;
		}, onOk(_, patch) {
			const now = _rapierBlockWrapperById(id);
			if (!now || _rapierBoundBlock(now)?.raw !== raw) { showToast('The block changed. Tap its handle again.', 'error'); return; }
			_rapierEditBlockLayout(now, patch);
		}});
	for (const input of dialog.inputs) input.inputMode = 'decimal';
	return true;
}

function _rapierEditBlockLayout(wrapper, patch) {
	const layout = globalThis.RapierMarkdownLayout, block = _rapierBoundBlock(wrapper);
	if (!block || _rapierUserMutationBlocked()) return false;
	const raw = String(block.raw || '');
	const plan = layout.editLayout(raw, md, {start: 0, end: raw.length}, patch, _rapierMarkdownEnvironment());
	if (plan.reason) { showToast('This block\'s spacing cannot be changed without altering its words.', 'info'); return false; }
	let value = raw;
	for (const edit of plan.edits.slice().sort((a, b) => b.start - a.start)) value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
	if (value === raw) return true;
	const state = {selection: window.getSelection(), range: null, wrappers: [wrapper], blocksBefore: [_rapierHistoryBlock(block)]};
	return _rapierApplyRawRange(state, [value], {keepEditing: true});
}

const _rapierWordView = (() => {
	let frame = 0, observer = null, active = false;
	const host = () => document.getElementById('editor-blocks');
	function paint() {
		frame = 0;
		const root = host(); if (!root) return;
		const enabled = _rapierWordPage();
		observer?.disconnect();
		const blocks = _blockWrapperChildren(root);
		for (const block of blocks) if (block.hasAttribute('data-docx-page')) { block.style.removeProperty('--docx-page-gap'); block.removeAttribute('data-docx-page'); }
		if (!enabled) {
			for (const key of ['--docx-sheet', '--docx-margin', '--docx-scale', '--docx-page', '--rapier-page-zoom']) root.style.removeProperty(key);
			root.removeAttribute('data-template-page');
			active = false; return;
		}
		active = true;
		const settings = globalThis.RapierMarkdownSpec.readDocumentSettings(String(rapier.document.frontmatter || ''));
		const width = (settings.papersize?.width || 12240) / 15, height = (settings.papersize?.height || 15840) / 15;
		const margin = (settings.geometry?.twips ?? 1440) / 15;
		const zoom = (Number(getComputedStyle(root).getPropertyValue('--rapier-step')) || 1) * (Number(root.style.getPropertyValue('--rapier-page-zoom')) || 1);
		const scale = Math.min(1, Math.max(1, (root.parentElement.clientWidth || document.documentElement.clientWidth) - 16) / width) * zoom;
		root.style.setProperty('--docx-sheet', width + 'px');
		root.style.setProperty('--docx-margin', margin + 'px');
		root.style.setProperty('--docx-scale', String(scale));
		root.style.setProperty('--docx-page', height + 'px');
		root.toggleAttribute('data-template-page', _rapierTemplatePage());
		const pageHeight = Math.max(1, (height - 2 * margin) * scale);
		const shown = blocks.filter(block => !block.hidden && !block.classList.contains('block-wrapper--metadata'));
		const heights = shown.map(block => block.getBoundingClientRect().height);
		let used = 0, page = 1;
		shown.forEach((block, index) => {
			const height = heights[index], asleep = !!block._rapierUnrendered;
			const explicit = asleep ? _rapierIsPageBreakBlock(String(_rapierBoundBlock(block)?.raw || '')) : !!block.querySelector('[data-md-break="page"]');
			if (used && (explicit || height <= pageHeight && used + height > pageHeight)) {
				page++;
				if (!asleep) { block.style.setProperty('--docx-page-gap', Math.max(0, pageHeight - used) / scale + 2 * margin + 'px'); block.dataset.docxPage = String(page); }
				used = 0;
			}
			used += height;
			if (used > pageHeight) { page += Math.floor(used / pageHeight); used %= pageHeight; }
		});
		observer ||= new MutationObserver(sync);
		observer.observe(root, {childList: true, subtree: true, characterData: true});
	}
	function sync() {
		if (!active && !_rapierWordPage()) return;
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
_rapierDocumentPart = Object.freeze({spacing: _rapierDocumentSpacingOpen, blockSpacing: _rapierBlockSpacingOpen, sync: _rapierWordView.sync, clipboard: _rapierClipboardPictures});
