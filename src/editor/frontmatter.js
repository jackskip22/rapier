function _rapierRenderFrontmatter() {
	const region = document.getElementById('frontmatter-region');
	if (!region) return;
	const header = rapier.document.docKind === 'markdown' ? String(rapier.document.frontmatter || '') : '';
	region.hidden = !header || rapier.view.mode === 'source' || rapier.compare.active;
	const raw = document.getElementById('frontmatter-raw');
	if (raw.textContent !== header) raw.textContent = header;
	if (!header) region.open = false;
	document.getElementById('frontmatter-source').textContent = rapier.access.readOnly ? 'View source' : 'Edit source';
}

function _rapierFrontmatterSource(offset = 0) {
	if (!rapier.document.frontmatter || !_rapierUiRequestSourceView()) return false;
	const textarea = document.getElementById('source-textarea');
	rapier.view.pendingSourceAnchor = {offset, viewportRatio: .1};
	_rapierRevealSourceAnchor(textarea);
	textarea.focus({preventScroll: true});
	return true;
}

function _rapierFrontmatterBodySource() {
	const header = rapier.document.frontmatter;
	if (!header || /[\r\n]$/.test(header)) return false;
	if (_rapierFrontmatterSource(header.length)) showToast('Add a new line after the metadata to write below it.', 'info');
	return true;
}

document.getElementById('frontmatter-source').addEventListener('click', () => _rapierFrontmatterSource());
