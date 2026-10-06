// Framing owns only offsets. No field interpretation or source normalization belongs here.
export function frontMatterLine(text, start) {
	let end = start;
	while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end++;
	const eol = text[end] === '\r' && text[end + 1] === '\n' ? '\r\n' : text[end] === '\r' || text[end] === '\n' ? text[end] : '';
	return {start, end, next: end + eol.length, text: text.slice(start, end), eol};
}

export function frontMatterFrame(text) {
	if (typeof text !== 'string') throw new TypeError('Front matter needs text');
	const bom = text[0] === '\uFEFF' ? '\uFEFF' : '';
	const opening = frontMatterLine(text, bom.length);
	let closing = null;
	if (/^--- *$/.test(opening.text) && opening.eol) {
		for (let at = opening.next; at < text.length;) {
			const line = frontMatterLine(text, at);
			if (/^(?:---|\.\.\.) *$/.test(line.text)) { closing = line; break; }
			at = line.next;
		}
	}
	return {bom, opening, closing};
}

export function splitOpeningFrontmatter(markdown) {
	const source = String(markdown == null ? '' : markdown);
	const {closing} = frontMatterFrame(source);
	const bodyOffset = closing ? closing.next : 0;
	return {frontmatter: closing ? source.slice(0, bodyOffset) : null, body: source.slice(bodyOffset), bodyOffset};
}
