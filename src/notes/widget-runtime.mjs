// A packaged, DOM-free entry point for the widget's short-lived WebView. Same secure origin,
// native mutex and BroadcastChannel as the visible editor; no second transaction owner.
import {createFolder} from './folder.mjs';
import {createNativeByteStore, createNativeNotesLocks} from './native-store.mjs';
import {createWidgetNotes} from './widget.mjs';
import {NATIVE_BYTE_OPS, createNativeTransport} from '../shell/native-transport.mjs';

export function startWidgetRuntime(host, {Channel = globalThis.BroadcastChannel, origin = globalThis.location?.origin} = {}) {
	let serial = 0, busy = false, transport = null;
	const waiting = new Map();
	host.onmessage = event => {
		let answer = null;
		if (typeof event.data === 'string') { try { answer = JSON.parse(event.data); } catch (_) { return; } }
		if (!answer || (answer.v === 1 && typeof answer.op === 'string')) {
			if (!transport) return;
			const got = transport.answer(event.data);
			answer = {id: got.requestId, ok: got.ok, value: got.result, error: {message: got.error, code: got.refused || undefined}};
		}
		const pending = waiting.get(answer.id); if (!pending) return;
		waiting.delete(answer.id);
		answer.ok ? pending.resolve(answer.value) : pending.reject(Object.assign(new Error(answer.error?.message || 'The native Notes folder refused the operation.'), {code: answer.error?.code}));
	};
	const call = (operation, args = {}) => new Promise((resolve, reject) => {
		const id = String(++serial); waiting.set(id, {resolve, reject});
		try {
			if (!NATIVE_BYTE_OPS.includes(operation)) host.postMessage(JSON.stringify({id, operation, arguments: args}));
			else if (transport) transport.request(operation, id, args);
			else throw new Error('The widget is not connected to the native Notes folder.');
		} catch (error) { waiting.delete(id); reject(error); }
	});
	// The app answers widget.ready with its transport: binary when its WebView carries ArrayBuffers,
	// and the native session's generation every byte frame is bound to.
	const ready = call('widget.ready').then(state => {
		transport = createNativeTransport({host, origin, binary: state?.binaryTransport === true, generation: () => state?.notesStoreGeneration ?? null});
	});
	globalThis.rapierWidgetRun = async request => {
		if (busy) return false;
		busy = true;
		let folder, channel, result;
		try {
			await ready;
			if (typeof Channel !== 'function') throw Object.assign(new Error('This Android WebView cannot coordinate widget edits. Open Notes in Rapier.'), {code: 'unsupported'});
			channel = new Channel('rapier-notes');
			const store = createNativeByteStore({call}), locks = createNativeNotesLocks({call});
			if (await store.stat('notes.json') == null) throw Object.assign(new Error('Open Notes in Rapier once to prepare the home-screen widget.'), {code: 'setup'});
			folder = createFolder({store, scope: 'notes', locks, channel, shared: true});
			const widget = createWidgetNotes(folder);
			if (request?.kind === 'tick') await widget.tick(request.action);
			else if (request?.kind !== 'refresh') throw Object.assign(new Error('Unknown widget action.'), {code: 'action'});
			const snapshot = await widget.snapshot();
			result = {snapshot};
		} catch (error) {
			result = {error: {code: error.code || 'storage', message: error.message || 'Open Notes to check this folder.'}};
		} finally { folder?.close(); channel?.close(); busy = false; }
		// Kotlin can request a fresh projection immediately when the epoch changed. Release this
		// request's owner/channel and its busy flag before giving it that completion boundary.
		await call('widget.complete', result);
		return true;
	};
	ready.catch(() => {});
}
if (globalThis.RapierWidgetHost) startWidgetRuntime(globalThis.RapierWidgetHost);
