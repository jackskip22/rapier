// SPDX-License-Identifier: AGPL-3.0-only
export const TABLE_BEGIN = '<!-- PLUGIN_TABLE_BEGIN (tools/embed-plugin-table.mjs writes this table) -->';
export const TABLE_END = '<!-- PLUGIN_TABLE_END -->';
const OPTIONAL = {reader: ['ocr']};
const mb = bytes => (bytes / 1e6 >= 10 ? (bytes / 1e6).toFixed(1) : (bytes / 1e6).toFixed(2)) + ' MB';
const builds = (plugin, file) => (file.builds || plugin.builds || ['reader', 'full']).map(build => build === 'document' ? 'full' : build);

export function pluginTable(manifest) {
	const rows = ['| Plug-in | Adds | Size | Pages |', '| --- | --- | --- | --- |'];
	const totals = {reader: 0, full: 0}, optional = {reader: 0, full: 0};
	for (const plugin of manifest.plugins) {
		const bytes = plugin.files.reduce((sum, file) => sum + file.bytes, 0), pages = new Set(plugin.files.flatMap(file => builds(plugin, file)));
		for (const file of plugin.files) for (const build of builds(plugin, file)) {
			totals[build] += file.bytes;
			if ((OPTIONAL[build] || []).includes(plugin.name)) optional[build] += file.bytes;
		}
		const where = pages.has('reader') && pages.has('full') ? 'Both' : pages.has('reader') ? 'The reader' : '`rapier.html`';
		const opt = (OPTIONAL.reader || []).includes(plugin.name) ? ' (the reader: only with `--with ' + plugin.name + '`)' : '';
		rows.push('| `' + plugin.name + '` | ' + String(plugin.adds || '').replace(/\|/g, '\\|') + ' | ' + mb(bytes) + (plugin.files.length > 1 ? ' (' + plugin.files.length + ' files)' : '') + ' | ' + where + opt + ' |');
	}
	rows.push('', 'Totals: the reader, ' + mb(totals.reader - optional.reader) + ' (' + mb(totals.reader) + ' with `ocr`); `rapier.html`, ' + mb(totals.full) +
		'. Release ' + manifest.release + '.');
	return rows.join('\n');
}

export function withPluginTable(text, manifest, readerBytes) {
	let next = text;
	const begin = next.indexOf(TABLE_BEGIN), end = next.indexOf(TABLE_END);
	if (manifest && begin >= 0 && end > begin) next = next.slice(0, begin + TABLE_BEGIN.length) + '\n' + pluginTable(manifest) + '\n' + next.slice(end);
	if (readerBytes) next = next.replace(/The reader is one file of about \d+ kB/, 'The reader is one file of about ' + Math.round(readerBytes / 10000) * 10 + ' kB');
	return next;
}
