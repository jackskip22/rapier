// SPDX-License-Identifier: AGPL-3.0-only

{
	const markdownWriter = pictures => {
		const turndown = new TurndownService({headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', hr: '---'});
		turndown.addRule('sourceToken', {
			filter: node => node.nodeName === 'SPAN' && node.classList.contains('rapier-source-token') && node.hasAttribute('data-rapier-source'),
			replacement: (content, node) => { try { return decodeURIComponent(node.getAttribute('data-rapier-source')); } catch (_) { return content; } },
		});
		turndown.addRule('picture', {
			filter: node => node.nodeName === 'IMG' && node.hasAttribute('data-rapier-asset') && pictures.has(node.getAttribute('data-rapier-asset')),
			replacement: (content, node) => '![' + (node.getAttribute('alt') || '').replace(/[\[\]\\]/g, '\\$&') + '](' + pictures.get(node.getAttribute('data-rapier-asset')) + ')',
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
		return turndown;
	};
	globalThis.RapierDocxReader = Object.freeze({
		async read(file, {signal, onProgress} = {}) {
			const pictures = new Map();
			const checkCurrent = () => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
			const result = await globalThis.RapierDocxImport.readDocx(file, {
				signal, onProgress, checkCurrent,
				embedImage: async image => {
					const reference = 'docx-picture-' + (pictures.size + 1), bytes = image.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image.bytes);
					const url = 'data:' + (image.mime || 'image/png') + ';base64,' + RapierBundleIO.toBase64(bytes);
					pictures.set(reference, url);
					return {reference, url};
				},
			});
			checkCurrent();
			if (typeof result.canonical === 'string') return {markdown: result.canonical, warnings: result.warnings || []};
			const turndown = markdownWriter(pictures);
			let markdown = turndown.turndown(result.html).trim() + '\n';
			markdown = globalThis.RapierDocxImport.finishDocxMarkdown(markdown, result, {convertHtml: html => turndown.turndown(html)});
			checkCurrent();
			if (!markdown.trim()) throw new Error('This document has no supported content.');
			return {markdown, warnings: result.warnings || []};
		},
	});
}
