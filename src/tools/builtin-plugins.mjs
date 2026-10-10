// SPDX-License-Identifier: AGPL-3.0-only
// The editor resource carries the agent-reachable subset of the native plug-in pack.
// Every payload and pin comes from that pack's owner; packing never rewrites vendor bytes.
import {basename, join} from 'node:path';
import {pluginPackFiles, readPluginFile} from './stage-plugin-pack.mjs';

// This is spliced inside the existing loader, after its byte check and preparation.
// Apps hosts already execute their verified runtime inline under the host's script policy.
export const builtinExecution = `if (RapierBundledPlugins.has(RESOURCE)) {
	_rapierExecuteVendorSource(m.file, new TextDecoder('utf-8', {fatal: true}).decode(bytes));
	return Promise.resolve(m.started && m.started()).then(function () { if (m.configure) _check(); });
}`;

// The Apps barrier registers carried files before Draw opens. Draw's unchanged call reuses that provider.
export const builtinFilesReuse = `if (m.files.length === 1 && RapierBundledPlugins.has('rapier-' + m.key) && _rapierProviders[m.key])
	return _rapierProviders[m.key];`;

export function fillBuiltinSlot(source, marker, value) {
	if (source.split(marker).length !== 2) throw new Error('The built-in editor needs exactly one ' + marker + ' slot');
	return source.replace(marker, () => value);
}

export async function builtinPlugins(root, pack) {
	const selected = (await pluginPackFiles()).filter(file =>
        file.id === 'rapier-math' || file.id === 'rapier-font-subset' || file.id.startsWith('rapier-mermaid-') || file.id.startsWith('rapier-letters-'));
	const groups = [], elements = [];
    for (const id of ['math', 'mermaid', 'letters', 'font-subset']) {
        const files = selected.filter(file => id === 'math' || id === 'font-subset' ? file.id === 'rapier-' + id : file.id.startsWith('rapier-' + id + '-'));
		if (!files.length) throw new Error('The editor resource has no ' + id + ' plug-in payload');
		const spans = [], records = [];
		for (const file of files) {
			const {bytes} = await readPluginFile(file, file.path ? null : join(root, 'dist/plugin-cache', file.id));
			const name = basename(file.path || new URL(file.url).pathname);
			const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
			if (!Buffer.from(source).equals(bytes)) throw new Error(file.id + ' is not exact UTF-8');
			spans.push({name, source});
			records.push({id: file.id, name, version: file.version || file.sri, bytes: bytes.length, sri: file.sri});
		}
		const element = 'rapier-plugin-' + id;
		const html = await pack(element, 'application/rapier-runtime', spans);
		groups.push({id, delivery: 'built-in', kind: id === 'math' ? 'script' : 'files', element,
			bytes: records.reduce((sum, file) => sum + file.bytes, 0), packedBytes: Buffer.byteLength(html), files: records});
		elements.push(html);
	}
	return {groups, html: elements.join('')};
}
