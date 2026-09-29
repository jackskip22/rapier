// A view of the retained prefix, outside the editable body. Source owns every edit and Undo.
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
	// The body may have been far down a windowed source view; metadata begins at the file's start.
	rapier.view.pendingSourceAnchor = {offset, viewportRatio: .1};
	_rapierRevealSourceAnchor(textarea);
	textarea.focus({preventScroll: true});
	return true;
}

// An EOF closing fence has no body line. Do not silently create one or append prose to its fence.
function _rapierFrontmatterBodySource() {
	const header = rapier.document.frontmatter;
	if (!header || /[\r\n]$/.test(header)) return false;
	if (_rapierFrontmatterSource(header.length)) showToast('Add a new line after the metadata to write below it.', 'info');
	return true;
}

document.getElementById('frontmatter-source').addEventListener('click', () => _rapierFrontmatterSource());
