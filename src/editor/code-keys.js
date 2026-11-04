// SPDX-License-Identifier: AGPL-3.0-only
(function () {
	'use strict';
	const coarse = matchMedia('(pointer: coarse)');
	const KEYS = {
		code: ['tab', 'outdent', '`', '(', ')', '{', '}', '[', ']', '=', '=>', '|'],
		diagram: ['tab', 'outdent', '-->', '[', ']', '(', ')', '{', '}', '|', ':', '"'],
		source: ['tab', 'outdent', '#', '*', '_', '`', '[', ']', '(', ')', '>', '|'],
	};
	const GLYPH = {tab: '⇥', outdent: '⇤'}, NAME = {tab: 'indent', outdent: 'outdent'};
	let strip, keys, kind = '', queued = false;

	function context() {
		if (!coarse.matches || rapier.access.readOnly) return null;
		const ta = document.getElementById('source-textarea'), docKind = rapier.document.docKind;
		if (ta && document.activeElement === ta) return docKind === 'text' ? null : {kind: docKind === 'code' ? 'code' : 'source', ta};
		const sel = getSelection(), node = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
		const at = node && (node.nodeType === 1 ? node : node.parentElement);
		const edit = at?.closest('.block-edit');
		if (!edit || !at.closest('pre') || edit.closest('.block-wrapper--math-source')) return null;
		return {kind: edit.closest('.block-wrapper--diagram-source') ? 'diagram' : 'code', edit};
	}

	function press(name, at) {
		if (name === 'tab' || name === 'outdent') {
			if (at.ta) at.ta.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', code: 'Tab', shiftKey: name === 'outdent', bubbles: true, cancelable: true}));
			else _rapierIndentCode(at.edit, name === 'outdent');
			return;
		}
		if (!at.ta) { document.execCommand('insertText', false, name); return; }
		const ta = at.ta;
		if (!ta.dispatchEvent(new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'insertText', data: name}))) return;
		ta.setRangeText(name, ta.selectionStart, ta.selectionEnd, 'end');
		ta.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: name}));
	}

	function build() {
		strip = document.createElement('div');
		strip.className = 'math-strip'; strip.id = 'code-strip';
		strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-label', 'code keys');
		keys = strip.appendChild(document.createElement('div'));
		keys.className = 'math-strip__keys';
		strip.addEventListener('pointerdown', event => event.preventDefault());
		strip.addEventListener('mousedown', event => event.preventDefault());
		keys.addEventListener('click', event => {
			const key = event.target.closest('button'), at = context();
			if (key && at) press(key.dataset.key, at);
		});
		document.getElementById('format-toolbar-stack')?.append(strip);
	}

	function fill(next) {
		if (kind === next) return;
		kind = next;
		keys.replaceChildren(...KEYS[next].map(name => {
			const key = document.createElement('button');
			key.type = 'button'; key.dataset.key = name; key.textContent = GLYPH[name] || name;
			key.setAttribute('aria-label', NAME[name] || 'type ' + name);
			return key;
		}));
	}

	function update() {
		queued = false;
		const at = context();
		if (!at) {
			if (strip?.classList.contains('visible')) { strip.classList.remove('visible'); rapierRepositionFormatToolbar(); _rapierScheduleFormatToolbarPosition(); }
			return;
		}
		if (!strip) build();
		fill(at.kind);
		if (!strip.classList.contains('visible')) { strip.classList.add('visible'); rapierRepositionFormatToolbar(); _rapierScheduleFormatToolbarPosition(); }
	}
	const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
	document.addEventListener('selectionchange', schedule);
	document.addEventListener('focusin', schedule);
	document.addEventListener('focusout', schedule);
	coarse.addEventListener('change', schedule);
})();
