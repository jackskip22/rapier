function _rapierMarkdownPreview(markdown, references) {
	if (!md) return null;
	const env = references ? { references: Object.assign(Object.create(null), references) } : { references: Object.create(null) };
	return _rapierRenderModule('render-sanitize').sanitizeRapierHtml(md.render(String(markdown == null ? '' : markdown), env), 'export');
}
function _rapierCompareBlockView(result) {
	return _rapierCompareRuntime.view === 'blocks' && Array.isArray(result?.review);
}
function _rapierCompareBlockNoun(block, text) {
	if (block.kind !== 'text') return block.kind === 'frontmatter' ? 'block' : block.kind;
	const lines = text.slice(block.from, block.to).split('\n', 2);
	return lines.length === 2 && lines[0].includes('|') && /^[\s|:-]+$/.test(lines[1]) && lines[1].includes('-') ? 'table' : 'paragraph';
}
function _rapierCompareBlockItems(result) {
	if (result.blockItems) return result.blockItems;
	let index = 0;
	return result.blockItems = result.review.map(item => item.type === 'change' ? { type: 'hunk', index: index++ } : { type: item.type, item });
}
function _rapierCompareBlockReferences(side) {
	const runtime = _rapierCompareRuntime, text = side === 'before' ? rapier.compare.currentText : rapier.compare.incomingText;
	const held = runtime.references?.[side];
	if (held?.text === text) return held.references;
	let references = null;
	try { references = globalThis.RapierImageAssets.parseAssets(text).references; } catch (_) {}
	runtime.references = { ...runtime.references, [side]: { text, references } };
	return references;
}
function _rapierComparePlaceMarks(box, ground) {
	const sentinel = /[﷐﷑]|%EF%B7%9[01]/i;
	for (const node of box.querySelectorAll('*')) for (const attribute of node.attributes) if (sentinel.test(attribute.value)) return false;
	const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), replaced = [];
	let inside = false;
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (!inside && !/[﷐﷑]/.test(node.data)) continue;
		const fragment = document.createDocumentFragment();
		let run = '';
		const flush = () => {
			if (!run) return;
			if (inside && run.trim()) fragment.appendChild(_rapierCompareTextNode('span', 'compare-mark compare-mark--' + ground, run));
			else fragment.appendChild(document.createTextNode(run));
			run = '';
		};
		for (const character of node.data) {
			if (character === '﷐') { if (inside) return false; flush(); inside = true; }
			else if (character === '﷑') { if (!inside) return false; flush(); inside = false; }
			else run += character;
		}
		flush();
		replaced.push([node, fragment]);
	}
	if (inside) return false;
	for (const [node, fragment] of replaced) node.replaceWith(fragment);
	return true;
}
function _rapierCompareBlockMarkup(html) {
	const box = _rapierFinishSanitizedBlock(html, null, true).root;
	for (const link of box.querySelectorAll('a[href]')) link.removeAttribute('href');
	return box;
}
function _rapierCompareBlockBody(side, block, marks = []) {
	const text = side === 'before' ? rapier.compare.currentText : rapier.compare.incomingText;
	const references = _rapierCompareBlockReferences(side), source = text.slice(block.from, block.to);
	const marked = marks.length ? _rapierMarkdownPreview(RapierDiff.marked(text, block, marks), references) : null;
	let box = marked == null ? null : _rapierCompareBlockMarkup(marked);
	if (!box || !_rapierComparePlaceMarks(box, side === 'before' ? 'remove' : 'add')) {
		const html = _rapierMarkdownPreview(source, references);
		box = html == null ? _rapierCompareTextNode('div', '', source) : _rapierCompareBlockMarkup(html);
	}
	box.className = 'md-render compare-block__body';
	return box;
}
function _rapierCompareBlockContext(block) {
	const node = _rapierCompareBlockBody('after', block.after);
	node.classList.add('compare-block__context');
	return node;
}
function _rapierCompareBlockFold(item) {
	const holder = document.createElement('div');
	const button = _rapierCompareTextNode('button', 'compare-omitted', '⋯ ' + _rapierCountNoun(item.blocks.length, 'unchanged block'));
	button.type = 'button';
	let at = 0;
	button.addEventListener('click', () => {
		const stop = Math.min(item.blocks.length, at + 40), fragment = document.createDocumentFragment();
		for (; at < stop; at++) fragment.appendChild(_rapierCompareBlockContext(item.blocks[at]));
		holder.insertBefore(fragment, button);
		if (at === item.blocks.length) button.remove();
		else button.textContent = '⋯ ' + _rapierCountNoun(item.blocks.length - at, 'more unchanged block');
	});
	holder.appendChild(button);
	return holder;
}
function _rapierCompareBlockLines(line) {
	return line.before == null || line.before === line.after ? 'line ' + (line.after ?? line.before)
		: line.after == null ? 'line ' + line.before : 'line ' + line.before + ' → ' + line.after;
}
