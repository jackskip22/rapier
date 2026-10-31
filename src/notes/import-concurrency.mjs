// SPDX-License-Identifier: AGPL-3.0-only
export async function mapImportBatch(rows, visit) {
	const values = [];
	for (let at = 0; at < rows.length; at += 16) {
		const settled = await Promise.allSettled(rows.slice(at, at + 16).map((row, offset) => Promise.resolve().then(() => visit(row, at + offset))));
		const failed = settled.find(result => result.status === 'rejected');
		if (failed) throw failed.reason;
		values.push(...settled.map(result => result.value));
	}
	return values;
}
