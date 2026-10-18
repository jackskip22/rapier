function _rapierRenderFrontmatter() {
	const region = document.getElementById('frontmatter-region');
	if (!region) return;
	const header = rapier.document.docKind === 'markdown' ? String(rapier.document.frontmatter || '') : '';
	region.hidden = !header || rapier.view.mode === 'source' || rapier.compare.active;
	const host = document.getElementById('editor-blocks');
	if (host && region.parentElement !== host) host.appendChild(region);
	if (host && host.lastElementChild !== region) host.appendChild(region);
	if (host && !host._rapierMetadataKeeper) {
		host._rapierMetadataKeeper = new MutationObserver(() => { if (region.isConnected && host.lastElementChild !== region) host.appendChild(region); });
		host._rapierMetadataKeeper.observe(host, {childList: true});
	}
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

function _rapierFrontmatterEntries(header) {
	const lines = header.split(/(?<=\n)/), entries = [];
	let index = 1, closing = lines.length;
	for (let at = 1; at < lines.length; at++) if (/^(?:---|\.\.\.) *\r?\n?$/.test(lines[at])) { closing = at; break; }
	for (; index < closing; index++) {
		const line = lines[index].replace(/\r?\n$/, ''), key = /^([^\s#\-?:][^:]*?):(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
		if (key) { entries.push({key: key[1], inline: key[2] ?? '', first: index, last: index}); continue; }
		const entry = entries.at(-1);
		if (entry && (/^[ \t]/.test(line) || /^-[ \t]|^-$/.test(line) || !line.trim())) entry.last = index;
		else entries.push({key: null, first: index, last: index});
	}
	for (const entry of entries) {
		while (entry.last > entry.first && !lines[entry.last].trim()) entry.last--;
		entry.raw = lines.slice(entry.first, entry.last + 1).join('');
		entry.block = entry.last > entry.first || /^[[{|>]/.test(entry.inline || '');
	}
	return {lines, closing, entries};
}

const _rapierYamlPlain = value => value !== '' && !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) && !/\s$|: |\s#|[\r\n]/.test(value) &&
	!/^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|0x[\da-f]+|0o[0-7]+|\.inf|\.nan)$/i.test(value);
function _rapierYamlRead(inline) {
	if (/^"(?:[^"\\]|\\.)*"$/.test(inline)) { try { return JSON.parse(inline); } catch (_) { return inline; } }
	if (/^'(?:[^']|'')*'$/.test(inline)) return inline.slice(1, -1).replace(/''/g, "'");
	return inline.replace(/[ \t]+#.*$/, '');
}
const _rapierYamlWrite = value => _rapierYamlPlain(value) ? value : JSON.stringify(value);

function _rapierFrontmatterOpen() {
	const header = rapier.document.docKind === 'markdown' ? String(rapier.document.frontmatter || '') : '';
	if (!header || _rapierUserMutationBlocked()) return false;
	const before = _rapierSourceText(), {lines, entries} = _rapierFrontmatterEntries(header);
	const shown = entries.filter(entry => entry.key);
	const value = entry => entry.block ? entry.raw.slice(entry.raw.indexOf(':') + 1).replace(entry.inline ? /^[ \t]+/ : /^[ \t]*\r?\n/, '').replace(/\r?\n$/, '') : _rapierYamlRead(entry.inline);
	const dialog = _openFieldDialog({title: 'Metadata',
		fields: shown.map(entry => ({label: entry.key, value: value(entry), type: entry.block ? 'multiline' : undefined})),
		okLabel: 'Apply',
		secondaryActions: [{label: rapier.access.readOnly ? 'source' : 'edit source', onSelect() { _rapierFrontmatterSource(); }}],
		prepare() {
			if (_rapierSourceText() !== before) throw new Error('The document changed. Open Metadata again.');
			const next = lines.slice(), eol = /\r\n/.test(header) ? '\r\n' : '\n';
			shown.forEach((entry, index) => {
				const typed = dialog.inputs[index].value;
				if (typed === value(entry)) return;
				const written = entry.block
					? entry.key + ':' + (entry.inline ? ' ' : eol) + typed.split(/\r?\n/).join(eol) + eol
					: entry.key + ':' + (typed === '' ? '' : ' ' + _rapierYamlWrite(typed)) + eol;
				next[entry.first] = written;
				for (let at = entry.first + 1; at <= entry.last; at++) next[at] = '';
			});
			return next.join('') + before.slice(header.length);
		},
		async onOk(_, next) {
			if (next === before) return;
			if (_rapierSourceText() !== before || !await _rapierCommitSourceProjection([_rapierPrefixSuffixDiff(before, next)], 'document.metadata', null, null,
				_rapierCaptureEditorViewport(), null, () => _rapierSourceText() === before)) showToast('The document changed. Open Metadata again.', 'error');
		}});
	shown.forEach((entry, index) => { if (entry.block) dialog.inputs[index].style.height = 'calc(' + (value(entry).split('\n').length + 1) + 'lh + 20px)'; });
	if (rapier.access.readOnly) for (const input of dialog.inputs) input.readOnly = true;
	return true;
}

document.getElementById('frontmatter-open').addEventListener('click', () => _rapierFrontmatterOpen());
