const _rapierRhythmRuntime = { key: null };
const _rapierSpliceRuntime = { slugState: null };
function _rapierSyncDocumentRhythm(host = document.getElementById('editor-blocks'), changed = null, spliced = null) {
	if (!host) return;
	const spec = globalThis.RapierMarkdownSpec;
	const frontmatter = String(rapier.document.frontmatter || ''), layout = _rapierWordPage() ? 'docx' : RapierPreferences.read('layout');
	const key = layout + '\n' + frontmatter;
	if (spliced) {
		if (key === _rapierRhythmRuntime.key && spliced.length <= 64) {
			for (const wrapper of spliced) if (wrapper?.isConnected && wrapper.parentElement) _rapierSyncDocumentRhythm(host, wrapper);
			return;
		}
		changed = null;
	}
	const authored = spec.readDocumentSettings(frontmatter);
	const settings = layout === 'docx' ? spec.wordDocumentSettings(authored) : authored;
	const visible = wrapper => wrapper?.classList.contains('block-wrapper') && !wrapper.hidden &&
		!wrapper.classList.contains('block-wrapper--metadata') && wrapper.style.getPropertyValue('--md-rhythm-anchor') !== '1' &&
		!!_rapierBoundBlock(wrapper) && !_rapierWysiwygRenderHidden(_rapierBoundBlock(wrapper));
	const edges = wrapper => {
		const block = _rapierBoundBlock(wrapper);
		const type = wrapper._rapierRhythmType || (block?.type === 'heading' ? 'h' + (wrapper.dataset.headingLevel || 1) : 'paragraph');
		const own = layout === 'plain' ? {} : _rapierBlockSpacing(block);
		const row = {...spec.documentSpacing(settings, type), ...own};
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
	_rapierRhythmRuntime.key = key;
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

function _rapierBlockSpacing(block) {
	if (!block || !['paragraph', 'heading'].includes(block.type)) return {};
	if (!String(block.raw || '').includes('<!--md-layout:v1')) return {};
	const raw = String(block.raw || '').replace(/\s+$/, '').replace(/\r?\n[ \t]*(?:=+|-+)[ \t]*$/, '').replace(/[ \t]+#+[ \t]*$/, '');
	const last = raw.slice(raw.lastIndexOf('\n') + 1);
	const marker = /<!--md-layout:v1[ \t][^\r\n]*?-->$/.exec(last);
	if (!marker || _rapierListItemTree(raw).list) return {};
	const layout = marker && globalThis.RapierMarkdownLayout?.parseLayout(marker[0]);
	if (!layout) return {};
	const own = {};
	for (const key of ['before', 'after', 'line']) if (layout[key] != null) own[key] = layout[key];
	return own;
}
