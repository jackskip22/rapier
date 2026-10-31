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
			if (!current()) throw new Error('Document changed. Open Spacing again.');
			return _rapierWithoutBlockSpacing(spec.updateDocumentSettings(before, {spacing: draft}));
		}, async onOk(_, next) {
			if (next === before) return;
			if (!current() || !await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(before, next)], 'document.spacing', null, null,
				_rapierCaptureEditorViewport(), null, current)) showToast('Document changed. Open Spacing again.', 'error');
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
		catch (error) { dialog.inputs[1].value = type; showToast(_rapierErrorWords(error, 'Couldn’t change the spacing.'), 'error'); }
	});
	paint();
	return true;
}
function _rapierWithoutBlockSpacing(source) {
	const layout = globalThis.RapierMarkdownLayout;
	if (!layout.hasBlockSpacing(source)) return source;
	const opening = _rapierSplitOpeningFrontmatter(source), body = opening.body;
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
	if (targets.length !== 1 || _rapierListItemTree(raw).list) {
		showToast(_rapierRawIsBlank(raw) ? 'Empty lines use the document’s spacing.' : 'This block uses the document’s spacing.', 'info');
		return false;
	}
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
			if (!now || _rapierBoundBlock(now)?.raw !== raw) { showToast('Block changed. Try again.', 'error'); return; }
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
	if (plan.reason) { showToast('Can’t change this block’s spacing.', 'info'); return false; }
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
			for (const key of ['--docx-sheet', '--docx-margin-top', '--docx-margin-right', '--docx-margin-bottom', '--docx-margin-left', '--docx-scale', '--docx-page', '--rapier-page-zoom']) root.style.removeProperty(key);
			root.removeAttribute('data-template-page');
			_rapierTemplateArea.close();
			active = false; return;
		}
		active = true;
		const settings = globalThis.RapierMarkdownSpec.readDocumentSettings(String(rapier.document.frontmatter || ''));
		const width = (settings.papersize?.width || 12240) / 15, height = (settings.papersize?.height || 15840) / 15;
		const margins = _rapierTemplateArea.margins(settings);
		const zoom = (Number(getComputedStyle(root).getPropertyValue('--rapier-step')) || 1) * (Number(root.style.getPropertyValue('--rapier-page-zoom')) || 1);
		const scale = Math.min(1, Math.max(1, (root.parentElement.clientWidth || document.documentElement.clientWidth) - 16) / width) * zoom;
		root.style.setProperty('--docx-sheet', width + 'px');
		for (const side of ['top', 'right', 'bottom', 'left']) root.style.setProperty('--docx-margin-' + side, margins[side] / 15 + 'px');
		root.style.setProperty('--docx-scale', String(scale));
		root.style.setProperty('--docx-page', height + 'px');
		root.toggleAttribute('data-template-page', _rapierTemplatePage());
		const pageHeight = Math.max(1, (height - (margins.top + margins.bottom) / 15) * scale);
		const shown = blocks.filter(block => !block.hidden && !block.classList.contains('block-wrapper--metadata'));
		const heights = shown.map(block => block.getBoundingClientRect().height);
		let used = 0, page = 1;
		shown.forEach((block, index) => {
			const height = heights[index], asleep = !!block._rapierUnrendered;
			const explicit = asleep ? _rapierIsPageBreakBlock(String(_rapierBoundBlock(block)?.raw || '')) : !!block.querySelector('[data-md-break="page"]');
			if (used && (explicit || height <= pageHeight && used + height > pageHeight)) {
				page++;
				if (!asleep) { block.style.setProperty('--docx-page-gap', Math.max(0, pageHeight - used) / scale + (margins.top + margins.bottom) / 15 + 'px'); block.dataset.docxPage = String(page); }
				used = 0;
			}
			used += height;
			if (used > pageHeight) { page += Math.floor(used / pageHeight); used %= pageHeight; }
		});
		observer ||= new MutationObserver(sync);
		observer.observe(root, {childList: true, subtree: true, characterData: true});
		_rapierTemplateArea.paint();
	}
	function sync() {
		if (!active && !_rapierWordPage()) return;
		if (!frame) frame = requestAnimationFrame(paint);
	}
	addEventListener('resize', sync);
	document.fonts?.addEventListener('loadingdone', sync);
	return {sync};
})();

