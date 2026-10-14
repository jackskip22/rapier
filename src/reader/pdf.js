// SPDX-License-Identifier: AGPL-3.0-only

{
	const escapeLine = line => line.replace(/[\\`*_\[\]<>#|~$]/g, '\\$&').replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3').replace(/^(\s*)([-+=])/, '$1\\$2');
	const markdownOfPdf = (html, pictures) => {
		const out = [];
		for (const node of new DOMParser().parseFromString(html, 'text/html').body.children) {
			if (node.tagName === 'HR') out.push('---');
			else if (node.tagName === 'P') {
				const image = node.querySelector('img[data-rapier-asset]');
				if (image) out.push('![' + (image.getAttribute('alt') || '').replace(/[\[\]\\]/g, '\\$&') + '](' + pictures.get(image.getAttribute('data-rapier-asset')) + ')');
				else {
					const lines = [''];
					for (const child of node.childNodes) { if (child.nodeName === 'BR') lines.push(''); else lines[lines.length - 1] += child.textContent; }
					out.push(lines.map(escapeLine).join('  \n'));
				}
			}
		}
		return out.join('\n\n') + '\n';
	};
	globalThis.RapierPdfReader = Object.freeze({
		plugin: globalThis.RapierPdfPlugin,
		async read(file, {mode = 'text', signal, onProgress} = {}) {
			const pictures = new Map();
			const result = await globalThis.RapierPdf.readPdf(file, {mode, signal, onProgress, checkCurrent: () => {},
				embedImage: async image => {
					const reference = 'page-' + (pictures.size + 1);
					pictures.set(reference, 'data:image/png;base64,' + RapierBundleIO.toBase64(image.bytes));
					return reference;
				}});
			return {markdown: markdownOfPdf(result.html, pictures), warnings: result.warnings, pages: result.stats.pages};
		},
	});
}
