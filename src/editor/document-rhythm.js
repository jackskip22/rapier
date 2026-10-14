function _rapierSyncDocumentRhythm(host = document.getElementById('editor-blocks'), changed = null) {
	if (!host) return;
	const space = {paragraph: 8 / 17.6, heading: [20 / 17.6, 4 / 17.6], block: 12 / 17.6};
	const visible = wrapper => wrapper?.classList.contains('block-wrapper') && !wrapper.hidden &&
		!wrapper.classList.contains('block-wrapper--metadata') && wrapper.style.getPropertyValue('--md-rhythm-anchor') !== '1' &&
		!!_rapierBoundBlock(wrapper) && !_rapierWysiwygRenderHidden(_rapierBoundBlock(wrapper));
	const edges = wrapper => {
		const block = _rapierBoundBlock(wrapper), heading = block?.type === 'heading';
		const paragraph = block?.type === 'paragraph' && !wrapper._rapierRhythmBlock;
		return heading ? space.heading : paragraph ? [0, space.paragraph] : [0, space.block];
	};
	const setGap = (wrapper, next) => {
		const gap = String(Math.max(edges(wrapper)[1], next ? edges(next)[0] : 0));
		if (wrapper.style.getPropertyValue('--md-block-gap') !== gap) wrapper.style.setProperty('--md-block-gap', gap);
	};
	if (changed) {
		let previous = changed.previousElementSibling, next = changed.nextElementSibling;
		while (previous && !visible(previous)) previous = previous.previousElementSibling;
		while (next && !visible(next)) next = next.nextElementSibling;
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
	wrapper._rapierRhythmBlock = !!readDiv.querySelector('p[data-md-picture],.math-display-wrap,.diagram-block');
	const host = wrapper.parentElement;
	if (host) _rapierSyncDocumentRhythm(host, wrapper);
}
