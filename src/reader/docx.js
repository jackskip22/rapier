// SPDX-License-Identifier: AGPL-3.0-only

{
	globalThis.RapierDocxReader = Object.freeze({
		async read(file, {signal, onProgress} = {}) {
			const pictures = new Map();
			const checkCurrent = () => { if (signal?.aborted) throw new DOMException('Canceled', 'AbortError'); };
			const result = await globalThis.RapierDocxImport.readDocx(file, {
				signal, onProgress, checkCurrent,
				embedImage: async image => {
					const reference = 'docx-picture-' + (pictures.size + 1), bytes = image.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image.bytes);
					const url = image.mime === 'image/svg+xml' ? (await globalThis.RapierImageAssets.createAsset(bytes, null, {codec: image.mime})).url
						: 'data:' + (image.mime || 'image/png') + ';base64,' + RapierBundleIO.toBase64(bytes);
					pictures.set(reference, url);
					return {reference, url};
				},
			});
			checkCurrent();
			if (typeof result.canonical === 'string') return {markdown: result.canonical, warnings: result.warnings || []};
			const turndown = readerMarkdownWriter(pictures);
			let markdown = turndown.turndown(result.html).trim() + '\n';
			markdown = globalThis.RapierDocxImport.finishDocxMarkdown(markdown, result, {convertHtml: html => turndown.turndown(html)});
			checkCurrent();
			if (!markdown.trim()) throw new Error('This document has no supported content.');
			return {markdown, warnings: result.warnings || []};
		},
	});
}
