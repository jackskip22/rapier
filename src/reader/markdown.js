// SPDX-License-Identifier: AGPL-3.0-only

const readerMarkdownWriter = pictures => {
	const turndown = new TurndownService({headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', hr: '---', emDelimiter: '*'});
	const escape = turndown.escape.bind(turndown);
	turndown.escape = text => globalThis.RapierHtmlReading.markRuns(escape(text)).replace(/</g, '\\<');
	const carried = node => node.nodeName !== 'SPAN' ? null : node.classList.contains('rapier-source-token') ? node.getAttribute('data-rapier-source') :
		node.classList.contains('math-rendered') ? node.getAttribute('data-math-src') : null;
	turndown.addRule('sourceToken', {
		filter: node => carried(node) != null,
		replacement: (content, node) => { try { return decodeURIComponent(carried(node)); } catch (_) { return content; } },
	});
	turndown.addRule('picture', {
		filter: node => node.nodeName === 'IMG' && node.hasAttribute('data-rapier-asset') && pictures.has(node.getAttribute('data-rapier-asset')),
		replacement: (content, node) => '![' + (node.getAttribute('alt') || '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\[\]\\]/g, '\\$&') + '](' + pictures.get(node.getAttribute('data-rapier-asset')) + ')',
	});
	turndown.addRule('table', {
		filter: 'table',
		replacement: (content, node) => {
			const rows = [...node.rows].map(row => [...row.cells]);
			if (!rows.length || node.querySelector('caption,table') || rows.some(row => row.some(cell => cell.colSpan > 1 || cell.rowSpan > 1 || cell.querySelector('p ~ p,ul,ol,pre,blockquote,table,h1,h2,h3,h4,h5,h6,div'))))
				return '\n\n' + node.outerHTML + '\n\n';
			const width = Math.max(...rows.map(row => row.length)), line = cells => '| ' + Array.from({length: width}, (_, at) => cells[at] ?? '').join(' | ') + ' |';
			const text = rows.map(row => row.map(cell => turndown.turndown(cell.innerHTML).trim().replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ')));
			const align = Array.from({length: width}, (_, at) => {
				const set = rows.slice(1).map(row => row[at]).find(cell => cell && /^(?:left|right|center)$/.test(cell.style.textAlign || cell.getAttribute('align') || ''));
				const how = set && (set.style.textAlign || set.getAttribute('align'));
				return how === 'right' ? '---:' : how === 'center' ? ':---:' : how === 'left' ? ':---' : '---';
			});
			return '\n\n' + [line(text[0]), line(align), ...text.slice(1).map(line)].join('\n') + '\n\n';
		},
	});
	const noteLabel = (node, link) => node.getAttribute('data-footnote-label') || (link || '').replace(/^#fn-?/, '');
	turndown.addRule('footnoteRef', {
		filter: node => node.nodeName === 'SUP' && node.classList.contains('footnote-ref'),
		replacement: (content, node) => { const a = node.querySelector('a'), label = a && noteLabel(a, a.getAttribute('href')); return label ? '[^' + label + ']' : content; },
	});
	turndown.addRule('footnotes', {
		filter: node => node.nodeName === 'SECTION' && node.classList.contains('footnotes'),
		replacement: (content, node) => '\n\n' + [...node.querySelectorAll(':scope > ol > li')].map(item => {
			const note = item.cloneNode(true);
			note.querySelectorAll('a.footnote-backref').forEach(back => back.remove());
			return '[^' + (noteLabel(item, '#' + item.id) || '?') + ']: ' + turndown.turndown(note.innerHTML).trim().replace(/\n/g, '\n    ');
		}).join('\n\n') + '\n\n',
	});
	turndown.addRule('taskCheckbox', {
		filter: node => node.nodeName === 'INPUT' && node.type === 'checkbox',
		replacement: (content, node) => (node.checked ? '[x]' : '[ ]') + ' ',
	});
	turndown.addRule('callout', {
		filter: node => node.nodeName === 'BLOCKQUOTE' && node.classList.contains('callout') && !!node.querySelector(':scope > .callout__label'),
		replacement: (content, node) => {
			const body = node.cloneNode(true);
			body.querySelector(':scope > .callout__label').remove();
			const lines = ('[!' + node.querySelector(':scope > .callout__label').textContent.trim().toUpperCase() + ']\n' + turndown.turndown(body.innerHTML).trim()).split('\n');
			return '\n\n' + lines.map(line => line ? '> ' + line : '>').join('\n') + '\n\n';
		},
	});
	const layout = node => { try { return /^<!--md-layout:v1 [^<>]*-->$/.exec(decodeURIComponent(node.getAttribute('data-md-layout') || ''))?.[0]; } catch (_) { return null; } };
	turndown.addRule('layout', {
		filter: node => /^(?:P|H[1-6])$/.test(node.nodeName) && !!layout(node),
		replacement: (content, node) => '\n\n' + (node.nodeName === 'P' ? '' : '#'.repeat(Number(node.nodeName[1])) + ' ') + content.trim() + ' ' + layout(node) + '\n\n',
	});
	return turndown;
};
