// SPDX-License-Identifier: AGPL-3.0-only
const fail = (code, message) => Object.assign(new Error(message), {code});
export const PICKER_PAGE = '/drive-picker.html';
const READY = 'rapier-drive-picker-ready', PICK = 'rapier-drive-picker', DONE = 'rapier-drive-picked';

export function pickerRegistered(registration) {
	return typeof registration?.pickerKey === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(registration.pickerKey) && /^[0-9]{1,20}$/.test(registration.appId || '');
}
export function openDrivePicker({facts, registration, origin, open, listen, timeoutMs = 15 * 60 * 1000} = {}) {
	if (!pickerRegistered(registration)) throw fail('unavailable', 'choosing files made by other apps is coming soon.');
	const popup = open(PICKER_PAGE, 'rapier-drive-picker', 'popup,width=760,height=620');
	if (!popup) throw fail('popup', 'allow this site to open the google drive window, then try again.');
	return new Promise((resolve, reject) => {
		let ready = false, known = null, sent = false, finished = false;
		const finish = (error, count = 0) => {
			if (finished) return; finished = true;
			clearTimeout(timer); clearInterval(closed); unlisten();
			if (error) { try { popup.close(); } catch {} reject(error); } else resolve(count);
		};
		const send = () => {
			if (!ready || !known || sent) return;
			sent = true;
			popup.postMessage({type: PICK, folderId: known.folderId, accessToken: known.accessToken, key: registration.pickerKey, appId: registration.appId}, origin);
		};
		const timer = setTimeout(() => finish(null, 0), timeoutMs);
		const closed = setInterval(() => { if (popup.closed) finish(null, 0); }, 500);
		const unlisten = listen(event => {
			if (event.source !== popup || event.origin !== origin || !event.data || typeof event.data !== 'object') return;
			if (event.data.type === READY) { ready = true; send(); }
			else if (event.data.type === DONE) {
				if (event.data.error) finish(fail('picker', 'google drive did not open its file chooser. nothing changed.'));
				else finish(null, Number.isSafeInteger(event.data.count) && event.data.count >= 0 ? event.data.count : 0);
			}
		});
		Promise.resolve(facts).then(value => {
			if (typeof value?.folderId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value.folderId) || typeof value.accessToken !== 'string' || !value.accessToken) throw fail('config', 'sync the plain files once before choosing files.');
			known = value; send();
		}).catch(error => finish(error));
	});
}
