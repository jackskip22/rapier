// SPDX-License-Identifier: AGPL-3.0-only
export const BACKUP_MANIFEST_FILE = 'rapier-backup.json';
export function backupHeader(index, {appVersion, stamp}) {
	return {format: 'rapier-notes-backup', version: 1, appVersion, stamp, revision: index.revision ?? null,
		...(index.folderGeneration === undefined ? {} : {folderGeneration: index.folderGeneration}), files: []};
}
export function backupManifestBytes(manifest) {
	return new TextEncoder().encode(JSON.stringify(manifest, null, 1) + '\n');
}
