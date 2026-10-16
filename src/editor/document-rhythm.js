function _rapierSyncDocumentRhythm(host = document.getElementById('editor-blocks'), changed = null) {
	if (!host) return;
	const spec = globalThis.RapierMarkdownSpec;
	const authored = spec.readDocumentSettings(String(rapier.document.frontmatter || ''));
	const settings = RapierPreferences.read('layout') === 'docx' ? spec.wordDocumentSettings(authored) : authored;
	const visible = wrapper => wrapper?.classList.contains('block-wrapper') && !wrapper.hidden &&
		!wrapper.classList.contains('block-wrapper--metadata') && wrapper.style.getPropertyValue('--md-rhythm-anchor') !== '1' &&
		!!_rapierBoundBlock(wrapper) && !_rapierWysiwygRenderHidden(_rapierBoundBlock(wrapper));
	const edges = wrapper => {
		const block = _rapierBoundBlock(wrapper);
		const type = wrapper._rapierRhythmType || (block?.type === 'heading' ? 'h' + (wrapper.dataset.headingLevel || 1) : 'paragraph');
		const row = spec.documentSpacing(settings, type);
		return [row.before / 12, row.after / 12];
	};
	const setGap = (wrapper, next) => {
		const gap = String(Math.max(edges(wrapper)[1], next ? edges(next)[0] : 0));
		if (wrapper.style.getPropertyValue('--md-block-gap') !== gap) wrapper.style.setProperty('--md-block-gap', gap);
	};
	if (changed) {
		let previous = _rapierAdjacentBlockWrapper(changed, -1), next = _rapierAdjacentBlockWrapper(changed, 1);
		while (previous && !visible(previous)) previous = _rapierAdjacentBlockWrapper(previous, -1);
		while (next && !visible(next)) next = _rapierAdjacentBlockWrapper(next, 1);
		if (previous) setGap(previous, visible(changed) ? changed : next);
		if (visible(changed)) setGap(changed, next);
		else changed.style.removeProperty('--md-block-gap');
		return;
	}
	let previous = null;
	for (const wrapper of _blockWrapperChildren(host)) {
		if (!visible(wrapper)) continue;
		if (previous) setGap(previous, wrapper);
		previous = wrapper;
	}
	if (previous) setGap(previous, null);
}

function _rapierReadBlockRhythm(wrapper, readDiv) {
	const picture = readDiv.querySelector('p[data-md-picture]');
	const svg = picture?.querySelector('img')?.getAttribute('src')?.startsWith('data:image/svg+xml') ||
		picture && /data:image\/svg\+xml|\.svg(?:[)"\s]|$)/i.test(_rapierBoundBlock(wrapper)?.raw || '');
	if (svg) picture.querySelector('img')?.setAttribute('data-md-svg', '');
	wrapper._rapierRhythmType = wrapper.dataset.headingLevel ? 'h' + wrapper.dataset.headingLevel :
		readDiv.querySelector('.footnotes') ? 'footnote' : readDiv.querySelector('.rapier-jump-list') ? 'toc' :
		readDiv.querySelector('table') ? 'table' : picture ? svg ? 'drawing' : 'picture' :
		readDiv.querySelector('.diagram-block') ? 'drawing' : readDiv.querySelector('pre') ? 'code' :
		readDiv.querySelector('blockquote') ? 'quote' : readDiv.querySelector('ul,ol') ? 'list' :
		readDiv.querySelector('hr') ? 'rule' : 'paragraph';
	const host = wrapper.parentElement;
	if (host) _rapierSyncDocumentRhythm(host, wrapper);
}
