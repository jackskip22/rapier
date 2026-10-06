// SPDX-License-Identifier: AGPL-3.0-only
// Recording custody is NOT an atomic-write scratch file. Ordinary .*.tmp files may be swept or
// omitted by backup; these .partial/.json siblings are somebody's work until an explicit choice.
const STEM = /^\.rapier-recording-[a-f0-9]{32}-[A-Za-z0-9_.%~-]{1,144}$/;
export function recordingStem(path) {
	if (typeof path !== 'string') return null;
	const stem = path.replace(/\.(?:partial|json)$/, '');
	return stem !== path && STEM.test(stem) ? stem : null;
}
export function isRecordingPartial(path) { return !!recordingStem(path) && path.endsWith('.partial'); }
export function recordingPaths(note, id) {
	if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('An unfinished recording needs a unique identity.');
	// The filename is a bounded ASCII hint (OPFS may refuse Unicode). The descriptor retains the
	// EXACT note filename and stable id, so a rename or a long Unicode name cannot change owner.
	const hint = encodeURIComponent(note).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).slice(0, 144);
	const stem = '.rapier-recording-' + id + '-' + hint;
	return {stem, partial: stem + '.partial', marker: stem + '.json'};
}
export const RECORDING_STORAGE_NOTICE = 'This storage cannot keep an unfinished recording. Keep this page open while recording.';
export function recordingStorageError() { return Object.assign(new Error(RECORDING_STORAGE_NOTICE), {code: 'recording-storage', fallback: 'whole-blob'}); }
