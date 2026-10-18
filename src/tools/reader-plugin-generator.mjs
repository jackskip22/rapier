// SPDX-License-Identifier: AGPL-3.0-only
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {VERSION} from '../version.mjs';
import {bundleModules} from './reader-modules.mjs';
import {builtPlugin} from './reader-plugins.mjs';
import {squeezed, mitNotice} from './reader-build-shared.mjs';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FLOWCHART_MODULES = {RapierFlowchart: 'draw/flowchart.mjs'};
const FLOWCHART_READS = new Set(['parseFlowchart', 'renderFlowchart']);
const PDF_MODULES = {RapierPdf: 'interchange/pdf.mjs', RapierHtmlReading: 'spec/html-reading.mjs'};
const DOCX_MODULES = {RapierDocxImport: 'interchange/docx.mjs', RapierHtmlReading: 'spec/html-reading.mjs'};
const DOCX_READS = new Set(['readDocx', 'finishDocxMarkdown']);
const WRITER_READS = new Set(['markRuns']);
export const READER_PLUGIN_ENTRIES = [...Object.values(FLOWCHART_MODULES), ...Object.values(PDF_MODULES), ...Object.values(DOCX_MODULES)];
export const READER_PLUGIN_READS = ['shell/vendor/turndown-7.2.4.lib.turndown.browser.umd.js', 'reader/markdown.js', 'editor/engine.js', 'interchange/pdf-plugin.js', 'reader/pdf.js', 'reader/docx.js'];

export async function buildReaderPlugins({root = here, version = VERSION, minify = true} = {}) {
	const read = path => readFile(resolve(root, path), 'utf8');
	const squeeze = async text => !minify ? text : await squeezed(text, {compress: {passes: 2, ecma: 2022}, mangle: true, ecma: 2022, format: {comments: (_, row) => /@license|@preserve|SPDX-License-Identifier|^!/.test(row.value), ascii_only: false}});
	const flowRegistry = await bundleModules({root, entries: FLOWCHART_MODULES, used: new Map([['RapierFlowchart', FLOWCHART_READS]])});
	const flowText = "(() => {\n'use strict';\n" + flowRegistry.text + '\n})();';
	new vm.Script(flowText, {filename: 'rapier-flowchart.js'});
	const flowFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier flowchart plug-in: Mermaid flowchart syntax drawn by Rapier\'s own SVG engine. */\n' + await squeeze(flowText) + '\n');
	const writerText = await read('shell/vendor/turndown-7.2.4.lib.turndown.browser.umd.js') + '\n' + await read('reader/markdown.js');
	const turndownNotice = (await mitNotice(root, entry => /Turndown|collapse-whitespace/.test(entry))).replaceAll('*/', '* /');
	const pdfRegistry = await bundleModules({root, entries: PDF_MODULES, used: new Map([['RapierPdf', null], ['RapierHtmlReading', WRITER_READS]])});
	const pdfPlugin = await read('interchange/pdf-plugin.js');
	const pdfText = "(() => {\n'use strict';\n" + writerText + '\n' + pdfRegistry.text + '\n' + pdfPlugin + '\n' + await read('reader/pdf.js') + '\n})();';
	new vm.Script(pdfText, {filename: 'rapier-pdf.js'});
	const pdfFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier PDF reader plug-in: opens a PDF as a Markdown document.\n   It carries Turndown, under this notice:\n\n' + turndownNotice + '\n*/\n' + await squeeze(pdfText) + '\n');
	const docxRegistry = await bundleModules({root, entries: DOCX_MODULES, used: new Map([['RapierDocxImport', DOCX_READS], ['RapierHtmlReading', WRITER_READS]])});
	const docxText = "(() => {\n'use strict';\n" + writerText + '\n' + docxRegistry.text + '\n' + await read('reader/docx.js') + '\n})();';
	new vm.Script(docxText, {filename: 'rapier-docx.js'});
	const docxFile = Buffer.from('/* SPDX-License-Identifier: AGPL-3.0-only. The Rapier Word reader plug-in: opens a .docx as a Markdown document.\n   It carries Turndown, under this notice:\n\n' + turndownNotice + '\n*/\n' + await squeeze(docxText) + '\n');
	const built = [builtPlugin('flowchart', flowFile, version), builtPlugin('pdf', pdfFile, version), builtPlugin('docx', docxFile, version)], [flowchart, pdf, docx] = built;
	const files = {[flowchart.file]: flowFile, [pdf.file]: pdfFile, [docx.file]: docxFile};
	return {built, files, flowRegistry, pdfRegistry, docxRegistry};
}
