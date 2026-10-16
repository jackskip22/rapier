// SPDX-License-Identifier: AGPL-3.0-only
(function () {
	'use strict';
	const coarse = matchMedia('(pointer: coarse)');
	const KEYS = [['\\', '\\', 0], ['{ }', '{}', 1], ['^', '^', 0], ['_', '_', 0], ['( )', '()', 1], ['\\frac', '\\frac{}{}', 3], ['\\sqrt', '\\sqrt{}', 1]];
	let strip, preview, keys, fix, at = null, queued = false;

	function around(text, caret) {
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '\\' && text[i + 1] !== '(' && text[i + 1] !== '[') { i++; continue; }
			const open = text.startsWith('$$', i) ? '$$' : text[i] === '$' ? '$' : text.startsWith('\\[', i) ? '\\[' : text.startsWith('\\(', i) ? '\\(' : '';
			if (!open) continue;
			const close = {'$$': '$$', '$': '$', '\\[': '\\]', '\\(': '\\)'}[open], from = i + open.length, inline = open === '$' || open === '\\(';
			let to = text.indexOf(close, from);
			const line = inline ? text.indexOf('\n', from) : -1;
			if (line >= 0 && (to < 0 || line < to)) to = -1;
			const end = to >= 0 ? to : inline && line >= 0 ? line : text.length;
			if (caret >= from && caret <= end) return {from, caret: caret - from, tex: text.slice(from, end), display: !inline};
			i = to >= 0 ? to + close.length - 1 : end;
		}
		return null;
	}

	function caretIn() {
		const sel = getSelection(), node = sel.rangeCount && sel.getRangeAt(0).startContainer;
		const edit = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.block-edit');
		if (!edit || !edit.isContentEditable || !sel.isCollapsed) return null;
		const range = document.createRange();
		range.setStart(edit, 0); range.setEnd(sel.anchorNode, sel.anchorOffset);
		const math = around(edit.textContent, range.toString().length);
		return math && {...math, edit};
	}

	function select(edit, from, to = from) {
		const walker = document.createTreeWalker(edit, NodeFilter.SHOW_TEXT), range = document.createRange();
		let seen = 0, node, set = 0;
		while ((node = walker.nextNode())) {
			const length = node.textContent.length;
			if (!set && from <= seen + length) { range.setStart(node, from - seen); set = 1; }
			if (set && to <= seen + length) { range.setEnd(node, to - seen); set = 2; break; }
			seen += length;
		}
		if (set !== 2) return false;
		const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
		return true;
	}

	function build() {
		strip = document.createElement('div');
		strip.className = 'math-strip'; strip.id = 'math-strip';
		strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-label', 'maths keys');
		preview = strip.appendChild(document.createElement('div'));
		preview.className = 'math-strip__preview';
		keys = strip.appendChild(document.createElement('div'));
		keys.className = 'math-strip__keys';
		fix = keys.appendChild(document.createElement('button'));
		fix.type = 'button'; fix.className = 'math-strip__fix'; fix.hidden = true;
		for (const [label, text, back] of KEYS) {
			const key = keys.appendChild(document.createElement('button'));
			key.type = 'button'; key.textContent = label; key.dataset.text = text; key.dataset.back = back;
			key.setAttribute('aria-label', 'type ' + text);
		}
		strip.addEventListener('pointerdown', event => event.preventDefault());
		strip.addEventListener('mousedown', event => event.preventDefault());
		keys.addEventListener('click', event => {
			const key = event.target.closest('button');
			if (!key || !at) return;
			if (key === fix) {
				if (!select(at.edit, at.from + fix._offset, at.from + fix._offset + fix._length)) return;
				document.execCommand('insertText', false, fix._name);
			} else {
				document.execCommand('insertText', false, key.dataset.text);
				const sel = getSelection();
				for (let i = 0; i < Number(key.dataset.back); i++) sel.modify('move', 'backward', 'character');
			}
		});
		preview.addEventListener('click', event => {
			let best, distance = Infinity;
			for (const symbol of preview.querySelectorAll('[data-math-at]')) {
				const r = symbol.getBoundingClientRect(), d = Math.hypot(Math.max(r.left - event.clientX, 0, event.clientX - r.right), Math.max(r.top - event.clientY, 0, event.clientY - r.bottom));
				if (d < distance) { best = symbol; distance = d; }
			}
			if (best && at) select(at.edit, at.from + Number(best.getAttribute('data-math-at')));
		});
		document.getElementById('format-toolbar-stack')?.append(strip);
	}

	function update() {
		queued = false;
		const math = window.RapierMath && coarse.matches ? caretIn() : null;
		if (!math) { at = null; strip?.classList.remove('visible'); return; }
		if (!strip) build();
		const formula = at && at.edit === math.edit && at.from === math.from;
		at = math;
		const result = RapierMath.render(math.tex, {displayMode: math.display, preview: true, caret: math.caret, spans: true});
		const error = result.errors[0];
		if (!error || !formula) {
			preview.innerHTML = error || !math.tex.trim() ? '' : _rapierRenderModule('render-sanitize').sanitizeRapierHtml(result.svg, 'render');
		}
		fix.hidden = !error?.suggestion;
		if (error?.suggestion) {
			fix.textContent = error.suggestion; fix._name = error.suggestion;
			fix._offset = error.offset; fix._length = 1 + (error.command || '').length;
			if (error.code === 'unsupported-environment') { fix._offset = math.tex.indexOf('{', error.offset) + 1; fix._length = math.tex.indexOf('}', fix._offset) - fix._offset; }
			fix.setAttribute('aria-label', 'use ' + error.suggestion);
		}
		strip.classList.add('visible');
	}
	const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
	document.addEventListener('selectionchange', schedule);
	document.addEventListener('input', schedule, true);
	coarse.addEventListener('change', schedule);
})();