const _rapierTemplateArea = (() => {
	const sides = ['top', 'right', 'bottom', 'left'], grips = [];
	const selector = 'img[data-rapier-image-layout*="wrap%3Dbehind"][data-rapier-image-layout*="lock%3Don"]';
	let selected = null, drag = null, tap = null, ticket = 0, click = null;
	const border = () => _rapierTemplatePage() && _rapierWordPage() && rapier.view.mode !== 'source'
		? document.querySelector('#editor-blocks[data-template-page] ' + selector) : null;
	const allowed = () => !_rapierUserMutationBlocked(false) && !rapier.composition.block && !rapier.composition.source;
	const readMargins = settings => Object.fromEntries(sides.map(side => [side, settings.geometry?.[side] ?? 1440]));
	const current = state => selected === state && !rapier.access.readOnly && !rapier.compare.active &&
		!rapier.composition.block && !rapier.composition.source && _rapierMutationStampIsCurrent(state.held.stamp);
	function close() {
		ticket++; tap = null;
		const old = drag; drag = null;
		const preview = selected?.preview; selected = null;
		for (const grip of grips) grip.hidden = true;
		if (old?.pointer != null) try { old.grip.releasePointerCapture(old.pointer); } catch (_) {}
		if (preview) _rapierWordView.sync();
	}
	function margins(settings) {
		return selected?.preview && current(selected) ? selected.preview : readMargins(settings);
	}
	function paint() {
		if (!selected) return;
		const image = border(), state = selected;
		if (state.busy && current(state) && !image) return;
		if (!image || !current(state) && !(state.busy && !rapier.access.readOnly && !rapier.compare.active &&
			_rapierMutationStampSharesDocument(state.held.stamp) && _rapierSourceText() === state.next)) { close(); return; }
		const rect = image.getBoundingClientRect(), scale = rect.width / state.width;
		const value = state.preview || state.margins;
		for (const grip of grips) {
			const corner = grip.dataset.corner;
			grip.style.left = (corner.includes('w') ? rect.left + value.left / 15 * scale : rect.right - value.right / 15 * scale) + 'px';
			grip.style.top = (corner.includes('n') ? rect.top + value.top / 15 * scale : rect.bottom - value.bottom / 15 * scale) + 'px';
			grip.hidden = false;
		}
	}
	async function open() {
		close();
		const own = ticket;
		_rapierCloseImageTools();
		const held = await _rapierCaptureSettledExternalDocument();
		if (own !== ticket || !held || !border() || !allowed() || !_rapierMutationStampIsCurrent(held.stamp)) return;
		const settings = globalThis.RapierMarkdownSpec.readDocumentSettings(held.canonical);
		selected = {held, margins: readMargins(settings), width: (settings.papersize?.width || 12240) / 15,
			height: (settings.papersize?.height || 15840) / 15, preview: null, busy: false};
		if (!grips.length) for (const [corner, label] of [['nw', 'top left'], ['ne', 'top right'], ['sw', 'bottom left'], ['se', 'bottom right']]) {
			const grip = document.createElement('button');
			grip.type = 'button'; grip.className = 'rapier-image-grip'; grip.dataset.corner = corner;
			grip.dataset.rapierTextArea = ''; grip.setAttribute('aria-label', 'Resize text area from ' + label);
			grip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
			grips.push(grip);
		}
		for (const grip of grips) if (!grip.isConnected) document.body.append(grip);
		paint();
	}
	function onBorder(event) {
		const image = border(), root = document.getElementById('editor-blocks');
		if (!image || !root?.contains(event.target) || event.target.closest('button,input,textarea,select,a,.block-edit')) return false;
		const rect = image.getBoundingClientRect(), settings = globalThis.RapierMarkdownSpec.readDocumentSettings(String(rapier.document.frontmatter || ''));
		const value = margins(settings), scale = rect.width / ((settings.papersize?.width || 12240) / 15);
		const x = event.clientX, y = event.clientY;
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom &&
			(x < rect.left + Math.max(8, value.left / 15 * scale) || x > rect.right - Math.max(8, value.right / 15 * scale) ||
			 y < rect.top + Math.max(8, value.top / 15 * scale) || y > rect.bottom - Math.max(8, value.bottom / 15 * scale));
	}
	function begin(grip, event) {
		if (!selected || selected.busy || !allowed() || !current(selected)) { close(); return false; }
		_rapierCancelViewRestore();
		drag = {grip, corner: grip.dataset.corner, pointer: event?.pointerId ?? null,
			x: event?.clientX || 0, y: event?.clientY || 0, initial: {...selected.margins},
			scale: border().getBoundingClientRect().width / selected.width};
		selected.preview = {...selected.margins};
		if (event) try { grip.setPointerCapture(event.pointerId); } catch (_) { close(); return false; }
		return true;
	}
	function resize(dx, dy) {
		if (!drag || !selected || !current(selected)) { close(); return; }
		const {corner, initial} = drag, value = {...initial};
		const clamp = (value, maximum) => Math.round(Math.max(0, Math.min(8640, maximum, value)));
		if (corner.includes('w')) value.left = clamp(initial.left + dx, selected.width * 15 - initial.right - 720);
		else value.right = clamp(initial.right - dx, selected.width * 15 - initial.left - 720);
		if (corner.includes('n')) value.top = clamp(initial.top + dy, selected.height * 15 - initial.bottom - 720);
		else value.bottom = clamp(initial.bottom - dy, selected.height * 15 - initial.top - 720);
		selected.preview = value; _rapierWordView.sync();
	}
	async function finish() {
		const state = selected, old = drag; drag = null;
		if (old?.pointer != null) try { old.grip.releasePointerCapture(old.pointer); } catch (_) {}
		if (!state || !current(state)) { close(); return; }
		const value = state.preview;
		if (!value || sides.every(side => value[side] === state.margins[side])) { state.preview = null; paint(); return; }
		const before = state.held.canonical;
		try {
			state.next = globalThis.RapierMarkdownSpec.updateDocumentSettings(before, {geometry: sides.map(side => side + '=' + value[side] / 20 + 'pt').join(', ')});
			state.busy = true;
			const valid = () => current(state) && _rapierSourceText() === before;
			const committed = await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(before, state.next)],
				'document.geometry', null, null, _rapierCaptureEditorViewport(), null, valid);
			if (!committed || selected !== state || !_rapierMutationStampSharesDocument(state.held.stamp) || _rapierSourceText() !== state.next) { close(); return; }
			state.held = {canonical: state.next, stamp: _rapierMutationStamp()};
			state.margins = value; state.preview = null; state.busy = false;
			_rapierWordView.sync();
		} catch (error) { close(); showToast(_rapierErrorWords(error, 'Couldn’t change the spacing.'), 'error'); }
	}
	const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
	window.addEventListener('pointerdown', event => {
		if (!event.isTrusted) return;
		click = null;
		if (!event.isPrimary) { close(); return; }
		if (event.button !== 0) return;
		const grip = event.target.closest?.('[data-rapier-text-area]');
		if (grips.includes(grip)) { stop(event); begin(grip, event); return; }
		if (allowed() && onBorder(event)) { stop(event); tap = {pointer: event.pointerId, x: event.clientX, y: event.clientY}; return; }
		close();
	}, {capture: true, passive: false});
	window.addEventListener('pointermove', event => {
		if (tap?.pointer === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = null;
		if (!drag || drag.pointer !== event.pointerId) return;
		stop(event); resize((event.clientX - drag.x) * 15 / drag.scale, (event.clientY - drag.y) * 15 / drag.scale);
	}, {capture: true, passive: false});
	window.addEventListener('pointerup', event => {
		if (!event.isTrusted) return;
		if (drag?.pointer === event.pointerId) {
			stop(event); resize((event.clientX - drag.x) * 15 / drag.scale, (event.clientY - drag.y) * 15 / drag.scale);
			click = {x: event.clientX, y: event.clientY, at: performance.now()}; void finish(); return;
		}
		if (tap?.pointer !== event.pointerId) return;
		tap = null;
		if (onBorder(event)) { stop(event); click = {x: event.clientX, y: event.clientY, at: performance.now()}; void open(); }
	}, {capture: true, passive: false});
	window.addEventListener('click', event => {
		if (click && performance.now() - click.at < 600 && Math.hypot(event.clientX - click.x, event.clientY - click.y) < 12) {
			click = null; stop(event);
		}
	}, true);
	window.addEventListener('pointercancel', close, true);
	window.addEventListener('lostpointercapture', event => { if (drag?.pointer === event.pointerId) close(); }, true);
	window.addEventListener('keydown', event => {
		if (!selected || !event.isTrusted) return;
		if (event.key === 'Escape') { stop(event); close(); return; }
		if (!grips.includes(event.target) || !/^Arrow(Left|Right|Up|Down)$/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
		stop(event);
		if (!drag && !begin(event.target)) return;
		if (drag?.pointer != null) return;
		drag.initial = {...selected.preview};
		const step = event.shiftKey ? 150 : 15;
		resize(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
			event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
	}, true);
	window.addEventListener('keyup', event => {
		if (drag && drag.pointer == null && /^Arrow/.test(event.key)) { stop(event); void finish(); }
	}, true);
	window.addEventListener('scroll', paint, true);
	window.addEventListener('resize', paint);
	window.visualViewport?.addEventListener('resize', paint);
	window.visualViewport?.addEventListener('scroll', paint);
	window.addEventListener('blur', close);
	document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
	return {margins, paint, close};
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
	if (!byShape && pictures.length !== names.length) { showToast('Some pictures weren’t copied. Copy them with the text.', 'info'); return html; }
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
	if (missing) showToast('Some Word shapes weren’t copied.', 'info');
	return template.innerHTML;
}
_rapierDocumentPart = Object.freeze({spacing: _rapierDocumentSpacingOpen, blockSpacing: _rapierBlockSpacingOpen, sync: _rapierWordView.sync, clipboard: _rapierClipboardPictures});
