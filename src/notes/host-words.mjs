// SPDX-License-Identifier: AGPL-3.0-only
const NATIVE = ' (native)';
const native = () => typeof document === 'undefined' ? String(globalThis.name || '').endsWith(NATIVE) : globalThis.RapierPlatform?.environment.native === true;
export const nativeWorkerName = name => native() ? name + NATIVE : name;
export function notesHostWords() {
	return native()
		? {native: true, device: 'this device', Device: 'This device', keeper: 'The system', kind: 'system', pane: 'window', data: 'app data',
			storage: 'the storage for Rapier on this device', others: 'other files on this device'}
		: {native: false, device: 'this browser', Device: 'This browser', keeper: 'The browser', kind: 'browser', pane: 'tab', data: 'browser data',
			storage: 'the browser\'s storage for this site', others: 'other sites\' data'};
}
