// SPDX-License-Identifier: AGPL-3.0-only
import {basename, join} from 'node:path';
import {createHash} from 'node:crypto';
import {pluginPackFiles, readPluginFile} from './stage-plugin-pack.mjs';

export const builtinFilesReuse = `if (m.files.length === 1 && RapierBundledPlugins.has('rapier-' + m.key) && _rapierProviders[m.key])
	return _rapierProviders[m.key];`;

export function fillBuiltinSlot(source, marker, value) {
	if (source.split(marker).length !== 2) throw new Error('The built-in editor needs exactly one ' + marker + ' slot');
	return source.replace(marker, () => value);
}

export const BUILTIN_PLUGIN_IDS = Object.freeze(['math', 'mermaid', 'mermaid-zenuml', 'letters', 'font-subset']);
export function builtinGroupHas(id, fileId) {
	return id === 'mermaid' ? fileId === 'rapier-mermaid-core' : id === 'mermaid-zenuml' ? fileId === 'rapier-mermaid-zenuml'
		: id === 'math' || id === 'font-subset' ? fileId === 'rapier-' + id : fileId.startsWith('rapier-' + id + '-');
}

export async function builtinPlugins(root, pack) {
	const selected = (await pluginPackFiles()).filter(file =>
        file.id === 'rapier-math' || file.id === 'rapier-font-subset' || file.id.startsWith('rapier-mermaid-') || file.id.startsWith('rapier-letters-'));
	const groups = [], elements = [], assets = [];
	for (const id of BUILTIN_PLUGIN_IDS) {
		const files = selected.filter(file => builtinGroupHas(id, file.id));
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
		const body = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
		const bytes = Buffer.from(body), sha256 = createHash('sha256').update(bytes).digest('hex');
		assets.push({id, file: 'rapier-plugin-' + id + '-' + sha256.slice(0, 16) + '.txt', body,
			bytes: bytes.length, sha256, sri: createHash('sha384').update(bytes).digest('base64')});
		groups.push({id, delivery: 'built-in', kind: id === 'math' ? 'script' : 'files', element,
			bytes: records.reduce((sum, file) => sum + file.bytes, 0), packedBytes: Buffer.byteLength(html), files: records});
		elements.push(html);
	}
	return {groups, html: elements.join(''), assets};
}
