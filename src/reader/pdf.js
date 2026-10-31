// SPDX-License-Identifier: AGPL-3.0-only

{
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
			if (typeof result.canonical === 'string') return {markdown: result.canonical, warnings: result.warnings};
			const writer = readerMarkdownWriter(pictures);
			return {markdown: writer.finish(writer.turndown(result.html)), warnings: result.warnings};
		},
	});
}
