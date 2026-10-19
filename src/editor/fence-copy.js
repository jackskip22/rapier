// SPDX-License-Identifier: AGPL-3.0-only
const _RAPIER_NESTED_FENCE = 'pre:not(.diagram-source) > code';
function _rapierFenceCopyButton(nested) {
	const control = document.createElement('button');
	control.type = 'button';
	control.className = nested ? 'fence-copy fence-copy--nested' : 'fence-copy';
	control.setAttribute('contenteditable', 'false');
	control.setAttribute('aria-label', 'copy the code');
	control.title = 'copy the code';
	const svgNS = 'http://www.w3.org/2000/svg';
	const glyph = (name, child) => {
		const svg = document.createElementNS(svgNS, 'svg');
		for (const [key, value] of [['class', 'fence-copy__' + name], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'],
			['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) svg.setAttribute(key, value);
		svg.appendChild(child);
		return svg;
	};
	const use = document.createElementNS(svgNS, 'use');
	use.setAttribute('href', '#i-copy');
	const check = document.createElementNS(svgNS, 'polyline');
	check.setAttribute('points', /points="([^"]+)"/.exec(_RAPIER_COMMAND_ICONS.check)[1]);
	control.append(glyph('copy', use), glyph('done', check));
	return control;
}
const _rapierNestedFenceObserver = typeof ResizeObserver === 'function'
	? new ResizeObserver(entries => { for (const entry of entries) _rapierPlaceNestedFenceCopies(entry.target.closest('.block-wrapper')); }) : null;
function _rapierPlaceNestedFenceCopies(wrapper) {
	const read = wrapper?.querySelector(':scope > .block-read');
	const buttons = wrapper ? [...wrapper.querySelectorAll(':scope > .fence-copy--nested')] : [];
	if (!read || !buttons.length) return;
	const codes = [...read.querySelectorAll(_RAPIER_NESTED_FENCE)], frame = wrapper.getBoundingClientRect();
	for (const button of buttons) {
		const pre = codes[Number(button.dataset.fence)]?.parentElement, box = pre?.getClientRects().length ? pre.getBoundingClientRect() : null;
		button.toggleAttribute('hidden', !box || box.width < 48 || box.height < 24);
		if (button.hidden) continue;
		const top = Math.round(box.top - frame.top + 5) + 'px', left = Math.round(box.right - frame.left - 45) + 'px';
		if (button.style.top !== top) button.style.top = top;
		if (button.style.left !== left) button.style.left = left;
	}
}
function _rapierSyncFenceCopyControl(wrapper, readDiv, controlHost = wrapper) {
	if (!wrapper) return;
	const read = readDiv || wrapper.querySelector(':scope > .block-read');
	const markdown = rapier.document.docKind === 'markdown' && read;
	const fence = markdown && read.childElementCount === 1
		&& read.querySelector(':scope > pre > code, :scope > .rapier-hscroll--code > pre > code');
	const nested = markdown && !fence ? read.querySelectorAll(_RAPIER_NESTED_FENCE).length : 0;
	const button = controlHost.querySelector(':scope > .fence-copy:not(.fence-copy--nested)');
	if (!fence) button?.remove();
	else if (!button) controlHost.appendChild(_rapierFenceCopyButton(false));
	const current = [...controlHost.querySelectorAll(':scope > .fence-copy--nested')];
	for (const extra of current.slice(nested)) extra.remove();
	for (let index = current.length; index < nested; index++) {
		const control = _rapierFenceCopyButton(true);
		control.dataset.fence = String(index);
		controlHost.appendChild(control);
	}
	const observed = wrapper._rapierFenceObserved;
	if (observed && (observed !== read || !nested)) { _rapierNestedFenceObserver?.unobserve(observed); wrapper._rapierFenceObserved = null; }
	if (nested && read) {
		if (!wrapper._rapierFenceObserved) { _rapierNestedFenceObserver?.observe(read); wrapper._rapierFenceObserved = read; }
		_rapierPlaceNestedFenceCopies(wrapper);
	}
}

async function _rapierCopyFenceCode(button) {
	const wrapper = button.closest('.block-wrapper'), read = wrapper?.querySelector(':scope > .block-read');
	const code = button.dataset.fence !== undefined ? read?.querySelectorAll(_RAPIER_NESTED_FENCE)[Number(button.dataset.fence)]
		: wrapper?.querySelector(':scope > .block-read > pre > code, :scope > .block-read > .rapier-hscroll--code > pre > code');
	if (!code) return;
	const copied = await _rapierWriteTextClipboard(_rapierSemanticProjection(code).replace(/\n$/, ''));
	if (!copied) { showToast('could not copy', 'error'); return; }
	button.setAttribute('data-copied', '');
	clearTimeout(button._rapierCopiedTimer);
	button._rapierCopiedTimer = setTimeout(() => button.removeAttribute('data-copied'), 1500);
}
