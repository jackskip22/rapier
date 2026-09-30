// SPDX-License-Identifier: AGPL-3.0-only
// Packed into the RAPIER_PLATFORM slot; inflated first, before every editor stage and any host handshake.
const _RAPIER_SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const _RAPIER_SHARE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function _rapierTextHasDocumentScalars(value) {
	const text = String(value == null ? '' : value);
	for (let i = 0; i < text.length; i += 1) {
		const code = text.charCodeAt(i);
		if (code === 0) return false;
		if (code >= 0xD800 && code <= 0xDFFF) {
			if (code >= 0xDC00) return false;
			const low = text.charCodeAt(i + 1);
			if (!(low >= 0xDC00 && low <= 0xDFFF)) return false;
			i += 1;
		}
	}
	return true;
}

const RAPIER_DOCUMENT_NAME_MAX_CHARS = 512;
function _rapierDocumentNameIsAdmissible(value) {
	const name = String(value == null ? '' : value);
	 
	 
	 
	 
	return !!name.trim() && name.length <= RAPIER_DOCUMENT_NAME_MAX_CHARS &&
		!/[\\/<>"\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/.test(name);
}

function _rapierNormalizeAdmittedText(value, admittedBytes, accepts) {
	let text = String(value == null ? '' : value);
	const byteLength = new TextEncoder().encode(text).byteLength;
	if (admittedBytes != null) {
		const declaredBytes = Number(admittedBytes);
		if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes !== byteLength) {
			throw new Error('document byte length is invalid');
		}
	}
	if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
	if (byteLength > RapierTextCodec.maxDocumentBytes) {
		throw new Error('document is too large for Rapier (max 25 MiB)');
	}
	if (!accepts(text)) throw new Error('document is not plain UTF-8 text');
	return text;
}

const RapierTextCodec = Object.freeze({
	maxDocumentBytes: 25 * 1024 * 1024,
	isDocumentFragment: function (value) {
		return _rapierTextHasDocumentScalars(value);
	},
	isProtocolFragment: function (value) {
		const text = String(value == null ? '' : value);
		if (!_rapierTextHasDocumentScalars(text)) return false;
		for (let i = 0; i < text.length; i += 1) {
			const code = text.charCodeAt(i);
			if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
		}
		return true;
	},
	normalizeDocument: function (value, admittedBytes) {
		return _rapierNormalizeAdmittedText(
			value, admittedBytes, RapierTextCodec.isDocumentFragment
		);
	},
	normalizeProtocol: function (value, admittedBytes) {
		return _rapierNormalizeAdmittedText(
			value, admittedBytes, RapierTextCodec.isProtocolFragment
		);
	},
	decodeDocumentUtf8: function (bytes) {
		const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
		if (view.byteLength > RapierTextCodec.maxDocumentBytes) {
			throw new Error('document is too large for Rapier (max 25 MiB)');
		}
		let text;
		try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view); }
		catch (_) { throw new Error('document is not plain UTF-8 text'); }
		return RapierTextCodec.normalizeDocument(text, view.byteLength);
	},
	readDocumentBlob: async function (blob) {
		return (await RapierTextCodec.readDocumentRecord(blob)).text;
	},
	// The BOM is a fact of the file, written back on save; byteLength is the text's own, compared after the BOM is stripped.
	readDocumentRecord: async function (blob) {
		if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('document bytes are unavailable');
		if (Number(blob.size) > RapierTextCodec.maxDocumentBytes) {
			throw new Error('document is too large for Rapier (max 25 MiB)');
		}
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
		const text = RapierTextCodec.decodeDocumentUtf8(bytes);
		return { text, bom, bytes: bytes.byteLength - (bom ? 3 : 0) };
	},
});

 
const _rapierProviders = Object.seal({
	speech: null,
	speechUtterance: null,
	math: null,
	mermaid: null,
	// Text in pictures (notes/ocr.js): the full profile's reader of the words in a note's pictures.
	ocr: null,
	// Draw's letter sets (draw/draw.js), one plug-in of one file a set: draw/letters.mjs's catalogue.
	'letters-field': null,
	'letters-relief': null,
	'letters-leaf': null,
	'letters-arabesque': null,
});
const _rapierBootstrapRuntime = Object.seal({ pendingIntake: null, complete: false, failed: false });
let _rapierPublishBootFacts;
const _rapierBootFactsPublished = new Promise(resolve => { _rapierPublishBootFacts = resolve; });
const RAPIER_PLATFORM_FACETS = Object.freeze([
	'environment', 'preferences', 'pro', 'files',
	'recovery', 'resources', 'host', 'installation', 'operations',
]);
const _rapierPlatformPortRuntime = (function () {
	const EMPTY_FACET = Object.freeze({});
	let current = null;
	return Object.freeze({
		get port() { return current; },
		set port(value) {
			if (!value) { current = null; return; }
			const total = {};
			for (let i = 0; i < RAPIER_PLATFORM_FACETS.length; i++) {
				const facet = RAPIER_PLATFORM_FACETS[i];
				total[facet] = value[facet] || EMPTY_FACET;
			}
			current = Object.freeze(total);
		},
	});
})();
Object.defineProperty(window, 'RapierPlatform', {
	configurable: false, enumerable: true,
	get: function () { return _rapierPlatformPortRuntime.port; },
});

const RAPIER_ACCENT_PRESETS = Object.freeze([
	Object.freeze({ name: 'Teal',   accent: '#12A594', fg: '#000000' }),
	Object.freeze({ name: 'Blue',   accent: '#3291ff', fg: '#000000' }),
	Object.freeze({ name: 'Amber',  accent: '#F38020', fg: '#000000' }),
	Object.freeze({ name: 'Green',  accent: '#45D483', fg: '#000000' }),
	Object.freeze({ name: 'Red',    accent: '#E5484D', fg: '#000000' }),
	Object.freeze({ name: 'Purple', accent: '#8E4EC6', fg: '#ffffff' }),
	Object.freeze({ name: 'Pink',   accent: '#E93D82', fg: '#000000' }),
	Object.freeze({ name: 'Gray',   accent: '#8F8F8F', fg: '#000000' }),
]);
const RAPIER_ACCENT_VALUES = Object.freeze(RAPIER_ACCENT_PRESETS.map(function (preset) { return preset.accent; }));

 
 
 
 
 
 
const RAPIER_STORAGE_SCOPE = (function () {
	try {
		if (!/^https?:$/.test(location.protocol)) return '';
		var dir = new URL('.', location.href).pathname;
		return dir === '/' ? '' : '@' + dir;
	} catch (_) { return ''; }
})();
const RapierStorage = Object.freeze({
	scope: RAPIER_STORAGE_SCOPE,
	preferences: Object.freeze({
		// Amber's hex became the Cloudflare orange (the founder, 29 September 2026): a saved '#F5A623' is read as it, not reset.
		accent:         Object.freeze({ key: 'rapier:preference:accent',            fallback: '#12A594', values: RAPIER_ACCENT_VALUES, legacy: Object.freeze({ '#F5A623': '#F38020' }) }),
		// Law 52: a fresh Rapier follows the device's light or dark setting.
		theme:          Object.freeze({ key: 'rapier:preference:theme',             fallback: 'system', values: Object.freeze(['dark', 'light', 'system']) }),
		fontSize:       Object.freeze({ key: 'rapier:preference:font-size',         fallback: 'md', values: Object.freeze(['sm', 'md', 'lg', 'xl']) }),
		checker:        Object.freeze({ key: 'rapier:preference:checker',           fallback: true }),
		lineNums:       Object.freeze({ key: 'rapier:preference:line-numbers',      fallback: 'auto', values: Object.freeze(['auto', 'off', 'selected', 'all']) }),
		imageStorage:   Object.freeze({ key: 'rapier:preference:image-storage', fallback: 'jxl', values: Object.freeze(['jxl', 'original']) }),
		wrap:           Object.freeze({ key: 'rapier:preference:wrap',              fallback: true }),
		dim:            Object.freeze({ key: 'rapier:preference:dim',               fallback: 'dim', values: Object.freeze(['dim', 'full']) }),
		lineFit:        Object.freeze({ key: 'rapier:preference:line-fit',          fallback: 'truncate', values: Object.freeze(['truncate', 'resize']) }),
		readOnly:       Object.freeze({ key: 'rapier:preference:read-only',         fallback: false }),
		showPlayButton: Object.freeze({ key: 'rapier:preference:show-play-button',  fallback: false }),
		highlights:     Object.freeze({ key: 'rapier:preference:highlights',        fallback: 'standard', values: Object.freeze(['standard', 'accent', 'off']) }),
		highlightColor: Object.freeze({ key: 'rapier:preference:highlight-color',  fallback: 'default', values: Object.freeze(['default', 'green', 'red', 'blue', 'yellow', 'purple']) }),
		headings:       Object.freeze({ key: 'rapier:preference:headings',          fallback: 'expanded', values: Object.freeze(['off', 'collapsed', 'expanded']) }),
		// An app preference, never a document fact.
		layout:         Object.freeze({ key: 'rapier:preference:layout',            fallback: 'rapier', values: Object.freeze(['rapier', 'plain']) }),
		// R86h: app preferences, never document facts.
		notesSkills:    Object.freeze({ key: 'rapier:preference:notes-skills',      fallback: false }),
		notesStart:     Object.freeze({ key: 'rapier:preference:notes-start',       fallback: 'editor', values: Object.freeze(['editor', 'notes']) }),
		notesSort:      Object.freeze({ key: 'rapier:preference:notes-sort',        fallback: 'custom', values: Object.freeze(['custom', 'created', 'modified']) }),
		notesLayout:    Object.freeze({ key: 'rapier:preference:notes-layout',      fallback: 'half', values: Object.freeze(['half', 'full']) }),
		// Law 8: an open coloured note wears its colour on the bar alone (default) or over the page.
		notesColour:    Object.freeze({ key: 'rapier:preference:notes-colour',      fallback: 'bar', values: Object.freeze(['bar', 'page']) }),
	}),
	webFileHandlesDb: 'rapier:file-handles' + RAPIER_STORAGE_SCOPE,
	webGenerationPrefix: 'web:',
	recoveryDb: 'rapier:recovery' + RAPIER_STORAGE_SCOPE,
	recoverySnapshot: 'rapier:recovery:snapshot' + RAPIER_STORAGE_SCOPE,
	restoreCursor: 'rapier:recovery:restore-cursor' + RAPIER_STORAGE_SCOPE,
	// Open-work item 5: the boots that began a restore and never settled, counted where a crash cannot erase them.
	bootAttempt: 'rapier:recovery:boot-attempt' + RAPIER_STORAGE_SCOPE,
	// EDIT HERE's reload carries its promotion across in this tab's own sessionStorage (persistence-b02's two-tab cells).
	writerPromotion: 'rapier:recovery:writer-promotion' + RAPIER_STORAGE_SCOPE,
	readingPoints: 'rapier:recovery:reading-points' + RAPIER_STORAGE_SCOPE,
	writerLease: 'rapier:recovery:writer:v1' + RAPIER_STORAGE_SCOPE,
	embedDraftPrefix: 'rapier:embed:draft' + RAPIER_STORAGE_SCOPE + ':',
	welcomeVersion: 'rapier:welcome:v1' + RAPIER_STORAGE_SCOPE,
	optional: Object.freeze({
		mathDb: 'rapier:cache:math',
		mathLocalPrefix: 'rapier:cache:math:',
		mermaidDb: 'rapier:cache:mermaid',
		mermaidLocalPrefix: 'rapier:cache:mermaid:',
		// The text reader's verified files, and what it read in each picture (words and where they sit, never the picture).
		ocrDb: 'rapier:cache:ocr',
		ocrReadingsDb: 'rapier:cache:ocr-readings',
		// Draw's letter sets, each file as it arrived (draw/draw.js).
		lettersDb: 'rapier:cache:letters',
	}),
});






// Open-work item 5: a boot that restores a saved document and never settles (a renderer crash on a
// low-memory phone, mid-render) is counted here, in localStorage, which survives the crash. Two such
// boots in a row on the same document hold the third restore back, so the page opens and the person
// keeps the work as a file (R85b) instead of a crash loop the Android app gives up on after three.
// Pure over the one key: the engine names no key of its own (tools/check-engine-ownership.mjs).
const RapierBootAttempts = (function () {
	var key = RapierStorage.bootAttempt, HOLD_AFTER = 2;
	function read() {
		try {
			var raw = localStorage.getItem(key), value = raw ? JSON.parse(raw) : null;
			return value && typeof value === 'object' && typeof value.stamp === 'string' && Number.isInteger(value.count) ? value : null;
		} catch (_) { return null; }
	}
	function write(value) { try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch (_) {} }
	return Object.freeze({
		holdAfter: HOLD_AFTER,
		// Before a restore renders `stamp`: held when this stamp's last boots never settled; else counted.
		begin: function (stamp) {
			var value = read(), count = value && value.stamp === stamp ? value.count : 0;
			if (count >= HOLD_AFTER) { if (!value.held) write({stamp: stamp, count: count, held: true, at: Date.now()}); return {held: true, count: count}; }
			write({stamp: stamp, count: count + 1, held: false, at: Date.now()});
			return {held: false, count: count + 1};
		},
		// Two frames after the boot is ready. A hold stays until the person has the work in hand.
		settle: function () { var value = read(); if (!value || !value.held) write(null); },
		release: function () { write(null); },
		state: function () { return read(); },
	});
})();
window.RapierBootAttempts = RapierBootAttempts;

// EDIT HERE in a tab whose store has moved on reloads the latest draft first (_rapierReloadAfterWriterPromotion);
// the page that comes back must take the lease whether or not the tab is the visible one, or the other tab's
// retry takes it back while this one boots. The mark lives in this tab's sessionStorage: it survives the
// reload and reaches no other tab.
const RapierWriterPromotion = (function () {
	var key = RapierStorage.writerPromotion;
	return Object.freeze({
		mark: function () { try { sessionStorage.setItem(key, '1'); } catch (_) {} },
		consume: function () {
			try { var marked = sessionStorage.getItem(key) === '1'; if (marked) sessionStorage.removeItem(key); return marked; }
			catch (_) { return false; }
		},
	});
})();
window.RapierWriterPromotion = RapierWriterPromotion;

const RapierPreferences = (function () {
var _preferenceListeners = Object.create(null);
function _preferenceAdmits(spec, value) {
	return value != null && typeof value === typeof spec.fallback &&
		Array.isArray(value) === Array.isArray(spec.fallback) &&
		(!spec.values || spec.values.indexOf(value) >= 0);
}
return Object.freeze({
	read: function rapierReadPreference(field) {
		var spec = RapierStorage.preferences[field];
		if (!spec) throw new Error('unknown Rapier preference: ' + field);
		var value = spec.fallback;
		var platform = window.RapierPlatform;
		if (platform && platform.preferences.ownsStore === true && typeof platform.preferences.read === 'function') {
			try { value = platform.preferences.read(spec.key, spec.fallback); }
			catch (_) { value = spec.fallback; }
		} else {
			var raw = null;
			try { raw = localStorage.getItem(spec.key); }
			catch (_) { return spec.fallback; }
			if (raw == null || raw === '') return spec.fallback;
			try { value = JSON.parse(raw); }
			catch (error) {
				try { localStorage.removeItem(spec.key); } catch (_) {}
				try { console.warn('[rapier] discarded invalid preference', spec.key, error); } catch (_) {}
				return spec.fallback;
			}
		}
		// A value the preference once admitted and has since given up is read as the one that took its place, so a saved choice is kept.
		if (spec.legacy && typeof value === 'string' && Object.prototype.hasOwnProperty.call(spec.legacy, value)) value = spec.legacy[value];
		if (_preferenceAdmits(spec, value)) return value;
		if (!platform || platform.preferences.ownsStore !== true || typeof platform.preferences.read !== 'function') {
			try { localStorage.removeItem(spec.key); } catch (_) {}
		}
		try { console.warn('[rapier] discarded invalid preference', spec.key); } catch (_) {}
		return spec.fallback;
	},
	write: function rapierWritePreference(field, value) {
		var spec = RapierStorage.preferences[field];
		if (!spec) throw new Error('unknown Rapier preference: ' + field);
		var admitted = _preferenceAdmits(spec, value) ? value : spec.fallback;
		var platform = window.RapierPlatform;
		if (platform && platform.preferences.ownsStore === true && typeof platform.preferences.write === 'function') {
			try { Promise.resolve(platform.preferences.write(spec.key, admitted)).catch(function () {}); }
			catch (_) {}
		} else {
			try { localStorage.setItem(spec.key, JSON.stringify(admitted)); } catch (_) {}
		}
		var listeners = _preferenceListeners[field];
		for (var at = 0; listeners && at < listeners.length; at++) {
			try { listeners[at](admitted, field); }
			catch (error) { try { console.warn('[rapier] preference listener failed', spec.key, error); } catch (_) {} }
		}
		return admitted;
	},
	subscribe: function (field, apply) {
		if (!RapierStorage.preferences[field]) throw new Error('unknown Rapier preference: ' + field);
		(_preferenceListeners[field] || (_preferenceListeners[field] = [])).push(apply);
		return apply;
	},
});
})();

function _rapierPwaFrameAdmission(isTopLevel) {
	return isTopLevel === true;
}

(function () {
	'use strict';

	if (!window.RapierHost && !window.speedracer &&
			_rapierPwaFrameAdmission(window.self === window.top) &&
			(location.protocol === 'http:' || location.protocol === 'https:')) {
		[
			{ rel: 'manifest', href: 'manifest.json' },
		].forEach(function (attrs) {
			var link = document.createElement('link');
			Object.keys(attrs).forEach(function (key) { link.setAttribute(key, attrs[key]); });
			document.head.appendChild(link);
		});
	}

	var speedracer = (typeof window !== 'undefined' && window.speedracer) ? window.speedracer.app : null;
	var hasSpeedracer = !!(speedracer && typeof speedracer === 'object');
	var nativeHost = !hasSpeedracer && (typeof window !== 'undefined') ? window.RapierHost : null;
	var hasNative = !!(nativeHost && typeof nativeHost.postMessage === 'function');
	const _nativePlatformId = hasNative
		? String(window.__RAPIER_NATIVE_PLATFORM_ID || 'native').toLowerCase()
		: 'web';
	const _nativeHostRuntime = Object.seal({
		sequence: 0,
		pending: new Map(),
		ready: null,
		transport: null,
		state: Object.seal({
			platformId: _nativePlatformId,
			capabilities: {},
			pro: null,
			launcherIcon: { color: 'black' },
			recents: [],
			pendingIntake: false,
			recoveryAutoResume: false,
			installation: { state: 'standalone', installed: false },
			notesStoreGeneration: null,
			// Android: the plug-ins' Google Play pack (status, progress, error and the rows' words).
			resources: null,
		}),
	});
	const _nativeIntakeRuntime = Object.seal({ transfer: null, waiters: [], last: null, failure: null, generation: 0, transport: null, expecting: false });
	const _nativeSaveRuntime = Object.seal({ sequence: 0, pending: new Map() });
	const _platformBindingRuntime = Object.seal({ files: new Map() });
	function _setPlatformFileBinding(authority, generation, writable) {
		var id = String(authority || '').trim();
		if (!id) return;
		_platformBindingRuntime.files.set(id, {
			generation: generation == null ? null : generation,
			writable: writable === true,
		});
	}
	function _clearPlatformFileBinding(authority) {
		var id = String(authority || '').trim();
		if (id) _platformBindingRuntime.files.delete(id);
		else _platformBindingRuntime.files.clear();
	}
	function _setNativeCurrentFileBinding(authority, generation) {
		_clearPlatformFileBinding();
		_setPlatformFileBinding(authority, generation, true);
	}
	function _platformFileGeneration(authority) {
		var id = String(authority || '').trim();
		var binding = id ? _platformBindingRuntime.files.get(id) : null;
		return binding ? binding.generation : null;
	}
	function _platformHasWritableBinding(authority) {
		var id = String(authority || '').trim();
		var binding = id ? _platformBindingRuntime.files.get(id) : null;
		return !!(binding && binding.writable === true);
	}
	function _platformCurrentFileAuthority() {
		if (_platformBindingRuntime.files.size !== 1) return '';
		return String(_platformBindingRuntime.files.keys().next().value || '');
	}
	function _nativeCapability(name) {
		return !!(hasNative && _nativeHostRuntime.state.capabilities && _nativeHostRuntime.state.capabilities[name] === true);
	}

	// Byte ops cross through the one seam (shell/native-transport.mjs), bound to this exact origin
	// and to the native Notes session's generation; binary when the app declared it.
	function _nativeHostTransport() {
		if (_nativeHostRuntime.transport) return _nativeHostRuntime.transport;
		var seam = window.RapierNativeTransport;
		if (!seam) throw new Error('The native transport is not part of this page.');
		_nativeHostRuntime.transport = seam.createNativeTransport({
			host: nativeHost,
			origin: location.origin,
			binary: _nativeCapability('binaryTransport'),
			generation: function () { return _nativeHostRuntime.state.notesStoreGeneration; },
		});
		return _nativeHostRuntime.transport;
	}

	// generation binds a byte op to its own call (a document transfer's), not the Notes session's.
	function _nativeHostCall(operation, args, timeoutMs, generation) {
		if (!hasNative) return Promise.reject(new Error('native host is unavailable'));
		var id = 'host-' + Date.now().toString(36) + '-' + (++_nativeHostRuntime.sequence).toString(36);
		return new Promise(function (resolve, reject) {
			var timeout = setTimeout(function () {
				if (!_nativeHostRuntime.pending.has(id)) return;
				_nativeHostRuntime.pending.delete(id);
				reject(new Error('native ' + operation + ' timed out'));
			}, Math.max(1000, Number(timeoutMs) || 15000));
			_nativeHostRuntime.pending.set(id, { resolve: resolve, reject: reject, timeout: timeout });
			try {
				var seam = window.RapierNativeTransport;
				if ((args && args.bytes) || (seam && seam.NATIVE_BYTE_OPS.indexOf(operation) >= 0)) _nativeHostTransport().request(operation, id, args, { generation: generation });
				else nativeHost.postMessage(JSON.stringify({
					id: id,
					operation: String(operation || ''),
					arguments: args && typeof args === 'object' ? args : {},
				}));
			} catch (error) {
				_nativeHostRuntime.pending.delete(id);
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	function _nativeHostNotify(operation, args) {
		_nativeHostCall(operation, args || {}).catch(function (error) {
			try { console.warn('[rapier-platform] native ' + operation + ' failed', error); } catch (_) {}
		});
	}

	function _nativeHostEvent(name, detail) {
		if (name === 'document.saveResult') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-save-result', { detail: detail || {} })); } catch (_) {}
			var saveRequestId = String(detail && detail.requestId || '');
			var savePayloadDigest = String(detail && detail.payloadDigest || '').toLowerCase();
			if (saveRequestId && saveRequestId.length <= 160 && /^[0-9a-f]{64}$/.test(savePayloadDigest)) {
				_nativeHostNotify('document.ackSaveResult', {
					requestId: saveRequestId,
					payloadDigest: savePayloadDigest,
				});
			}
			return;
		}
		if (name === 'pro.changed') {
			_nativeHostRuntime.state.pro = detail || null;
			_emitPro(_normalizeProState(_nativeHostRuntime.state.pro));
			return;
		}
		if (name === 'launcherIcon.changed') {
			_nativeHostRuntime.state.launcherIcon = detail && typeof detail === 'object'
				? Object.assign({}, detail)
				: { color: 'black' };
			try {
				window.dispatchEvent(new CustomEvent('rapier:launcher-icon-changed', {
					detail: Object.assign({}, _nativeHostRuntime.state.launcherIcon),
				}));
			} catch (_) {}
			return;
		}
		if (name === 'tts.event') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-tts', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'resources.changed') {
			_applyNativeResources(detail);
			return;
		}
		if (name === 'windowInsets.changed') {
			_applyNativeWindowInsets(detail);
			return;
		}
		if (name === 'installation.changed') {
			if (detail && typeof detail === 'object') _nativeHostRuntime.state.installation = detail;
			try { window.dispatchEvent(new CustomEvent('rapier:installation-changed', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'file.changed') {
			try { window.dispatchEvent(new CustomEvent('rapier:file-changed', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'file.check') {
			try {
				if (typeof _rapierCheckExternalBoundFile === 'function') _rapierCheckExternalBoundFile();
			} catch (_) {}
			return;
		}
		if (name === 'file.openFailed') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-open-failed', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'window.closeRequested') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-close-requested', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'window.checkpointRequested') {
			try { window.dispatchEvent(new CustomEvent('rapier:checkpoint-requested')); } catch (_) {}
			return;
		}
		if (name === 'document.printFinished') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-print-finished')); } catch (_) {}
			return;
		}
		if (name === 'document.printFailed') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-print-failed', { detail: detail || {} })); } catch (_) {}
		}
	}

	function _nativeHostReceive(event) {
		var data = event && event.data, message = null;
		if (typeof data === 'string') {
			try { message = JSON.parse(data); } catch (_) { return; }
			if (!message || typeof message !== 'object') return;
		}
		if (!message || (message.v === 1 && typeof message.op === 'string')) {
			var answer;
			try { answer = _nativeHostTransport().answer(data); } catch (_) { return; }
			message = { type: 'response', id: answer.requestId, ok: answer.ok, result: answer.result, error: answer.error };
		}
		if (message.type === 'event') {
			_nativeHostEvent(String(message.event || ''), message.detail || {});
			return;
		}
		if (message.type !== 'response') return;
		var id = String(message.id || '');
		var pending = _nativeHostRuntime.pending.get(id);
		if (!pending) return;
		_nativeHostRuntime.pending.delete(id);
		clearTimeout(pending.timeout);
		if (message.ok === true) pending.resolve(message.result);
		else pending.reject(new Error(String(message.error || 'native operation failed')));
	}

	if (hasNative) nativeHost.onmessage = _nativeHostReceive;

	// A document's bytes arrive as intake.chunk frames bound to the delivery's generation (named in its
	// begin); each is answered under its own op, requestId and generation.
	function _nativeIntakeTransport() {
		if (_nativeIntakeRuntime.transport) return _nativeIntakeRuntime.transport;
		var seam = window.RapierNativeTransport;
		if (!seam) throw new Error('The native transport is not part of this page.');
		_nativeIntakeRuntime.transport = seam.createNativeTransport({
			host: window.RapierIntake,
			origin: location.origin,
			binary: _nativeCapability('binaryTransport'),
			generation: function () { return _nativeIntakeRuntime.transfer ? _nativeIntakeRuntime.transfer.frameGeneration : null; },
		});
		return _nativeIntakeRuntime.transport;
	}

	function _nativeIntakeChunk(data) {
		var seam = _nativeIntakeTransport();
		var got = seam.receive(data, { generation: null });
		var transfer = _nativeIntakeRuntime.transfer;
		var frame = got.ok ? got.frame : { op: got.op, requestId: got.requestId, generation: null };
		function answer(meta) {
			if (frame.requestId == null) return;
			try { seam.send('intake.chunk', { requestId: frame.requestId, generation: frame.generation, meta: meta }); } catch (_) {}
		}
		if (!got.ok) return answer({ ok: false, refused: got.refused, error: 'The native frame was refused: ' + got.refused });
		if (!transfer || frame.op !== 'intake.chunk' || frame.requestId !== String(transfer.id) || !(frame.payload instanceof Uint8Array)) {
			return answer({ ok: false, refused: 'generation', error: 'The native frame was refused: generation' });
		}
		if (frame.generation == null || frame.generation !== transfer.frameGeneration) {
			return answer({ ok: false, refused: 'generation', error: 'The native frame was refused: generation' });
		}
		var sequence = Number(frame.meta.sequence);
		if (!Number.isInteger(sequence) || sequence !== transfer.nextSequence) {
			_nativeIntakeReject(transfer, new Error('native document transfer sequence mismatch'));
			return;
		}
		try {
			transfer.receivedBytes += frame.payload.byteLength;
			if (transfer.receivedBytes > RapierTextCodec.maxDocumentBytes) {
				throw new Error('document is too large for Rapier (max 25 MiB)');
			}
			var part = transfer.decoder ? transfer.decoder.decode(frame.payload, { stream: true }) : frame.payload;
			if (part.length) transfer.parts.push(part);
			transfer.nextSequence += 1;
			answer({ ok: true, result: { sequence: sequence } });
		} catch (error) {
			answer({ ok: true, result: { sequence: sequence } });
			_nativeIntakeReject(transfer, error);
		}
	}

	function _nativeIntakeFinish(payload, error) {
		_nativeIntakeRuntime.transfer = null;
		_nativeHostRuntime.state.pendingIntake = false;
		_nativeIntakeRuntime.last = payload || null;
		var waiters = _nativeIntakeRuntime.waiters.splice(0);
		var surfaceError = !!(error && waiters.length === 0 && _rapierBootstrapRuntime.complete);
		_nativeIntakeRuntime.failure = error && waiters.length === 0 && !surfaceError ? error : null;
		if (payload) {
			try { _rapierBootstrapRuntime.pendingIntake = payload; } catch (_) {}
		}
		waiters.forEach(function (waiter) {
			try {
				if (waiter.timeout) clearTimeout(waiter.timeout);
				if (error) waiter.reject(error);
				else waiter.resolve(payload || null);
			} catch (_) {}
		});
		if (surfaceError) {
			try {
				window.dispatchEvent(new CustomEvent('rapier:platform-open-failed', {
					detail: {
						error: 'native_intake_failed',
						message: String(error && error.message || error || 'native intake failed'),
					},
				}));
			} catch (_) {}
		}
		if (payload && _rapierBootstrapRuntime.complete && (!payload.purpose || payload.purpose === 'external' || payload.purpose === 'share')) {
			try {
				window.dispatchEvent(new CustomEvent('rapier:platform-open', { detail: payload }));
			} catch (_) {}
		}
	}

	function _nativeIntakeReject(transfer, error) {
		var id = transfer && Number(transfer.id);
		_nativeIntakeRuntime.generation += 1;
		_nativeIntakeFinish(null, error);
		if (Number.isSafeInteger(id) && id > 0) {
			_nativeHostNotify('intake.clear', { intakeId: id });
		}
	}

	function _nativeIntakeOnMessage(event) {
		var data = event && event.data;
		var message = null;
		if (typeof data === 'string') {
			try { message = JSON.parse(data); } catch (_) { return; }
			if (!message || typeof message !== 'object') return;
		}
		var type = !message || (message.v === 1 && typeof message.op === 'string') ? 'frame' : String(message.type || '');
		if (_rapierBootstrapRuntime.failed) {
			var refusedTransfer = _nativeIntakeRuntime.transfer;
			if (refusedTransfer) {
				_nativeIntakeRuntime.generation += 1;
				_nativeIntakeFinish(null, null);
			}
			var refusedId = type === 'begin'
				? Number(message.id) || 0
				: (refusedTransfer ? Number(refusedTransfer.id) || 0 : 0);
			if (refusedId > 0) _nativeHostNotify('intake.clear', { intakeId: refusedId });
			return;
		}
		if (type === 'begin') {
			_nativeHostRuntime.state.pendingIntake = true;
			_nativeIntakeRuntime.generation += 1;
			_nativeIntakeRuntime.failure = null;
			_nativeIntakeRuntime.transfer = {
				id: Number(message.id) || 0,
				generation: _nativeIntakeRuntime.generation,
				deliveryGeneration: Number(message.deliveryGeneration),
				frameGeneration: message.generation == null ? null : String(message.generation),
				name: String(message.name || 'shared.md'),
				path: message.path == null ? null : String(message.path),
				documentAuthority: message.documentAuthority == null ? '' : String(message.documentAuthority),
				fileGeneration: message.fileGeneration == null ? null : message.fileGeneration,
				purpose: String(message.purpose || 'external'),
				transient: message.transient === true,
				contentType: String(message.contentType || ''),
				decoder: message.binary === true ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
				parts: [],
				receivedBytes: 0,
				nextSequence: 0,
			};
			return;
		}
		if (type === 'frame') {
			_nativeIntakeChunk(data);
			return;
		}
		if (type === 'end') {
			var finished = _nativeIntakeRuntime.transfer;
			if (!finished || finished.id !== Number(message.id) ||
					finished.deliveryGeneration !== Number(message.deliveryGeneration)) return;
			_nativeIntakeRuntime.transfer = null;
			try {
				if (message.fileGeneration != null) finished.fileGeneration = message.fileGeneration;
				var payload = {
					name: finished.name,
					path: finished.path,
					documentAuthority: finished.documentAuthority,
					fileGeneration: finished.fileGeneration,
					nativeIntakeId: finished.id,
					purpose: finished.purpose,
					transient: finished.transient === true,
					admittedBytes: finished.receivedBytes,
				};
				if (finished.decoder) {
					var finalText = finished.decoder.decode();
					if (finalText) finished.parts.push(finalText);
					var joined = finished.parts.join('');
					payload.bom = joined.charCodeAt(0) === 0xFEFF;
					payload.text = RapierTextCodec.normalizeDocument(joined, finished.receivedBytes);
				} else payload.blob = new Blob(finished.parts, {type: finished.contentType});
				_nativeIntakeFinish(payload, null);
			} catch (error) {
				_nativeIntakeReject(finished, error);
			}
			return;
		}
		if (type === 'cancel') {
			var cancelledId = Number(message.id) || 0;
			if (!_nativeIntakeRuntime.transfer || _nativeIntakeRuntime.transfer.id === cancelledId) {
				_nativeIntakeRuntime.generation += 1;
				_nativeIntakeFinish(null, null);
			}
			return;
		}
		if (type === 'error') {
			var failed = _nativeIntakeRuntime.transfer;
			if (failed && (failed.id !== Number(message.id) ||
					failed.deliveryGeneration !== Number(message.deliveryGeneration))) return;
			_nativeIntakeReject(failed, new Error(String(message.message || 'native intake failed')));
		}
	}

	function _nativeIntakePending() {
		return !!(_nativeHostRuntime.state.pendingIntake || _nativeIntakeRuntime.transfer);
	}

	function _waitForNativeIntake() {
		if (_nativeIntakeRuntime.failure) {
			var failure = _nativeIntakeRuntime.failure;
			_nativeIntakeRuntime.failure = null;
			return Promise.reject(failure);
		}
		if (_rapierBootstrapRuntime.pendingIntake) {
			return Promise.resolve(_rapierBootstrapRuntime.pendingIntake);
		}
		if (_nativeIntakeRuntime.last) {
			return Promise.resolve(_nativeIntakeRuntime.last);
		}
		if (!_nativeIntakePending() && !_nativeIntakeRuntime.expecting) return Promise.resolve(null);

		if (window.RapierIntake && typeof window.RapierIntake.postMessage === 'function') {
			return new Promise(function (resolve, reject) {
				var waiter = { resolve: resolve, reject: reject, timeout: null };
				waiter.timeout = setTimeout(function () {
					if (_nativeIntakeRuntime.waiters.indexOf(waiter) < 0) return;
					var error = new Error('native document intake timed out');
					if (_nativeIntakeRuntime.transfer) _nativeIntakeReject(_nativeIntakeRuntime.transfer, error);
					else {
						_nativeIntakeRuntime.generation += 1;
						_nativeIntakeFinish(null, error);
						_nativeHostNotify('intake.clear', {});
					}
				}, 180000);
				_nativeIntakeRuntime.waiters.push(waiter);
			});
		}

		return Promise.reject(new Error('native document transport is unavailable'));
	}

	if (window.RapierIntake && typeof window.RapierIntake.postMessage === 'function') {
		try {
			window.RapierIntake.onmessage = _nativeIntakeOnMessage;
			window.RapierIntake.postMessage(JSON.stringify({
				type: 'ready',
				session: Date.now().toString(36) + Math.random().toString(36).slice(2),
			}));
		} catch (_) {}
	}

	function _installNativeSpeechSynthesis() {
			if (_rapierProviders.speech) return;
			var active = null;
			var serial = 0;
			function NativeSpeechSynthesisUtterance(text) {
				this.text = String(text || '');
				this.rate = 1;
				this.onstart = null;
				this.onboundary = null;
				this.onend = null;
				this.onerror = null;
			}
			var nativeSpeechSynthesis = {
				speaking: false,
				paused: false,
				pending: false,
				getVoices: function () { return []; },
				cancel: function () {
					this.speaking = false;
					this.paused = false;
					active = null;
					_nativeHostNotify('tts.stop');
				},
				pause: function () { this.paused = true; _nativeHostNotify('tts.pause'); },
				resume: function () { this.paused = false; _nativeHostNotify('tts.resume'); },
				speak: function (utterance) {
					if (!utterance) return;
					var id = 'rapier-tts-' + (++serial);
					active = { id: id, utterance: utterance };
					this.speaking = true;
					this.paused = false;
					_nativeHostCall('tts.speak', {
						text: String(utterance.text || ''),
						utteranceId: id,
						rate: Number(utterance.rate || 1),
					}).then(function (result) {
						if (!result || result.accepted !== true) {
							// The phone's reason rides along ('no-offline-voice' is the one a person can act on).
							var refused = new Error('native tts unavailable');
							refused.reason = result && typeof result.reason === 'string' ? result.reason : '';
							throw refused;
						}
					}).catch(function (error) {
						if (!active || active.id !== id) return;
						nativeSpeechSynthesis.speaking = false;
						active = null;
						try { utterance.onerror && utterance.onerror({ type: 'error', error: (error && error.reason) || 'synthesis-failed' }); } catch (_) {}
					});
				},
			};
			_rapierProviders.speech = nativeSpeechSynthesis;
			_rapierProviders.speechUtterance = NativeSpeechSynthesisUtterance;
			window.addEventListener('rapier:platform-tts', function (event) {
				var d = (event && event.detail) || {};
				if (!active || d.id !== active.id) return;
				var u = active.utterance;
				if (d.type === 'start') {
					try { u.onstart && u.onstart({ type: 'start' }); } catch (_) {}
				} else if (d.type === 'boundary') {
					try { u.onboundary && u.onboundary({ type: 'boundary', charIndex: d.charIndex || 0, name: 'word' }); } catch (_) {}
				} else if (d.type === 'end') {
					nativeSpeechSynthesis.speaking = false;
					active = null;
					try { u.onend && u.onend({ type: 'end' }); } catch (_) {}
				} else if (d.type === 'error') {
					nativeSpeechSynthesis.speaking = false;
					active = null;
					// The phone's reason rides along: 'no-offline-voice' is the one a person can act on.
					try { u.onerror && u.onerror({ type: 'error', error: d.reason || 'synthesis-failed' }); } catch (_) {}
				}
			});
	}

	 
	var IDB_NAME = RapierStorage.webFileHandlesDb;
	var IDB_STORE = 'handles';
	const _webFileRuntime = Object.seal({
		liveHandles: new Map(),
		reportedGenerations: new Map(),
		activeAuthority: '',
		bindingMutation: Promise.resolve(),
	});

	function _queueWebBindingMutation(task) {
		var run = _webFileRuntime.bindingMutation.then(task, task);
		_webFileRuntime.bindingMutation = run.then(function () {}, function () {});
		return run;
	}

	function _openIdb() {
		return new Promise(function (resolve, reject) {
			try {
				var req = indexedDB.open(IDB_NAME, 1);
				req.onupgradeneeded = function () {
					req.result.createObjectStore(IDB_STORE);
				};
				req.onsuccess = function () { resolve(req.result); };
				req.onerror = function () { reject(req.error || new Error('idb open failed')); };
			} catch (e) { reject(e); }
		});
	}
	function _idbGet(key) {
		return _openIdb().then(function (db) {
			return new Promise(function (resolve, reject) {
				var tx = db.transaction(IDB_STORE, 'readonly');
				var r = tx.objectStore(IDB_STORE).get(key);
				r.onsuccess = function () { resolve(r.result || null); };
				r.onerror = function () { reject(r.error); };
			});
		}).catch(function () { return null; });
	}
	function _idbPut(key, val) {
		return _openIdb().then(function (db) {
			return new Promise(function (resolve, reject) {
				var tx;
				try { tx = db.transaction(IDB_STORE, 'readwrite', { durability: 'strict' }); }
				catch (_) { tx = db.transaction(IDB_STORE, 'readwrite'); }
				var store = tx.objectStore(IDB_STORE);
				store.clear();
				store.put(val, key);
				tx.oncomplete = function () { resolve(true); };
				tx.onerror = function () { reject(tx.error); };
			});
		}).catch(function () { return false; });
	}
	function _idbClearHandles() {
		return _openIdb().then(function (db) {
			return new Promise(function (resolve) {
				var tx;
				try { tx = db.transaction(IDB_STORE, 'readwrite', { durability: 'strict' }); }
				catch (_) { tx = db.transaction(IDB_STORE, 'readwrite'); }
				tx.objectStore(IDB_STORE).clear();
				tx.oncomplete = function () { resolve(true); };
				tx.onerror = function () { resolve(false); };
			});
		}).catch(function () { return false; });
	}
	function _idbDeleteHandle(key) {
		return _openIdb().then(function (db) {
			return new Promise(function (resolve) {
				var tx;
				try { tx = db.transaction(IDB_STORE, 'readwrite', { durability: 'strict' }); }
				catch (_) { tx = db.transaction(IDB_STORE, 'readwrite'); }
				tx.objectStore(IDB_STORE).delete(key);
				tx.oncomplete = function () { resolve(true); };
				tx.onerror = function () { resolve(false); };
			});
		}).catch(function () { return false; });
	}

	const _hasFsaSave = (typeof window !== 'undefined' &&
		typeof window.showSaveFilePicker === 'function');

	function _handleWritable(handle, mayPrompt) {
		if (!handle || typeof handle.queryPermission !== 'function') {
			return Promise.resolve(true); 
		}
		return handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
			if (p === 'granted') return true;
			if (mayPrompt === false) return false;
			if (typeof handle.requestPermission !== 'function') return false;
			return handle.requestPermission({ mode: 'readwrite' })
				.then(function (r) { return r === 'granted'; })
				.catch(function () { return false; });
		}).catch(function () { return false; });
	}

	function _saveResult(status, extra) {
		return Object.assign({
			status: status,
			confirmed: status === 'confirmed',
			verified: false,
		}, extra || {});
	}

	function _hexBytes(bytes) {
		return Array.from(bytes).map(function (value) {
			return value.toString(16).padStart(2, '0');
		}).join('');
	}

	async function _blobFingerprint(blob) {
		// Large exports keep their backing file; native and FSA readback use this same digest owner.
		if (blob.size > 8 * 1024 * 1024 && typeof globalThis.RapierNotesIntegrity?.sha256State === 'function') {
			var hash = globalThis.RapierNotesIntegrity.sha256State();
			for (var at = 0; at < blob.size; at += 65536) hash.update(new Uint8Array(await blob.slice(at, at + 65536).arrayBuffer()));
			return { bytes: blob.size, algorithm: 'sha256', digest: hash.finish() };
		}
		var buffer = await blob.arrayBuffer();
		if (window.crypto && window.crypto.subtle) {
			try {
				var digest = await window.crypto.subtle.digest('SHA-256', buffer);
				return { bytes: buffer.byteLength, algorithm: 'sha256', digest: _hexBytes(new Uint8Array(digest)) };
			} catch (_) {}
		}
		var data = new Uint8Array(buffer);
		var fnv = 0x811c9dc5;
		var adlerA = 1;
		var adlerB = 0;
		for (var i = 0; i < data.length; i++) {
			fnv ^= data[i];
			fnv = Math.imul(fnv, 0x01000193) >>> 0;
			adlerA = (adlerA + data[i]) % 65521;
			adlerB = (adlerB + adlerA) % 65521;
		}
		return {
			bytes: data.length,
			algorithm: 'fnv-adler',
			digest: fnv.toString(16).padStart(8, '0') + ':' + (((adlerB << 16) | adlerA) >>> 0).toString(16).padStart(8, '0'),
		};
	}

	function _webGenerationFromFingerprint(fingerprint) {
		if (!fingerprint) return null;
		return RapierStorage.webGenerationPrefix + fingerprint.algorithm + ':' + fingerprint.digest + ':' + fingerprint.bytes;
	}

	async function _webFileGeneration(file) {
		if (!file) return null;
		if (Number(file.size || 0) > RapierTextCodec.maxDocumentBytes) {
			


			return 'web:oversize:' + String(file.size) + ':' + String(file.lastModified || 0);
		}
		return _webGenerationFromFingerprint(await _blobFingerprint(file));
	}

	function _externalFileChangedError() {
		var error = new Error('the file changed outside Rapier');
		error.code = 'external_file_changed';
		return error;
	}

	function _saveVerificationError(cause) {
		var error = new Error('saved file could not be verified; Rapier did not rewrite the destination after readback');
		error.code = 'save_verification_failed';
		if (cause) error.cause = cause;
		return error;
	}

	function _requiresDestinationError() {
		var error = new Error('no authorised destination remains for this document');
		error.code = 'requires_destination';
		return error;
	}

	async function _writeToHandle(handle, blob, options) {
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;

		var expected = await _blobFingerprint(blob);
		var writable = await handle.createWritable({ keepExistingData: false, mode: 'exclusive' });
		try {
			// Check the destination while owning its writer, not before another writer can win.
			if (options.fileGeneration != null) {
				if (!handle || typeof handle.getFile !== 'function') throw new Error('saved file cannot be inspected before writing');
				var previousFile = await handle.getFile();
				if (Number(previousFile.size || 0) > RapierTextCodec.maxDocumentBytes) {
					throw _externalFileChangedError();
				}
				var previousGeneration = await _webFileGeneration(previousFile);
				if (previousGeneration !== String(options.fileGeneration)) {
					throw _externalFileChangedError();
				}
			}
			await writable.write(blob);
			await writable.close();
		} catch (error) {
			try { await writable.abort(); } catch (_) {}
			throw error;
		}
		var written;
		var actual;
		try {
			if (!handle || typeof handle.getFile !== 'function') {
				throw new Error('saved file cannot be read back for verification');
			}
			written = await handle.getFile();
			actual = await _blobFingerprint(written);
		} catch (error) {
			throw _saveVerificationError(error);
		}
		if (expected.bytes !== actual.bytes || expected.algorithm !== actual.algorithm || expected.digest !== actual.digest) {
			

			throw _saveVerificationError();
		}
		return _saveResult('confirmed', {
			verified: true,
			bytes: actual.bytes,
			fingerprint: actual.digest,
			fileGeneration: _webGenerationFromFingerprint(actual),
			destinationName: _rapierDocumentNameIsAdmissible(handle && handle.name)
				? String(handle.name) : '',
		});
	}

	function _pickerAcceptFor(filename) {
		var name = String(filename || 'document');
		var ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '.md';
		 
		if (!/^\.[A-Za-z0-9+.]+$/.test(ext) || ext.length > 16 || ext.endsWith('.')) return null;
		var accept = {};
		var mime = ({
			'.md':   'text/markdown', '.markdown': 'text/markdown', '.mdown': 'text/markdown',
			'.txt':  'text/plain',
			'.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
			'.js':   'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript',
			'.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml',
			'.csv':  'text/csv', '.yaml': 'application/yaml', '.yml': 'application/yaml',
		})[ext.toLowerCase()] || 'application/octet-stream';
		accept[mime] = [ext];
		return [{ description: 'Rapier document', accept: accept }];
	}

	async function _webDownload(blob, filename, options) {
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;
		var url = URL.createObjectURL(blob);
		try {
			var a = document.createElement('a');
			a.href = url;
			a.download = filename || 'download';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			return _saveResult('dispatched', { bytes: blob.size });
		} finally {
			setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 1000);
		}
	}

	function _webHandleRecord(value) {
		if (!value || !value.handle || typeof value.handle !== 'object' ||
				typeof value.generation !== 'string' ||
				value.generation.indexOf(RapierStorage.webGenerationPrefix) !== 0) {
			return { handle: null, generation: null };
		}
		return { handle: value.handle, generation: value.generation };
	}

	function _webRecordForAuthority(authority) {
		var id = String(authority || '').trim();
		if (!id) return Promise.resolve({ handle: null, generation: null });
		return _queueWebBindingMutation(async function () {
			var live = _webFileRuntime.liveHandles.get(id);
			if (live) {
				var liveRecord = _webHandleRecord(live);
				if (liveRecord.handle) return liveRecord;
				_webFileRuntime.liveHandles.delete(id);
			}
			var stored = await _idbGet('authority:' + id);
			var record = _webHandleRecord(stored);
			if (stored && stored.handle && !record.handle) {
				await _idbDeleteHandle('authority:' + id);
			}
			if (record.handle) {
				if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) return { handle: null, generation: null };
				_webFileRuntime.activeAuthority = id;
				_webFileRuntime.liveHandles.set(id, record);
				if (!_platformBindingRuntime.files.has(id)) _setPlatformFileBinding(id, record.generation, true);
			}
			return record;
		});
	}

	async function _webReadCurrentDocument(authority) {
		var id = String(authority || '').trim();
		var record = await _webRecordForAuthority(id);
		if (!record.handle || typeof record.handle.getFile !== 'function') return null;
		var file = await record.handle.getFile();
		var read = await RapierTextCodec.readDocumentRecord(file);
		var text = read.text;
		return {
			text: text,
			name: file.name || 'opened.md',
			documentAuthority: id,
			webFileHandle: record.handle,
			fileGeneration: await _webFileGeneration(file),
			transient: false,
			admittedBytes: read.bytes,
			bom: read.bom,
		};
	}

	async function _webCheckExternalFileChange(authority) {
		var id = String(authority || '').trim();
		if (!id || document.visibilityState === 'hidden') return false;
		var record = await _webRecordForAuthority(id);
		if (!record.handle || typeof record.handle.getFile !== 'function') return false;
		var current;
		try {
			current = await record.handle.getFile();
		} catch (error) {
			if (error && (error.name === 'NotFoundError' || error.name === 'InvalidStateError')) {
				if (_webFileRuntime.reportedGenerations.get(id) === '<missing>') return false;
				_webFileRuntime.reportedGenerations.set(id, '<missing>');
				_clearPlatformFileBinding(id);
				try {
					window.dispatchEvent(new CustomEvent('rapier:file-changed', {
						detail: { documentAuthority: id, missing: true },
					}));
				} catch (_) {}
				return true;
			}
			throw error;
		}
		var generation = await _webFileGeneration(current);
		var expected = _platformFileGeneration(id);
		if (expected == null) expected = record.generation;
		if (expected == null || String(expected) === generation) {
			if (expected == null || String(expected) !== generation) {
				await _queueWebBindingMutation(function () {
					return _webRefreshCurrentFileNow(id, {
						handle: record.handle,
						generation: generation,
					}, 'authority:' + id);
				});
			}
			_webFileRuntime.reportedGenerations.delete(id);
			return false;
		}
		if (_webFileRuntime.reportedGenerations.get(id) === generation) return false;
		_webFileRuntime.reportedGenerations.set(id, generation);
		try {
			window.dispatchEvent(new CustomEvent('rapier:file-changed', {
				detail: { documentAuthority: id, fileGeneration: generation },
			}));
		} catch (_) {}
		return true;
	}

	function _webPickerSave(blob, filename, options, persistedKey) {
		if (options && options.requireExistingDestination === true) {
			return Promise.reject(_requiresDestinationError());
		}
		 
		var pickerPromise;
		try {
			var pickerOptions = { suggestedName: filename || 'document' };
			var pickerTypes = _pickerAcceptFor(filename);
			if (pickerTypes) pickerOptions.types = pickerTypes;
			pickerPromise = window.showSaveFilePicker(pickerOptions);
		} catch (error) {
			return Promise.reject(error);
		}
		return pickerPromise.then(async function (handle) {
			var writable = await _handleWritable(handle);
			if (!writable) return _saveResult('cancelled');
			if (!handle || typeof handle.getFile !== 'function') {
				throw new Error('selected destination cannot be inspected before writing');
			}
			var selectedFile = await handle.getFile();
			if (Number(selectedFile.size || 0) > RapierTextCodec.maxDocumentBytes) {
				throw new Error('selected destination is too large to verify safely');
			}
			var selectedGeneration = await _webFileGeneration(selectedFile);
			var writeOptions = Object.assign({}, options || {}, { fileGeneration: selectedGeneration });
			var result = await _writeToHandle(handle, blob, writeOptions);
			var providedName = String(handle && handle.name || '');
			result.destinationName = _rapierDocumentNameIsAdmissible(providedName) ? providedName : '';
			result.destinationSelected = true;
			if (persistedKey) {
				var authority = String(options && options.documentAuthority || '').trim();
				if (authority) {
					await _queueWebBindingMutation(function () {
						return result.destinationName
							? _webRefreshCurrentFileNow(authority, {
									handle: handle,
									generation: result.fileGeneration,
								}, persistedKey, true)
							: _webDropCurrentFileNow(authority);
					});
				}
			}
			return result;
		}).catch(function (error) {
			if (error && (error.name === 'AbortError' || error.code === 20)) {
				return _saveResult('cancelled');
			}
			throw error;
		});
	}

	function _documentHandleKey(options) {
		var authority = options && String(options.documentAuthority || '').trim();
		return authority ? 'authority:' + authority : null;
	}

	function _webSaveAs(blob, filename, options) {
		if (_hasFsaSave) {
			return _webPickerSave(blob, filename, options, _documentHandleKey(options));
		}
		return _webDownload(blob, filename, options);
	}

	var NATIVE_TRANSFER_CHUNK_BYTES = 128 * 1024;

	async function _sendNativeTransfer(purpose, blob, filename, mime, options, requestId, fingerprint) {
		var args = {
			purpose: purpose,
			requestId: requestId,
			name: filename || 'document.md',
			mime: mime || (blob && blob.type) || 'application/octet-stream',
			documentAuthority: String(options.documentAuthority || ''),
			documentGeneration: Number(options.documentGeneration || 0),
			documentRevision: Number(options.documentRevision || 0),
			fileGeneration: options.fileGeneration == null ? null : options.fileGeneration,
			payloadLength: fingerprint.bytes,
			payloadDigest: fingerprint.digest,
		};
		var begun = false;
		try {
			var begin = await _nativeHostCall('transfer.begin', args, 15000);
			begun = true;
			var generation = begin && typeof begin.generation === 'string' ? begin.generation : '';
			if (!generation) throw new Error('native transfer named no generation');
			var chunkBytes = Math.max(16 * 1024, Math.min(
				NATIVE_TRANSFER_CHUNK_BYTES,
				Number(begin && begin.chunkBytes) || NATIVE_TRANSFER_CHUNK_BYTES
			));
			var sequence = 0;
			for (var offset = 0; offset < blob.size; offset += chunkBytes) {
				var part = new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer());
				await _nativeHostCall('transfer.chunk', {
					requestId: requestId,
					sequence: sequence,
					bytes: part,
				}, 30000, generation);
				sequence += 1;
			}
			return await _nativeHostCall('transfer.end', { requestId: requestId }, 120000);
		} catch (error) {
			if (begun) _nativeHostNotify('transfer.cancel', { requestId: requestId });
			throw error;
		}
	}

	window.addEventListener('rapier:platform-save-result', function (event) {
		var detail = event && event.detail;
		var requestId = detail && String(detail.requestId || '');
		if (!requestId) return;
		var pending = _nativeSaveRuntime.pending.get(requestId);
		if (!pending) return;
		_nativeSaveRuntime.pending.delete(requestId);
		if (pending.timeout) clearTimeout(pending.timeout);
		var matches =
			String(detail.documentAuthority || '') === pending.documentAuthority &&
			Number(detail.documentGeneration || 0) === pending.documentGeneration &&
			Number(detail.documentRevision || 0) === pending.documentRevision &&
			String(detail.payloadDigest || '') === pending.payloadDigest &&
			Number(detail.payloadLength || 0) === pending.payloadLength;
		if (!matches) {
			pending.reject(new Error('native save acknowledgement did not match the intended document'));
			return;
		}
		var status = String(detail.status || (detail.ok === true ? 'confirmed' : 'failed'));
		if (status === 'confirmed' && detail.ok === true && detail.verified === true) {
			if (String(detail.purpose || '') !== 'export') {
				if (detail.bindingPublished === true) {
					_setNativeCurrentFileBinding(pending.documentAuthority, detail.fileGeneration);
				} else {
					_clearPlatformFileBinding(pending.documentAuthority);
				}
			}
			pending.resolve(_saveResult('confirmed', {
				verified: true,
				bytes: pending.payloadLength,
				fingerprint: pending.payloadDigest,
				fileGeneration: detail.fileGeneration == null ? null : detail.fileGeneration,
				destinationName: String(detail.destinationName || ''),
				destinationSelected: detail.destinationSelected === true,
				bindingPublished: detail.bindingPublished === true,
			}));
			return;
		}
		if (status === 'cancelled') {
			pending.resolve(_saveResult('cancelled'));
			return;
		}
		pending.reject(new Error(String(detail.error || (
			status === 'written-unverified'
				? 'the provider accepted the write but Rapier could not verify it'
				: 'native save failed'
		))));
	});

	async function _nativeSaveRequest(purpose, blob, filename, options) {
		if (!hasNative) throw new Error('native save is unavailable');
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;
		var fingerprint = await _blobFingerprint(blob);
		if (fingerprint.algorithm !== 'sha256') {
			throw new Error('SHA-256 is unavailable for verified native saving');
		}
		var mime = (blob && blob.type) || 'application/octet-stream';
		var requestId = 'save-' + Date.now().toString(36) + '-' + (++_nativeSaveRuntime.sequence).toString(36);
		var resultPromise = new Promise(function (resolve, reject) {
			var timeout = setTimeout(function () {
				var pending = _nativeSaveRuntime.pending.get(requestId);
				if (!pending) return;
				_nativeSaveRuntime.pending.delete(requestId);
				_nativeHostNotify('transfer.cancel', { requestId: requestId });
				reject(new Error('native save did not complete'));
			}, 30 * 60 * 1000);
			_nativeSaveRuntime.pending.set(requestId, {
				resolve: resolve,
				reject: reject,
				timeout: timeout,
				documentAuthority: String(options.documentAuthority || ''),
				documentGeneration: Number(options.documentGeneration || 0),
				documentRevision: Number(options.documentRevision || 0),
				payloadDigest: fingerprint.digest,
				payloadLength: fingerprint.bytes,
			});
		});
		try {
			await _sendNativeTransfer(purpose, blob, filename, mime, options, requestId, fingerprint);
		} catch (error) {
			var pending = _nativeSaveRuntime.pending.get(requestId);
			if (pending) {
				_nativeSaveRuntime.pending.delete(requestId);
				clearTimeout(pending.timeout);
				pending.reject(error);
			}
		}
		return resultPromise;
	}

	function _nativeSaveAs(blob, filename, options) {
		return _nativeSaveRequest('saveAs', blob, filename || 'download', options);
	}

	function _nativeExportArtifact(blob, filename, options) {
		return _nativeSaveRequest('export', blob, filename || 'download', options || {});
	}

	function _nativePrintCurrentDocument(filename) {
		if (!hasNative) return Promise.resolve(false);
		return _nativeHostCall('document.print', { name: filename || 'document' })
			.then(function (result) { return !!(result && result.started); })
			.catch(function (error) {
				try { console.warn('[rapier-platform] native print failed', error); } catch (_) {}
				return false;
			});
	}

	function _nativeClipboardWrite(formats) {
		if (!hasNative || !_nativeCapability('clipboardWrite')) return Promise.resolve(false);
		var args = {
			text: String(formats && formats.text || ''),
			html: String(formats && formats.html || ''),
		};
		try {
			if (JSON.stringify(args).length > 196608) return Promise.resolve(false);
		} catch (_) { return Promise.resolve(false); }
		return _nativeHostCall('clipboard.write', args, 5000)
			.then(function (result) { return !!(result && result.copied); })
			.catch(function () { return false; });
	}

	async function _nativeShare(blob, filename, mime, options) {
		if (!hasNative) return false;
		var fingerprint = await _blobFingerprint(blob);
		if (fingerprint.algorithm !== 'sha256') throw new Error('SHA-256 is unavailable for native sharing');
		var requestId = 'share-' + Date.now().toString(36) + '-' + (++_nativeSaveRuntime.sequence).toString(36);
		var result = await _sendNativeTransfer(
			'share', blob, filename || 'document.md', mime || (blob && blob.type), options || {}, requestId, fingerprint
		);
		return !!(result && result.shared);
	}

	async function _webChooseDocument(purpose) {
		if (typeof window.showOpenFilePicker !== 'function') return null;
		try {
			const handles = await window.showOpenFilePicker({ multiple: false });
			const handle = handles && handles[0];
			if (!handle || typeof handle.getFile !== 'function') return null;
			const file = await handle.getFile();
			const read = purpose === 'open' ? null : await RapierTextCodec.readDocumentRecord(file);
			const content = read ? {text: read.text, bom: read.bom} : {blob: file};
			return {
				...content,
				name: file.name || (purpose === 'compare' ? 'compare.md' : 'opened.md'),
				webFileHandle: purpose === 'open' ? handle : null,
				fileGeneration: purpose === 'open' ? await _webFileGeneration(file) : null,
				transient: purpose !== 'open',
				admittedBytes: read ? read.bytes : file.size,
			};
		} catch (error) {
			if (error && (error.name === 'AbortError' || error.code === 20)) return null;
			throw error;
		}
	}

	async function _webDetachCurrentFileNow() {
		var authority = _webFileRuntime.activeAuthority;
		_webFileRuntime.activeAuthority = '';
		if (authority) {
			_clearPlatformFileBinding(authority);
			_webFileRuntime.liveHandles.delete(authority);
			_webFileRuntime.reportedGenerations.delete(authority);
		}
		return _idbClearHandles();
	}

	// The engine's state is one closure's (editor/engine.js), not a page global: the engine tells the platform which
	// document is current through its shell port, and that answer alone says whether a saved file still belongs to it.
	function _engineDocumentAuthority() {
		try {
			var port = window.Rapier;
			return port && port.document && typeof port.document.authority === 'function'
				? String(port.document.authority() || '') : '';
		} catch (_) { return ''; }
	}

	function _engineOwnsDocumentAuthority(authority) {
		var current = _engineDocumentAuthority();
		return !!current && current === String(authority || '');
	}

	async function _webRefreshCurrentFileNow(authority, value, persistedKey, requireEngineAuthority) {
		var id = String(authority || '').trim();
		var record = _webHandleRecord(value);
		if (!id || !record.handle) return { bound: false, persisted: false };
		if (requireEngineAuthority && !_engineOwnsDocumentAuthority(id)) {
			return { bound: false, persisted: false };
		}
		if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) return { bound: false, persisted: false };
		_webFileRuntime.activeAuthority = id;
		_webFileRuntime.liveHandles.set(id, record);
		_webFileRuntime.reportedGenerations.delete(id);
		_setPlatformFileBinding(id, record.generation, true);
		var key = persistedKey || ('authority:' + id);
		var stored = await _idbPut(key, record);
		if (requireEngineAuthority && !_engineOwnsDocumentAuthority(id)) {
			if (_webFileRuntime.activeAuthority === id) _webFileRuntime.activeAuthority = '';
			_webFileRuntime.liveHandles.delete(id);
			_webFileRuntime.reportedGenerations.delete(id);
			_clearPlatformFileBinding(id);
			await _idbDeleteHandle(key);
			return { bound: false, persisted: false };
		}
		return { bound: true, persisted: stored === true };
	}

	async function _webBindCurrentFileNow(authority, value, persistedKey) {
		var id = String(authority || '').trim();
		if (!id) return { bound: false, persisted: false };
		if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) await _webDetachCurrentFileNow();
		return _webRefreshCurrentFileNow(id, value, persistedKey);
	}

	async function _webDropCurrentFileNow(authority) {
		var id = String(authority || '').trim();
		if (!id) return false;
		if (_webFileRuntime.activeAuthority === id) return _webDetachCurrentFileNow();
		_clearPlatformFileBinding(id);
		_webFileRuntime.liveHandles.delete(id);
		_webFileRuntime.reportedGenerations.delete(id);
		return _idbDeleteHandle('authority:' + id);
	}

	function _webDetachCurrentFile() {
		var expectedAuthority = arguments.length ? String(arguments[0] || '').trim() : '';
		return _queueWebBindingMutation(function () {
			return expectedAuthority
				? _webDropCurrentFileNow(expectedAuthority)
				: _webDetachCurrentFileNow();
		});
	}

	function _webAcceptOpenedDocument(payload) {
		payload = payload || {};
		var handle = payload.webFileHandle;
		var authority = String(payload.documentAuthority || '').trim();
		if (!handle || !authority) return Promise.resolve({ bound: false, persisted: false });
		var record = { handle: handle, generation: payload.fileGeneration == null ? null : payload.fileGeneration };
		return _queueWebBindingMutation(function () {
			return _webBindCurrentFileNow(authority, record, 'authority:' + authority);
		});
	}

	async function _webSaveInPlace(blob, filename, options) {
		if (!_hasFsaSave) return _webDownload(blob, filename, options);
		var key = _documentHandleKey(options);
		 
		if (!key) return _webPickerSave(blob, filename, options, null);
		var authority = String(options && options.documentAuthority || '').trim();
		var record = _webHandleRecord(await _webRecordForAuthority(authority));
		if (!record.handle) return _webPickerSave(blob, filename, options, key);

		var writable = await _handleWritable(record.handle,
			!(options && options.requireExistingDestination === true));
		if (!writable) {
			await _queueWebBindingMutation(function () { return _webDropCurrentFileNow(authority); });
			return _webPickerSave(blob, filename, options, key);
		}

		var writeOptions = Object.assign({}, options || {});
		if (writeOptions.fileGeneration == null && record.generation != null) {
			writeOptions.fileGeneration = record.generation;
		}
		try {
			var result = await _writeToHandle(record.handle, blob, writeOptions);
			var nextRecord = { handle: record.handle, generation: result.fileGeneration };
			await _queueWebBindingMutation(function () {
				return _webRefreshCurrentFileNow(authority, nextRecord, key, true);
			});
			return result;
		} catch (error) {
			if (error && error.code === 'external_file_changed') throw error;
			await _queueWebBindingMutation(function () { return _webDropCurrentFileNow(authority); });
			throw error;
		}
	}

	 
	var RECENTS_CAP = 24;

	const _defaultProState = Object.freeze({
		available: false,
		unlocked: true,
		priceLabel: '',
		priceAvailable: false,
		billingStatus: 'not-applicable',
		purchasePending: false,
		message: '',
	});
	function _nativeProAuthority() {
		return !!(hasNative && String(_nativeHostRuntime.state.platformId || _nativePlatformId).toLowerCase() === 'android' &&
			_nativeCapability('pro'));
	}

	function _normalizeProState(raw) {
		if (!_nativeProAuthority()) return _defaultProState;
		var value = raw;
		if (typeof value === 'string') {
			try { value = JSON.parse(value); } catch (_) { value = null; }
		}
		if (!value || typeof value !== 'object') return _defaultProState;
		var explicitlyAvailable = value.available === true;
		var explicitLocked = explicitlyAvailable &&
			(value.unlocked === false || String(value.state || '').toLowerCase() === 'locked');
		var price = String(value.priceLabel || '');
		return {
			available: explicitlyAvailable,
			unlocked: !explicitLocked,
			priceLabel: price,
			priceAvailable: !!value.priceAvailable && !!price,
			billingStatus: String(value.billingStatus || 'unknown'),
			purchasePending: !!value.purchasePending,
			message: String(value.message || ''),
		};
	}

	function _currentProState() {
		return _nativeProAuthority() ? _normalizeProState(_nativeHostRuntime.state.pro) : _defaultProState;
	}

	function _emitPro(state) {
		try {
			window.dispatchEvent(new CustomEvent('rapier:pro-changed',
				{ detail: state || _defaultProState }));
		} catch (_) {}
	}

	function _applyNativeWindowInsets(value) {
		if (!value || typeof value !== 'object') return;
		function inset(raw) {
			var number = Number(raw);
			return Number.isFinite(number) ? Math.max(0, number) : 0;
		}
		var top = inset(value.top);
		var bottom = inset(value.bottom);
		var left = inset(value.left);
		var right = inset(value.right);
		var imeBottom = value.imeVisible === true ? inset(value.imeBottom) : 0;
		var windowHeight = inset(value.windowHeight);
		var rootStyle = document.documentElement.style;
		rootStyle.setProperty('--native-inset-top', top + 'px');
		rootStyle.setProperty('--native-inset-bottom', bottom + 'px');
		rootStyle.setProperty('--native-inset-left', left + 'px');
		rootStyle.setProperty('--native-inset-right', right + 'px');
		rootStyle.setProperty('--native-ime-bottom', imeBottom + 'px');
		rootStyle.setProperty('--native-window-height', windowHeight + 'px');
		try {
			window.dispatchEvent(new CustomEvent('rapier:native-insets', {
				detail: { imeVisible: imeBottom > 0, imeBottom: imeBottom, windowHeight: windowHeight }
			}));
		} catch (_) {}
	}

	// Android's plug-in pack: every loader hears one event, so the three plug-ins arrive, progress and leave together.
	function _applyNativeResources(value) {
		if (!value || typeof value !== 'object') return;
		_nativeHostRuntime.state.resources = value;
		try {
			window.dispatchEvent(new CustomEvent('rapier:platform-resources', {
				detail: { status: String(value.status || 'absent'), progress: Number(value.progress) || 0, error: value.error || null },
			}));
		} catch (_) {}
	}

	function _applyNativeHostState(value) {
		if (!value || typeof value !== 'object') return;
		if (value.platformId) _nativeHostRuntime.state.platformId = String(value.platformId).toLowerCase();
		if (value.capabilities && typeof value.capabilities === 'object') {
			_nativeHostRuntime.state.capabilities = Object.assign({}, value.capabilities);
		}
		_nativeHostRuntime.state.pro = _nativeProAuthority() && value.pro && typeof value.pro === 'object'
			? value.pro
			: null;
		_nativeHostRuntime.state.launcherIcon = value.launcherIcon && typeof value.launcherIcon === 'object'
			? Object.assign({}, value.launcherIcon)
			: { color: 'black' };
		_nativeHostRuntime.state.recents = Array.isArray(value.recents) ? value.recents : [];
		_nativeHostRuntime.state.pendingIntake = !!value.pendingIntake;
		_nativeHostRuntime.state.recoveryAutoResume = value.recoveryAutoResume === true;
		_nativeHostRuntime.state.notesStoreGeneration = typeof value.notesStoreGeneration === 'string' ? value.notesStoreGeneration : null;
		if (value.currentFileBound === true && value.currentFileAuthority) {
			_setNativeCurrentFileBinding(value.currentFileAuthority, value.currentFileGeneration);
		} else if (value.currentFileBound === false) {
			_clearPlatformFileBinding();
		}
		if (value.installation && typeof value.installation === 'object') _nativeHostRuntime.state.installation = value.installation;
		if (value.windowInsets) _applyNativeWindowInsets(value.windowInsets);
		if (value.resources) _applyNativeResources(value.resources);
		try { window.dispatchEvent(new CustomEvent('rapier:platform-state', { detail: value })); } catch (_) {}
	}

	_nativeHostRuntime.ready = hasNative
		? _nativeHostCall('platform.state', {}, 15000).then(function (state) {
				_applyNativeHostState(state);
				return state;
			}).catch(function (error) {
				_nativeHostRuntime.state.pro = null;
				try { console.warn('[rapier-platform] native platform state unavailable; continuing with portable defaults', error); } catch (_) {}
				return null;
			})
		: Promise.resolve(null);

	if (hasNative) {
		_nativeHostRuntime.ready.then(function () {
			if (_nativeCapability('nativeSpeech')) _installNativeSpeechSynthesis();
		}).catch(function () {});
	}

	function _callPro(operation, args) {
		if (!_nativeProAuthority()) return Promise.resolve(_defaultProState);
		return _nativeHostCall(operation, args || {}).then(function (value) {
			_nativeHostRuntime.state.pro = value;
			var state = _currentProState();
			_emitPro(state);
			return state;
		});
	}

	 
	const _srState = Object.seal({
		envelope: null,
		preferences: Object.create(null),
		preferenceVersion: null,
		current: null,
		currentVersion: null,
		currentHandle: null,
		currentGrant: null,
		currentGeneration: null,
		recovery: null,
		recoveryVersion: null,
		undo: null,
		undoVersion: null,
		undoChain: Promise.resolve(),
		recents: [],
		recentsVersion: null,
		writeChain: Promise.resolve(),
		recoveryChain: Promise.resolve(),
		initialDocument: null,
	});

	function _srValue(record) {
		return record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, 'value')
			? record.value : record;
	}
	function _srVersion(record) {
		if (!record || typeof record !== 'object') return null;
		var value = Number(record.version);
		return Number.isFinite(value) ? value : null;
	}
	function _srMissingOnly(error) {
		if (error && (error.code === 'not_found' || error.code === 'missing')) return null;
		throw error;
	}
	function _srUnavailableGrantOnly(error) {
		if (error && (error.code === 'not_found' || error.code === 'missing' ||
				error.code === 'grant_revoked' || error.code === 'invalid_state')) return null;
		throw error;
	}
	function _srCapability(id) {
		var caps = _srState.envelope && _srState.envelope.capabilities;
		return caps && caps[id] ? caps[id] : null;
	}
	function _srCapabilityReady(id) {
		var cap = _srCapability(id);
		return !!(cap && cap.available === true && cap.granted === true);
	}
	function _srRequireReadWrite(id) {
		var cap = _srCapability(id);
		if (!cap || cap.available !== true || cap.granted !== true || cap.access !== 'read-write') {
			throw new Error('Rapier requires read-write ' + id + ' in SpeedRacer mode.');
		}
	}
	function _srRequireActions(id, actions) {
		var cap = _srCapability(id);
		var admitted = cap && Array.isArray(cap.actions) ? cap.actions.map(String) : [];
		var missing = actions.filter(function (action) { return admitted.indexOf(action) < 0; });
		if (!cap || cap.available !== true || cap.granted !== true || missing.length) {
			throw new Error('Rapier requires SpeedRacer ' + id + ' actions: ' + missing.join(', ') + '.');
		}
	}
	function _srHasAction(id, action) {
		var cap = _srCapability(id);
		return !!(cap && cap.available === true && cap.granted === true
			&& Array.isArray(cap.actions) && cap.actions.map(String).indexOf(String(action)) >= 0);
	}
	function _srNamespace(name) {
		var value = speedracer && speedracer[name];
		return value && typeof value === 'object' ? value : null;
	}
	function _srRequiredNamespace(name, capability) {
		var value = _srNamespace(name);
		if (!value) throw new Error('SpeedRacer ' + capability + ' capability is unavailable.');
		return value;
	}
	function _srHandle(value) {
		if (!value) return null;
		if (typeof value === 'string') return value;
		if (typeof value !== 'object') return null;
		return value.handle || null;
	}
	function _srGrant(value) {
		if (!value || typeof value !== 'object') return null;
		return value.grant || null;
	}
	function _srGeneration(value) {
		if (!value || typeof value !== 'object') return null;
		var generation = value.generation;
		return generation == null || String(generation) === '' ? null : String(generation);
	}
	function _srName(value, fallback) {
		var provided = _srProvidedName(value);
		return provided.trim() ? provided : String(fallback || 'document.md');
	}
	function _srProvidedName(value) {
		return String(value && (value.name || value.filename || value.file_name) || '');
	}
	function _srContentType(value, fallback) {
		return String(value && (value.contentType || value.content_type || value.mediaType || value.media_type) || fallback || 'text/plain');
	}
	async function _srText(value) {
		var content = value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'content')
			? value.content : value;
		if (content instanceof Blob) return RapierTextCodec.readDocumentBlob(content);
		if (content instanceof ArrayBuffer) return RapierTextCodec.decodeDocumentUtf8(content);
		if (ArrayBuffer.isView(content)) return RapierTextCodec.decodeDocumentUtf8(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
		if (content == null) return '';
		return RapierTextCodec.normalizeDocument(String(content));
	}
	async function _srJson(value) {
		if (value == null) return null;
		if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
			var text = await _srText(value);
			return text ? JSON.parse(text) : null;
		}
		if (typeof value === 'string') return value ? JSON.parse(value) : null;
		if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'content')) {
			return _srJson(value.content);
		}
		return value;
	}
	const _SR_RECOVERY_MAGIC = new Uint8Array([82, 80, 82, 49]);  
	const _SR_RECOVERY_HEADER_MAX_BYTES = 64 * 1024;
	function _srRecoveryStateManifest(value) {
		var state = value && typeof value === 'object' ? value : {};
		var snapshot = state.snapshot && typeof state.snapshot === 'object' ? state.snapshot : {};
		return JSON.stringify([
			String(snapshot.filename || 'untitled.md'),
			String(snapshot.documentAuthority || ''),
			snapshot.virtualDocumentKind === 'welcome' ? 'welcome' : '',
			snapshot.saveAsRequired === true,
			String(snapshot.docKind || 'markdown'),
			Number(state.generation || 0),
			Number(state.documentRevision || 0),
			typeof state.savedGeneration === 'number' ? state.savedGeneration : null,
			Number(state.nextBlockId || 1),
			state.historyComplete === true,
			state.dirty === true,
			state.baseFileGeneration == null ? null : String(state.baseFileGeneration),
		]);
	}
	function _srRecoveryStateIntegrity(value) {
		return _rapierTextIntegrity(_srRecoveryStateManifest(value));
	}
	function _srRecoveryStateIntegrityMatches(value) {
		return !!value && _rapierIntegrityMatches(
			value.stateIntegrity,
			_srRecoveryStateIntegrity(value),
		);
	}
	function _srUndoIntegrityMatches(value) {
		if (!value || !value.integrity) return false;
		var bound = Object.assign({}, value);
		delete bound.integrity;
		return _rapierIntegrityMatches(value.integrity, _rapierTextIntegrity(JSON.stringify(bound)));
	}
	function _srRecoveryBlob(payload) {
		var snapshot = payload && payload.snapshot ? payload.snapshot : {};
		var metadata = Object.assign({}, payload || {}, {
			snapshot: {
				filename: String(snapshot.filename || 'untitled.md'),
				documentAuthority: String(snapshot.documentAuthority || ''),
				virtualDocumentKind: snapshot.virtualDocumentKind === 'welcome' ? 'welcome' : '',
				saveAsRequired: snapshot.saveAsRequired === true,
				docKind: String(snapshot.docKind || 'markdown'),
			},
		});
		var canonical = RapierTextCodec.normalizeDocument(String(snapshot.canonicalText || ''));
		metadata.integritySchema = 1;
		metadata.stateIntegrity = _srRecoveryStateIntegrity(metadata);
		metadata.contentIntegrity = _rapierTextIntegrity(canonical);
		var header = new TextEncoder().encode(JSON.stringify(metadata));
		if (header.byteLength > _SR_RECOVERY_HEADER_MAX_BYTES) {
			throw new Error('Rapier recovery metadata is too large.');
		}
		var prefix = new Uint8Array(8);
		prefix.set(_SR_RECOVERY_MAGIC, 0);
		new DataView(prefix.buffer).setUint32(4, header.byteLength, true);
		return new Blob([prefix, header, canonical], { type: 'application/vnd.rapier.recovery' });
	}
	async function _srRecoveryPayload(value) {
		if (value == null) return null;
		var content = value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'content')
			? value.content : value;
		if (!(content instanceof Blob || content instanceof ArrayBuffer || ArrayBuffer.isView(content))) {
			throw new Error('Invalid Rapier recovery payload.');
		}
		var maxEnvelopeBytes = 8 + _SR_RECOVERY_HEADER_MAX_BYTES + RapierTextCodec.maxDocumentBytes;
		if (content instanceof Blob && content.size > maxEnvelopeBytes) {
			throw new Error('Rapier recovery payload is too large.');
		}
		var bytes = content instanceof Blob
			? new Uint8Array(await content.arrayBuffer())
			: (content instanceof ArrayBuffer
				? new Uint8Array(content)
				: new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
		if (bytes.byteLength < 8 || bytes.byteLength > maxEnvelopeBytes ||
				!_SR_RECOVERY_MAGIC.every(function (byte, index) { return bytes[index] === byte; })) {
			throw new Error('Invalid Rapier recovery envelope.');
		}
		var headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
		if (headerLength > _SR_RECOVERY_HEADER_MAX_BYTES || headerLength > bytes.byteLength - 8) {
			throw new Error('Invalid Rapier recovery envelope.');
		}
		var metadataText = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + headerLength));
		var metadata = JSON.parse(metadataText);
		if (!metadata || typeof metadata !== 'object' || !metadata.snapshot || typeof metadata.snapshot !== 'object') {
			throw new Error('Invalid Rapier recovery metadata.');
		}
		var integritySchema = Number(metadata.integritySchema);
		if (integritySchema !== 1) {
			throw new Error('Unsupported Rapier recovery integrity schema.');
		}
		if (!_srRecoveryStateIntegrityMatches(metadata)) {
			throw new Error('Rapier recovery metadata failed integrity verification.');
		}
		var canonicalText = RapierTextCodec.decodeDocumentUtf8(bytes.subarray(8 + headerLength));
		if (!_rapierIntegrityMatches(
				metadata.contentIntegrity,
				_rapierTextIntegrity(canonicalText)
		)) {
			throw new Error('Rapier recovery content failed integrity verification.');
		}
		metadata.snapshot = Object.assign({}, metadata.snapshot, { canonicalText: canonicalText });
		var filename = String(metadata.snapshot.filename || 'untitled.md');
		var filenameAdmissible = _rapierDocumentNameIsAdmissible(filename);
		var countersAdmissible = Number.isSafeInteger(metadata.generation) && metadata.generation >= 0 &&
			(metadata.documentRevision == null ||
				(Number.isSafeInteger(metadata.documentRevision) && metadata.documentRevision >= 0)) &&
			(metadata.nextBlockId == null ||
				(Number.isSafeInteger(metadata.nextBlockId) && metadata.nextBlockId >= 1)) &&
			(metadata.savedGeneration == null ||
				(Number.isSafeInteger(metadata.savedGeneration) && metadata.savedGeneration >= -1));
		if (!filenameAdmissible || !countersAdmissible) {
			throw new Error('Rapier recovery metadata is inadmissible.');
		}
		metadata.integrityVerified = true;
		return metadata;
	}
	function _srSameDocument(recovery, filePayload) {
		return !!(recovery && recovery.snapshot && filePayload
			&& recovery.snapshot.saveAsRequired !== true
			&& String(recovery.snapshot.canonicalText || '') === String(filePayload.text || ''));
	}
	function _srRecoveryKind(recovery, filePayload) {
		if (!recovery || !recovery.snapshot) return filePayload ? 'file' : null;
		if (recovery.dirty !== true) return filePayload ? 'file' : 'recovery-transient';
		if (_srSameDocument(recovery, filePayload)) return filePayload ? 'file' : 'recovery-transient';
		var base = recovery.baseFileGeneration == null ? null : String(recovery.baseFileGeneration);
		var current = filePayload && filePayload.generation != null ? String(filePayload.generation) : null;
		if (!filePayload || !base) return 'recovery-transient';
		if (current != null && base === current) return 'recovery-bound';
		return 'recovery-conflict';
	}
	function _srEscapeHtml(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
			return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
		});
	}
	function _srFileTypes(includeImports) {
		var types = ['text/markdown', 'text/plain', 'text/*', 'application/json', 'application/xml'];
		if (includeImports) types.push('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip');
		return types;
	}
	function _srGrantKey(grant) {
		if (typeof grant === 'string') return grant;
		try { return JSON.stringify(grant); } catch (_) { return String(grant || ''); }
	}
	function _srRememberRecent(record) {
		if (!record || !record.grant) return;
		var nextKey = _srGrantKey(record.grant);
		var next = {
			grant: record.grant,
			name: String(record.name || 'document'),
			generation: record.generation == null || String(record.generation) === '' ? null : String(record.generation),
			ts: Date.now(),
		};
		_srState.recents = [next].concat((_srState.recents || []).filter(function (item) {
			return item && _srGrantKey(item.grant) !== nextKey;
		})).slice(0, 24);
		_srQueueStatePut('rapier/recents', _srState.recents, 'recentsVersion').catch(function (error) {
			try { console.warn('[rapier-platform] could not retain recent File metadata', error); } catch (_) {}
		});
		try { window.dispatchEvent(new CustomEvent('rapier:recent-files-changed')); } catch (_) {}
	}
	function _srQueueStatePut(key, value, versionField) {
		if (!hasSpeedracer) return Promise.resolve(null);
		_srState.writeChain = _srState.writeChain.catch(function () { return null; }).then(async function () {
			var state = _srRequiredNamespace('state', 'state/v1');
			var options = {};
			if (Number.isFinite(_srState[versionField])) options.expectedVersion = _srState[versionField];
			var result = await state.put(key, value, options);
			var version = _srVersion(result);
			if (version != null) _srState[versionField] = version;
			return result;
		});
		return _srState.writeChain;
	}
	function _srQueueStateDelete(key, versionField) {
		if (!hasSpeedracer) return Promise.resolve(null);
		_srState.writeChain = _srState.writeChain.catch(function () { return null; }).then(async function () {
			var state = _srRequiredNamespace('state', 'state/v1');
			var options = {};
			if (Number.isFinite(_srState[versionField])) options.expectedVersion = _srState[versionField];
			var result = await state.delete(key, options).catch(_srMissingOnly);
			_srState[versionField] = null;
			return result;
		});
		return _srState.writeChain;
	}
	function _srCurrentRecord(payload) {
		return {
			grant: payload.grant || null,
			name: String(payload.name || 'document.md'),
			contentType: String(payload.contentType || 'text/plain'),
			generation: payload.generation == null || String(payload.generation) === '' ? null : String(payload.generation),
			documentAuthority: String(payload.documentAuthority || '').trim(),
		};
	}
	function _srPersistCurrent(payload) {
		if (!payload || !payload.grant) return Promise.resolve(null);
		_srState.current = _srCurrentRecord(payload);
		_srState.currentGrant = payload.grant;
		_srState.currentHandle = payload.handle || _srState.currentHandle;
		_srState.currentGeneration = payload.generation;
		_srRememberRecent(_srState.current);
		return _srQueueStatePut('rapier/document', _srState.current, 'currentVersion');
	}
	function _srDetachCurrent(expectedAuthority) {
		var expected = String(expectedAuthority || '').trim();
		var currentAuthority = String(_srState.current && _srState.current.documentAuthority || '').trim();
		if (expected && expected !== currentAuthority) return Promise.resolve(false);
		_srState.current = null;
		_srState.currentHandle = null;
		_srState.currentGrant = null;
		_srState.currentGeneration = null;
		return _srQueueStateDelete('rapier/document', 'currentVersion');
	}
	async function _srReadFile(selection, fallbackName) {
		var files = _srRequiredNamespace('files', 'files/v1');
		var handle = _srHandle(selection);
		var name = _srName(selection, fallbackName);
		if (!_rapierDocumentNameIsAdmissible(name)) {
			throw new Error('SpeedRacer returned an invalid or overlong document name.');
		}
		var contentType = _srContentType(selection, 'text/plain');
		var normalizedContentType = String(contentType || '').toLowerCase().split(';')[0];
		var richDocumentMimes = [
			'application/pdf',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.ms-excel',
			'application/vnd.ms-excel.sheet.macroenabled.12',
			'application/vnd.ms-excel.sheet.binary.macroenabled.12',
			'application/vnd.oasis.opendocument.text',
			'application/vnd.oasis.opendocument.spreadsheet',
			'application/vnd.apple.numbers'
		];
		var richDocument = /\.(pdf|docx|xlsx|xlsm|xlsb|xls|et|odt|ods|numbers)$/i.test(name)
			|| richDocumentMimes.indexOf(normalizedContentType) >= 0;
		if (richDocument) {
			var conversion = _srNamespace('content');
			if (!_srCapabilityReady('content-conversion/v1') || !conversion || typeof conversion.convert !== 'function') {
				throw new Error('Readable document conversion is unavailable in this SpeedRacer host.');
			}
			if (!handle && !(selection && typeof selection === 'object' && selection.content != null)) {
				throw new Error('SpeedRacer did not return document bytes or a File handle.');
			}
			var converted = await conversion.convert(handle
				? { handle: handle, format: 'markdown', name: name, contentType: contentType }
				: { content: selection.content, format: 'markdown', name: name, contentType: contentType });
			var convertedText = await _srText(converted);
			if (new Blob([convertedText]).size > RapierTextCodec.maxDocumentBytes) throw new Error('Converted document text is too large for Rapier (max 25 MiB).');
			var convertedName = /\.[^.]+$/i.test(name) ? name.replace(/\.[^.]+$/i, '.md') : name + '.md';
			if (!_rapierDocumentNameIsAdmissible(convertedName)) {
				throw new Error('Converted document name is too long for Rapier.');
			}
			return {
				text: convertedText,
				name: convertedName,
				contentType: 'text/markdown',
				generation: null,
				handle: null,
				grant: null,
				path: null,
				transient: true,
			};
		}
		var read;
		if (handle) read = await files.read(handle);
		else if (selection && typeof selection === 'object' && selection.content != null) read = selection;
		else throw new Error('SpeedRacer did not return File bytes or a File handle.');
		var combined = Object.assign({}, selection && typeof selection === 'object' ? selection : {}, read && typeof read === 'object' ? read : {});
		var returnedName = _srName(combined, fallbackName);
		if (!_rapierDocumentNameIsAdmissible(returnedName)) {
			throw new Error('SpeedRacer returned an invalid or overlong document name.');
		}
		var returnedType = _srContentType(combined, contentType).toLowerCase().split(';')[0].trim();
		if (/\.(textpack|zip)$/i.test(returnedName) || returnedType === 'application/zip' || returnedType === 'application/x-zip-compressed') {
			var content = read && typeof read === 'object' && Object.prototype.hasOwnProperty.call(read, 'content') ? read.content : read;
			if (!(content instanceof Blob) && !(content instanceof ArrayBuffer) && !ArrayBuffer.isView(content)) {
				throw new Error('SpeedRacer did not return the original archive bytes.');
			}
			var archive = new Blob([content], {type: 'application/zip'});
			if (archive.size > RapierTextCodec.maxDocumentBytes) throw new Error('File is too large for Rapier (max 25 MiB).');
			return {blob: archive, name: returnedName, transient: true};
		}
		var text = await _srText(read);
		var payload = {
			text: text,
			name: returnedName,
			contentType: _srContentType(combined, 'text/plain'),
			generation: handle ? _srGeneration(combined) : null,
			handle: handle ? (_srHandle(combined) || handle) : null,
			grant: handle ? (_srGrant(combined) || _srGrant(selection)) : null,
			path: null,
			transient: !handle,
		};
		if (new Blob([text]).size > RapierTextCodec.maxDocumentBytes) throw new Error('File is too large for Rapier (max 25 MiB).');
		return payload;
	}
	async function _srChooseAndRead(options, fallbackName) {
		var files = _srRequiredNamespace('files', 'files/v1');
		var selection = await files.choose(options);
		if (!selection || selection.cancelled === true) return null;
		return _srReadFile(selection, fallbackName);
	}
	async function _srResumeCurrent(record) {
		if (!record || !record.grant) return null;
		var files = _srRequiredNamespace('files', 'files/v1');
		if (typeof files.resume !== 'function') return null;
		var resumed = await files.resume(record.grant);
		if (!resumed) {
			var unavailable = new Error('That SpeedRacer File is no longer available.');
			unavailable.code = 'grant_revoked';
			throw unavailable;
		}
		var hostName = _srProvidedName(resumed);
		var cachedName = String(record.name || '');
		var resumedName = hostName.trim() ? hostName : cachedName;
		if (!_rapierDocumentNameIsAdmissible(resumedName)) {
			var invalidState = new Error('SpeedRacer returned an invalid or overlong document name.');
			invalidState.code = 'invalid_state';
			throw invalidState;
		}
		var resumeSelection = Object.assign(
			{},
			resumed && typeof resumed === 'object' ? resumed : null,
			{ handle: _srHandle(resumed), grant: record.grant, name: resumedName },
		);
		var payload = await _srReadFile(resumeSelection, resumedName);
		payload.grant = payload.grant || record.grant;
		payload.documentAuthority = String(record.documentAuthority || '').trim();
		_srState.currentHandle = payload.handle;
		_srState.currentGrant = payload.grant;
		_srState.currentGeneration = payload.generation;
		return payload;
	}
	function _srInstallSpeechFacade() {
		if (!_srCapabilityReady('speech-output/v1')) return;
		var speech = _srNamespace('speech');
		if (!speech || typeof speech.speak !== 'function' || typeof window.SpeechSynthesisUtterance === 'function') return;
		var active = null;
		function HostUtterance(text) {
			this.text = String(text || ''); this.rate = 1;
			this.onstart = null; this.onboundary = null; this.onend = null; this.onerror = null;
		}
		var hostSpeechSynthesis = {
			speaking: false, paused: false, pending: false,
			getVoices: function () { return []; },
			cancel: function () { active = null; this.speaking = false; try { speech.cancel && speech.cancel(); } catch (_) {} },
			pause: function () { this.paused = true; try { speech.pause && speech.pause(); } catch (_) {} },
			resume: function () { this.paused = false; try { speech.resume && speech.resume(); } catch (_) {} },
			speak: function (utterance) {
				var self = this; active = utterance; self.speaking = true; self.paused = false;
				try { utterance.onstart && utterance.onstart({ type: 'start' }); } catch (_) {}
				Promise.resolve(speech.speak({ text: String(utterance.text || ''), rate: Number(utterance.rate || 1) })).then(function () {
					if (active !== utterance) return; active = null; self.speaking = false;
					try { utterance.onend && utterance.onend({ type: 'end' }); } catch (_) {}
				}, function (error) {
					if (active !== utterance) return; active = null; self.speaking = false;
					try { utterance.onerror && utterance.onerror({ type: 'error', error: error }); } catch (_) {}
				});
			},
		};
		_rapierProviders.speech = hostSpeechSynthesis;
		_rapierProviders.speechUtterance = HostUtterance;
	}
	async function _srInitialise() {
		_srState.envelope = await speedracer.ready;
		['state/v1', 'app-data/v1', 'files/v1'].forEach(function (id) {
			if (!_srCapabilityReady(id)) throw new Error('Rapier requires ' + id + ' in SpeedRacer mode.');
		});
		_srRequireReadWrite('state/v1');
		_srRequireReadWrite('app-data/v1');
		_srRequireActions('files/v1', ['choose', 'resume', 'read', 'save', 'create']);
		_srRequiredNamespace('state', 'state/v1');
		_srRequiredNamespace('appData', 'app-data/v1');
		_srRequiredNamespace('files', 'files/v1');

		var state = speedracer.state;
		var appData = speedracer.appData;
		var records = await Promise.all([
			state.get('rapier/preferences'),
			state.get('rapier/document'),
			state.get('rapier/recents'),
			appData.get('recovery/current').catch(_srMissingOnly),
			appData.get('undo/current').catch(_srMissingOnly),
		]);
		var preferences = _srValue(records[0]);
		_srState.preferences = preferences && typeof preferences === 'object' ? preferences : Object.create(null);
		_srState.preferenceVersion = _srVersion(records[0]);
		_srState.current = _srValue(records[1]);
		_srState.currentVersion = _srVersion(records[1]);
		var recents = _srValue(records[2]);
		_srState.recents = Array.isArray(recents) ? recents : [];
		_srState.recentsVersion = _srVersion(records[2]);
		_srState.recovery = await _srRecoveryPayload(_srValue(records[3]));
		_srState.recoveryVersion = _srVersion(records[3]);
		_srState.undo = await _srJson(_srValue(records[4]));
		_srState.undoVersion = _srVersion(records[4]);
		if (_srState.recovery && _srState.recovery.integrityVerified === true && _srState.undo
				&& _srUndoIntegrityMatches(_srState.undo)
				&& Number(_srState.recovery.schemaVersion) === 4
				&& Number(_srState.undo.schemaVersion) === 4
				&& String(_srState.undo.checkpointId || '') === String(_srState.recovery.checkpointId || '')
				&& String(_srState.undo.sourceRootId || '') === String(_srState.recovery.sourceRootId || '')
				&& Number(_srState.undo.generation) === Number(_srState.recovery.generation)
				&& Number(_srState.undo.documentRevision) === Number(_srState.recovery.documentRevision)
				&& _srState.recovery.historyComplete === true
				&& _srState.undo.historyComplete === true
				&& String(_srState.undo.documentAuthority || '') === String(_srState.recovery.snapshot && _srState.recovery.snapshot.documentAuthority || '')
				&& String(_srState.undo.virtualDocumentKind || '') === String(_srState.recovery.snapshot && _srState.recovery.snapshot.virtualDocumentKind || '')
				&& (_srState.undo.saveAsRequired === true) === (_srState.recovery.snapshot && _srState.recovery.snapshot.saveAsRequired === true)
				&& String(_srState.undo.filename || '') === String(_srState.recovery.snapshot && _srState.recovery.snapshot.filename || '')) {
			_srState.recovery = Object.assign({}, _srState.recovery, {
				undo: _srState.undo,
			});
		}

		var filePayload = null;
		if (_srState.current && _srState.current.grant) {
			try {
				filePayload = await _srResumeCurrent(_srState.current);
			} catch (error) {
				_srUnavailableGrantOnly(error);
				await _srDetachCurrent().catch(function () { return null; });
			}
		} else if (_srState.current) {
			await _srDetachCurrent().catch(function () { return null; });
		}
		var recoveryKind = _srRecoveryKind(_srState.recovery, filePayload);
		if (recoveryKind === 'recovery-transient' || recoveryKind === 'recovery-conflict') {
			await _srDetachCurrent().catch(function () { return null; });
			if (_srState.recovery && _srState.recovery.snapshot) {
				_srState.recovery.snapshot.saveAsRequired = true;
				_srState.recovery.savedGeneration = null;
				_srState.recovery.baseFileGeneration = null;
			}
		}
		_srState.initialDocument = recoveryKind && recoveryKind.indexOf('recovery-') === 0
			? { kind: recoveryKind, recovery: _srState.recovery, file: filePayload }
			: (filePayload ? { kind: 'document', file: filePayload } : null);
		_srInstallSpeechFacade();
		return _srState.envelope;
	}
	const _srReady = hasSpeedracer ? _srInitialise() : Promise.resolve(null);

	async function _srSaveAs(blob, filename, options) {
		await _srReady;
		if (options && options.beforeWrite) await options.beforeWrite;
		var files = _srRequiredNamespace('files', 'files/v1');
		if (typeof files.create !== 'function') throw new Error('SpeedRacer Save to Files is unavailable.');
		var created = await files.create({ suggestedName: filename || 'document.md', contentType: blob.type || 'text/plain', content: blob, settlesDirty: true });
		if (!created || created.cancelled === true) return false;
		var providedName = _srProvidedName(created);
		var destinationName = _rapierDocumentNameIsAdmissible(providedName) ? providedName : '';
		var payload = {
			handle: _srHandle(created), grant: _srGrant(created), generation: _srGeneration(created),
			name: destinationName || String(filename || 'document.md'),
			contentType: _srContentType(created, blob.type),
			documentAuthority: String(options && options.documentAuthority || '').trim(),
		};
		var engineOwnsSave = _engineOwnsDocumentAuthority(payload.documentAuthority);
		var currentAuthority = String(_srState.current && _srState.current.documentAuthority || '').trim();
		if (destinationName && engineOwnsSave &&
				(!currentAuthority || currentAuthority === payload.documentAuthority)) {
			try { await _srPersistCurrent(payload); }
			catch (error) { try { console.warn('[rapier-platform] File saved but its resume pointer was not retained', error); } catch (_) {} }
		} else if (!destinationName && engineOwnsSave && currentAuthority === payload.documentAuthority) {
			await _srDetachCurrent(payload.documentAuthority).catch(function () { return null; });
		}
		return _saveResult('confirmed', {
			verified: true,
			fileGeneration: payload.generation,
			destinationName: destinationName,
		});
	}

	function _createSpeedracerPlatform() {
		return {
			id: 'speedracer',
			canSaveInPlace: true,
			showsRecentFilesUi: true,
			ownsPreferenceStore: true,
			ownsRecoveryStore: true,
			ownsRecoveryWriterBoundary: true,
			allowsEmbed: false,
			allowsBrowserIntake: false,
			allowsServiceWorker: false,
			allowsWebShareFallback: false,
			allowsBrowserDownloadFallback: false,
			allowsBrowserPrintFallback: false,
			defersBrowserPrintCleanup: false,
			get showsUploadUi() { return _srHasAction('files/v1', 'import-local'); },
			get canShare() { var cap = _srCapability('share/v1'); return _srCapabilityReady('share/v1') && Number(cap && cap.limits && cap.limits.files) > 0; },
			proSupported: false,
			ready: function () { return _srReady; },
			resourceInstallMessage: function (resource, phase) {
				if (resource === 'math' && phase === 'prompt') {
					return 'This document contains math. SpeedRacer can retrieve the exact verified MathJax renderer once and retain it as a shared Declared Resource for offline reuse.';
				}
				return '';
			},
			preference: function (key, fallback) {
				return Object.prototype.hasOwnProperty.call(_srState.preferences, key) ? _srState.preferences[key] : fallback;
			},
			setPreference: function (key, value) {
				_srState.preferences[key] = value;
				return _srQueueStatePut('rapier/preferences', Object.assign({}, _srState.preferences), 'preferenceVersion');
			},
			getProState: function () { return _defaultProState; },
			purchasePro: function () { return Promise.resolve(_defaultProState); },
			restorePro: function () { return Promise.resolve(_defaultProState); },
			refreshPro: function () { return Promise.resolve(_defaultProState); },
			prepareFileChooser: function () {},
			takeBootDocument: async function () {
				await _srReady;
				var value = _srState.initialDocument;
				_srState.initialDocument = null;
				return value;
			},
			registerOperations: async function (operations) {
				await _srReady;
				if (!speedracer || typeof speedracer.register !== 'function') throw new Error('Host operation registration is unavailable.');
				return speedracer.register(operations);
			},
			normalizeOperationActor: function (actor) {
				actor = actor && typeof actor === 'object' ? actor : {};
				var hostKind = String(actor.kind || '');
				var kind = hostKind === 'speedracer-lead' ? 'agent' : hostKind === 'cowboy' ? 'human' : '';
				return { kind: kind, id: String(actor.id || '') };
			},
			currentFileGeneration: function (documentAuthority) {
				var expected = String(documentAuthority || '').trim();
				var current = String(_srState.current && _srState.current.documentAuthority || '').trim();
				return expected && expected === current ? _srState.currentGeneration : null;
			},
			currentFileAuthority: function () {
				return String(_srState.current && _srState.current.documentAuthority || '').trim();
			},
			openDocument: async function () {
				await _srReady;
				return _srChooseAndRead({ purpose: 'open', access: 'read-write', types: _srFileTypes(true), multiple: false }, 'opened.md');
			},
			acceptOpenedDocument: function (payload) {
				var settled = payload && payload.grant
					? _srPersistCurrent(payload)
					: Promise.resolve({ bound: false });
				return Promise.resolve(settled).catch(function (error) {
					try { console.warn('[rapier-platform] document opened but its resume pointer was not retained', error); } catch (_) {}
					return null;
				});
			},
			detachCurrentFile: function (documentAuthority) { return _srDetachCurrent(documentAuthority); },
			hasWritableHandle: function (documentAuthority) {
				var expected = String(documentAuthority || '').trim();
				var current = String(_srState.current && _srState.current.documentAuthority || '').trim();
				return !!_srState.currentHandle && !!expected && expected === current;
			},
			uploadDocument: async function () {
				await _srReady;
				var files = _srRequiredNamespace('files', 'files/v1');
				if (typeof files.importLocal !== 'function') throw new Error('SpeedRacer device import is unavailable.');
				var imported = await files.importLocal({ types: _srFileTypes(true), multiple: false });
				if (!imported || imported.cancelled === true) return null;
				var payload = await _srReadFile(imported, _srName(imported, 'uploaded.md'));
				payload.handle = null; payload.grant = null; payload.generation = null; payload.transient = true;
				return payload;
			},
			chooseCompareDocument: async function () {
				await _srReady;
				return _srChooseAndRead({ purpose: 'compare', access: 'read', types: _srFileTypes(false), multiple: false }, 'comparison.md');
			},
			saveAs: _srSaveAs,
			saveInPlace: async function (blob, filename, options) {
				await _srReady;
				if (options && options.beforeWrite) await options.beforeWrite;
				var expectedAuthority = String(options && options.documentAuthority || '').trim();
				var currentAuthority = String(_srState.current && _srState.current.documentAuthority || '').trim();
				if (!_srState.currentHandle || !expectedAuthority || expectedAuthority !== currentAuthority) {
					if (options && options.requireExistingDestination === true) {
						throw _requiresDestinationError();
					}
					return _srSaveAs(blob, filename, options);
				}
				var saveHandle = _srState.currentHandle;
				var saveGrant = _srState.currentGrant;
				var saveGeneration = _srState.currentGeneration;
				var saveName = String(_srState.current && _srState.current.name || '');
				var files = _srRequiredNamespace('files', 'files/v1');
				var saveOptions = { contentType: blob.type || 'text/plain', settlesDirty: true };
				if (saveGeneration != null) saveOptions.expectedGeneration = saveGeneration;
				var result = await files.save(saveHandle, blob, saveOptions);
				if (result && result.cancelled === true) return false;
				var generation = _srGeneration(result);
				var providedName = _srProvidedName(result);
				var destinationName = providedName
					? (_rapierDocumentNameIsAdmissible(providedName) ? providedName : '')
					: (_rapierDocumentNameIsAdmissible(saveName) ? saveName : '');
				var engineStillOwnsSave = _engineOwnsDocumentAuthority(expectedAuthority);
				var stillBound = engineStillOwnsSave &&
					String(_srState.current && _srState.current.documentAuthority || '').trim() === expectedAuthority &&
					_srState.currentHandle === saveHandle;
				if (!stillBound) {
					return _saveResult('confirmed', {
						verified: true,
						fileGeneration: generation,
						destinationName: destinationName,
					});
				}
				if (generation != null) _srState.currentGeneration = generation;
				if (!destinationName) {
					await _srDetachCurrent(expectedAuthority).catch(function () { return null; });
				} else {
					try {
						await _srPersistCurrent({
							handle: saveHandle, grant: saveGrant,
							generation: _srState.currentGeneration, name: destinationName,
							contentType: blob.type || (_srState.current && _srState.current.contentType),
							documentAuthority: expectedAuthority,
						});
					} catch (error) {
						try { console.warn('[rapier-platform] File saved but its resume pointer was not retained', error); } catch (_) {}
					}
				}
				return _saveResult('confirmed', {
					verified: true,
					fileGeneration: _srState.currentGeneration,
					destinationName: destinationName,
				});
			},
			exportArtifact: async function (blob, filename, options) {
				await _srReady;
				var files = _srRequiredNamespace('files', 'files/v1');
				var name = filename || 'download';
				var contentType = blob.type || 'application/octet-stream';
				if (_srHasAction('files/v1', 'export-local') && typeof files.exportLocal === 'function') {
					var exported = await files.exportLocal({ name: name, contentType: contentType, content: blob });
					return !(exported && exported.cancelled === true);
				}
				if (typeof files.create !== 'function') throw new Error('SpeedRacer export destination is unavailable.');
				var created = await files.create({ suggestedName: name, contentType: contentType, content: blob, settlesDirty: false });
				return !(created && created.cancelled === true);
			},
			persistRecovery: function (payload) {
				_srState.recovery = payload;
				_srState.recoveryChain = _srState.recoveryChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					var appData = _srRequiredNamespace('appData', 'app-data/v1');
					var options = { contentType: 'application/vnd.rapier.recovery' };
					if (Number.isFinite(_srState.recoveryVersion)) options.expectedVersion = _srState.recoveryVersion;
					var blob = _srRecoveryBlob(payload);
					var result = await appData.put('recovery/current', blob, options);
					var version = _srVersion(result);
					if (version != null) _srState.recoveryVersion = version;
					return result;
				});
				return _srState.recoveryChain;
			},
			persistUndo: function (payload) {
				_srState.undo = payload;
				_srState.undoChain = _srState.undoChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					var appData = _srRequiredNamespace('appData', 'app-data/v1');
					var options = { contentType: 'application/json' };
					if (Number.isFinite(_srState.undoVersion)) options.expectedVersion = _srState.undoVersion;
					var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
					var result = await appData.put('undo/current', blob, options);
					var version = _srVersion(result);
					if (version != null) _srState.undoVersion = version;
					return result;
				});
				return _srState.undoChain;
			},
			clearRecovery: function () {
				_srState.recoveryChain = _srState.recoveryChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					var appData = _srRequiredNamespace('appData', 'app-data/v1');
					var options = {};
					if (Number.isFinite(_srState.recoveryVersion)) options.expectedVersion = _srState.recoveryVersion;
					var result = await appData.delete('recovery/current', options).catch(_srMissingOnly);
					_srState.recoveryVersion = null;
					return result;
				});
				_srState.undoChain = _srState.undoChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					var appData = _srRequiredNamespace('appData', 'app-data/v1');
					var options = {};
					if (Number.isFinite(_srState.undoVersion)) options.expectedVersion = _srState.undoVersion;
					var result = await appData.delete('undo/current', options).catch(_srMissingOnly);
					_srState.undoVersion = null;
					return result;
				});
				return Promise.all([_srState.recoveryChain, _srState.undoChain]).then(function (results) {
					_srState.recovery = null;
					_srState.undo = null;
					return results;
				});
			},
			resourceStatus: async function (id) {
				await _srReady;
				var resources = _srNamespace('resources');
				if (!_srCapabilityReady('resources/v1') || !resources || typeof resources.status !== 'function') return { status: 'unavailable' };
				return resources.status(id);
			},
			resourceRead: async function (id) {
				await _srReady;
				var resources = _srNamespace('resources');
				if (!_srCapabilityReady('resources/v1') || !resources || typeof resources.read !== 'function') return null;
				return resources.read(id);
			},
			resourceEnsure: async function (id) {
				await _srReady;
				var resources = _srNamespace('resources');
				if (!_srCapabilityReady('resources/v1') || !resources || typeof resources.ensure !== 'function') throw new Error('Verified resources are unavailable.');
				await resources.ensure(id);
				return resources.read(id);
			},
			clipboardWrite: async function (formats) {
				await _srReady;
				var clipboard = _srNamespace('clipboard');
				if (!_srCapabilityReady('clipboard-write/v1') || !clipboard || typeof clipboard.write !== 'function') return false;
				var result = await clipboard.write(formats || {});
				return !(result && result.cancelled === true);
			},
			externalOpen: async function (url) {
				await _srReady;
				var external = _srNamespace('external');
				if (!_srCapabilityReady('external-open/v1') || !external || typeof external.open !== 'function') return false;
				var result = await external.open({ url: String(url || '') });
				return !(result && result.cancelled === true);
			},
			printArtifact: async function (artifact) {
				await _srReady;
				var print = _srNamespace('print');
				if (!_srCapabilityReady('print/v1') || !print || typeof print.open !== 'function') return false;
				var filename = String(artifact.filename || 'document.pdf');
				var html = String(artifact.html || '');
				if (!html) {
					var docClass = String(artifact.docClass || 'rapier-page md-render').replace(/[^a-z0-9 _-]/gi, '');
					html = '<!doctype html><html><head><meta charset="utf-8"><title>' + _srEscapeHtml(filename) + '</title></head><body><main class="' + docClass + '">' + String(artifact.bodyHtml || '') + '</main></body></html>';
				}
				var result = await print.open({ name: filename, contentType: 'text/html', content: new Blob([html], { type: 'text/html' }) });
				return !(result && result.cancelled === true);
			},
			printCurrentDocument: null,
			share: async function (blob, filename, mime, options) {
				await _srReady;
				var share = _srNamespace('share');
				if (!_srCapabilityReady('share/v1') || !share || typeof share.open !== 'function') return false;
				var result = await share.open({ title: filename || 'document', name: filename || 'document', contentType: mime || (blob && blob.type) || 'application/octet-stream', content: blob });
				return !(result && result.cancelled === true);
			},
			hasPendingBootDocument: function () { return !!_srState.initialDocument; },
			finishBoot: function () {},
			clearDocumentIntake: function () {},
			getRecentFiles: function () {
				return (_srState.recents || []).slice(0, 5).map(function (item, index) {
					return Object.assign({}, item, { key: _srGrantKey(item && item.grant) || String(index) });
				});
			},
			noteRecent: function (name) {
				if (_srState.currentGrant) _srRememberRecent({ grant: _srState.currentGrant, name: name, generation: _srState.currentGeneration });
			},
			openRecent: async function (entry) {
				await _srReady;
				var payload = await _srResumeCurrent(entry);
				if (!payload) throw new Error('That SpeedRacer File is no longer available.');
				try { window.dispatchEvent(new CustomEvent('rapier:platform-open', { detail: payload })); } catch (_) {}
				return true;
			},
			publishDirty: function (value) { try { speedracer.ui && speedracer.ui.setDirty(!!value); } catch (_) {} },
			publishTitle: function (value) { try { speedracer.ui && speedracer.ui.setTitle(String(value || 'Rapier')); } catch (_) {} },
			publishSelection: function (value) { try { speedracer.context && speedracer.context.setSelection(value || null); } catch (_) {} },
			publishTheme: function () {},
		};
	}

	async function _nativeRequestIntake(operation, args, purpose) {
		if (!hasNative) return null;
		_nativeIntakeRuntime.last = null;
		_nativeIntakeRuntime.failure = null;
		try { _rapierBootstrapRuntime.pendingIntake = null; } catch (_) {}
		var watching = purpose === 'read-current';
		if (watching) _nativeIntakeRuntime.expecting = true;
		try {
			var result = await _nativeHostCall(operation, Object.assign({ purpose: purpose }, args || {}), 120000);
			if (!result || result.cancelled === true) return null;
			if (watching && result.started === false) return null;
			return await _waitForNativeIntake();
		} finally {
			if (watching) _nativeIntakeRuntime.expecting = false;
		}
	}

	function _createPlatformPort(raw) {
		function method(name) {
			return typeof raw[name] === 'function' ? raw[name] : null;
		}
		var environment = Object.freeze({
			get id() { return String(raw.id || 'unknown'); },
			ready: function () { return method('ready') ? raw.ready() : Promise.resolve(); },
			get allowsEmbed() { return raw.allowsEmbed === true; },
			get allowsBrowserIntake() { return raw.allowsBrowserIntake === true; },
			get allowsServiceWorker() { return raw.allowsServiceWorker === true; },
			get allowsWebShareFallback() { return raw.allowsWebShareFallback === true; },
			get allowsBrowserDownloadFallback() { return raw.allowsBrowserDownloadFallback === true; },
			get allowsBrowserPrintFallback() { return raw.allowsBrowserPrintFallback === true; },
			get recoveryAutoResume() { return raw.recoveryAutoResume === true; },
		});
		var preferences = Object.freeze({
			get ownsStore() { return raw.ownsPreferenceStore === true; },
			get read() { return method('preference'); },
			get write() { return method('setPreference'); },
		});
		var pro = Object.freeze({
			get supported() { return raw.proSupported === true; },
			get state() { return method('getProState'); },
			get purchase() { return method('purchasePro'); },
			get restore() { return method('restorePro'); },
			get refresh() { return method('refreshPro'); },
			// null everywhere but the Android host.
			get review() { return method('reviewPro'); },
		});
		var files = Object.freeze({
			get canSaveInPlace() { return raw.canSaveInPlace === true; },
			get showsRecentFilesUi() { return raw.showsRecentFilesUi === true; },
			get showsUploadUi() { return raw.showsUploadUi === true; },
			get prepareChooser() { return method('prepareFileChooser'); },
			get open() { return method('openDocument'); },
			get upload() { return method('uploadDocument'); },
			get chooseCompare() { return method('chooseCompareDocument'); },
			get readCurrent() { return method('readCurrentDocument'); },
			get checkExternalChange() { return method('checkExternalFileChange'); },
			get acceptOpened() { return method('acceptOpenedDocument'); },
			get detach() { return method('detachCurrentFile'); },
			get hasWritable() { return method('hasWritableHandle'); },
			get currentAuthority() { return method('currentFileAuthority'); },
			get generation() { return method('currentFileGeneration'); },
			get observeGeneration() { return method('observeFileGeneration'); },
			get saveAs() { return method('saveAs'); },
			get saveInPlace() { return method('saveInPlace'); },
			get exportArtifact() { return method('exportArtifact'); },
			get takeBoot() { return method('takeBootDocument'); },
			get hasPendingBoot() { return method('hasPendingBootDocument'); },
			get finishBoot() { return method('finishBoot'); },
			get clearIntake() { return method('clearDocumentIntake'); },
			get recents() { return method('getRecentFiles'); },
			get noteRecent() { return method('noteRecent'); },
			get openRecent() { return method('openRecent'); },
		});
		var recovery = Object.freeze({
			get ownsStore() { return raw.ownsRecoveryStore === true; },
			get ownsWriterBoundary() { return raw.ownsRecoveryWriterBoundary === true; },
			get persist() { return method('persistRecovery'); },
			get persistUndo() { return method('persistUndo'); },
			get clear() { return method('clearRecovery'); },
		});
		var resources = Object.freeze({
			get installMessage() { return method('resourceInstallMessage'); },
			get status() { return method('resourceStatus'); },
			get read() { return method('resourceRead'); },
			get ensure() { return method('resourceEnsure'); },
			// Android removes its one Play pack; null where the host keeps what it holds.
			get remove() { return method('resourceRemove'); },
		});
		var host = Object.freeze({
			get canShare() { return raw.canShare === true; },
			get defersBrowserPrintCleanup() { return raw.defersBrowserPrintCleanup === true; },
			get clipboardWrite() { return method('clipboardWrite'); },
			get externalOpen() { return method('externalOpen'); },
			get share() { return method('share'); },
			get printArtifact() { return method('printArtifact'); },
			get printCurrentDocument() { return method('printCurrentDocument'); },
			get requestClose() { return method('requestClose'); },
			get notesStore() { return method('notesStore'); },
			get openAttachment() { return method('openAttachment'); },
			get unlockNotes() { return method('unlockNotes'); },
			get captureReady() { return method('captureReady'); },
			get requestNotesRole() { return method('requestNotesRole'); },
			// The Rapier Sync companion door. null everywhere but the Android host, which is the
			// only place Rapier has no network of its own and hands the transport to a second app
			// (docs/sync-roadmap.md). It takes no argument: the page cannot name what to open.
			get openSync() { return method('openSync'); },
			get scheduleReminder() { return method('scheduleReminder'); },
			get reminderState() { return method('reminderState'); },
			get requestReminderPermission() { return method('requestReminderPermission'); },
			get openReminderSettings() { return method('openReminderSettings'); },
			get openMicrophoneSettings() { return method('openMicrophoneSettings'); },
			get approveClose() { return method('approveClose'); },
			get publishDirty() { return method('publishDirty'); },
			get publishTitle() { return method('publishTitle'); },
			get publishSelection() { return method('publishSelection'); },
			get publishTheme() { return method('publishTheme'); },
		});
		var installation = Object.freeze({
			get supported() { return raw.installationSupported === true; },
			get state() { return method('installationState'); },
			get install() { return method('install'); },
			get uninstall() { return method('uninstall'); },
			get openDefaultApps() { return method('openDefaultApps'); },
			get launcherIcon() { return method('launcherIconState'); },
			get setLauncherIcon() { return method('setLauncherIcon'); },
		});
		var operations = Object.freeze({
			get register() { return method('registerOperations'); },
			get normalizeActor() { return method('normalizeOperationActor'); },
		});
		return Object.freeze({ environment: environment, preferences: preferences, pro: pro, files: files,
			recovery: recovery, resources: resources, host: host, installation: installation, operations: operations });
	}

	function _createWebPlatform() {
		return {
			id: 'web',
			ownsPreferenceStore: false,
			ownsRecoveryStore: false,
			ownsRecoveryWriterBoundary: false,
			allowsEmbed: true,
			allowsBrowserIntake: true,
			allowsServiceWorker: true,
			allowsWebShareFallback: true,
			allowsBrowserDownloadFallback: true,
			allowsBrowserPrintFallback: true,
			get defersBrowserPrintCleanup() { return /Android/i.test(navigator.userAgent || ''); },
			get canSaveInPlace() { return _hasFsaSave; },
			showsRecentFilesUi: false,
			showsUploadUi: false,
			canShare: false,
			proSupported: false,
			get openDocument() {
				return typeof window.showOpenFilePicker === 'function' ? function () { return _webChooseDocument('open'); } : null;
			},
			get chooseCompareDocument() {
				return typeof window.showOpenFilePicker === 'function' ? function () { return _webChooseDocument('compare'); } : null;
			},
			get readCurrentDocument() {
				return _hasFsaSave ? function (documentAuthority) { return _webReadCurrentDocument(documentAuthority); } : null;
			},
			checkExternalFileChange: function (documentAuthority) {
				return _hasFsaSave ? _webCheckExternalFileChange(documentAuthority) : Promise.resolve(false);
			},
			get acceptOpenedDocument() { return _hasFsaSave ? _webAcceptOpenedDocument : null; },
			get detachCurrentFile() { return _hasFsaSave ? _webDetachCurrentFile : null; },
			hasWritableHandle: function (documentAuthority) {
				return _hasFsaSave && _platformHasWritableBinding(documentAuthority);
			},
			currentFileAuthority: function () {
				return _hasFsaSave ? _platformCurrentFileAuthority() : '';
			},
			currentFileGeneration: function (documentAuthority) {
				return _hasFsaSave ? _platformFileGeneration(documentAuthority) : null;
			},
			observeFileGeneration: _webFileGeneration,
			saveAs: _webSaveAs,
			saveInPlace: _webSaveInPlace,
		};
	}

	// Native plug-ins: Android serves its Play pack and Windows its executable resources from
	// the same local route. The loader holds either host's bytes to the same pins.
	function _nativeResourceRead(id) {
		return fetch('/plugins/' + encodeURIComponent(String(id || '')), { cache: 'no-store', credentials: 'omit' }).then(function (response) {
			return response.ok ? response.blob().then(function (blob) { return { content: blob }; }) : null;
		});
	}

	var _nativeReportedGenerations = new Map();

	function _createNativePlatform() {
		return {
			get id() { return _nativeHostRuntime.state.platformId; },
			get recoveryAutoResume() { return _nativeHostRuntime.state.recoveryAutoResume === true; },
			ready: function () { return _nativeHostRuntime.ready; },
			ownsPreferenceStore: false,
			ownsRecoveryStore: false,
			get ownsRecoveryWriterBoundary() { return _nativeCapability('ownsRecoveryWriterBoundary'); },
			allowsEmbed: false,
			allowsBrowserIntake: false,
			allowsServiceWorker: false,
			allowsWebShareFallback: false,
			allowsBrowserDownloadFallback: false,
			allowsBrowserPrintFallback: false,
			defersBrowserPrintCleanup: false,
			get canSaveInPlace() { return _nativeCapability('saveInPlace'); },
			get showsRecentFilesUi() { return _nativeCapability('recents'); },
			showsUploadUi: false,
			get canShare() { return _nativeCapability('share'); },
			get proSupported() { return _nativeProAuthority(); },
			getProState: _currentProState,
			purchasePro: function () {
				return _nativeProAuthority() ? _callPro('pro.purchase') : Promise.resolve(_defaultProState);
			},
			restorePro: function () {
				return _nativeProAuthority() ? _callPro('pro.restore') : Promise.resolve(_defaultProState);
			},
			refreshPro: function () {
				return _nativeProAuthority() ? _callPro('pro.refresh') : Promise.resolve(_defaultProState);
			},
			reviewPro: function (code) {
				return _nativeProAuthority()
					? _callPro('pro.review', { code: String(code == null ? '' : code) })
					: Promise.resolve(_defaultProState);
			},
			get prepareFileChooser() {
				return _nativeCapability('chooserPurpose') ? function (purpose) {
					return _nativeHostCall('file.prepareChooser', { purpose: String(purpose || 'open') });
				} : null;
			},
			get openDocument() {
				return _nativeCapability('documentPicker') ? function () { return _nativeRequestIntake('file.open', {}, 'open'); } : null;
			},
			get chooseCompareDocument() {
				return _nativeCapability('documentPicker') ? function () { return _nativeRequestIntake('file.open', {}, 'compare'); } : null;
			},
			get readCurrentDocument() {
				return _nativeCapability('currentDocumentRead') ? function (documentAuthority) {
					return _nativeRequestIntake('file.readCurrent', { documentAuthority: String(documentAuthority || '') }, 'read-current');
				} : null;
			},
			checkExternalFileChange: function (documentAuthority) {
				if (!_nativeCapability('currentDocumentRead')) return Promise.resolve(false);
				var id = String(documentAuthority || '').trim();
				if (!id) return Promise.resolve(false);
				return _nativeHostCall('file.checkExternal', { documentAuthority: id }).then(function (result) {
					var status = result && String(result.status || '');
					if (status === 'missing') {
						if (_nativeReportedGenerations.get(id) === '<missing>') return false;
						_nativeReportedGenerations.set(id, '<missing>');
						try {
							window.dispatchEvent(new CustomEvent('rapier:file-changed', {
								detail: { documentAuthority: id, missing: true },
							}));
						} catch (_) {}
						return true;
					}
					if (status !== 'changed') {
						if (status === 'unchanged') _nativeReportedGenerations.delete(id);
						return false;
					}
					var generation = String(result.fileGeneration || '');
					if (!generation || _nativeReportedGenerations.get(id) === generation) return false;
					_nativeReportedGenerations.set(id, generation);
					try {
						window.dispatchEvent(new CustomEvent('rapier:file-changed', {
							detail: { documentAuthority: id, fileGeneration: generation },
						}));
					} catch (_) {}
					return true;
				});
			},
			get acceptOpenedDocument() {
				return _nativeCapability('openedFileBinding') ? async function (payload) {
					payload = payload || {};
					var result = await _nativeHostCall('document.acceptOpened', {
						path: payload.path || '', documentAuthority: payload.documentAuthority || '',
						fileGeneration: payload.fileGeneration == null ? null : payload.fileGeneration,
						intakeId: Number(payload.nativeIntakeId) || 0,
					});
					var bound = !!payload.path && !!result && result.bound === true;
					if (bound) {
						_setNativeCurrentFileBinding(payload.documentAuthority, payload.fileGeneration);
						_nativeReportedGenerations.delete(String(payload.documentAuthority || ''));
					}
					else _clearPlatformFileBinding(payload.documentAuthority);
					return result;
				} : null;
			},
			get detachCurrentFile() {
				return _nativeCapability('fileDetach') ? function (documentAuthority) {
					var expected = String(documentAuthority || '').trim();
					if (expected) _clearPlatformFileBinding(expected);
					else _clearPlatformFileBinding();
					return _nativeHostCall('document.detach', {
						documentAuthority: expected,
					}).catch(function () { return null; });
				} : null;
			},
			get hasWritableHandle() {
				return _nativeCapability('openedFileBinding') ? function (documentAuthority) {
					return _platformHasWritableBinding(documentAuthority);
				} : null;
			},
			currentFileAuthority: function () {
				return _platformCurrentFileAuthority();
			},
			currentFileGeneration: function (documentAuthority) {
				return _platformFileGeneration(documentAuthority);
			},
			get saveAs() { return _nativeCapability('saveAs') ? _nativeSaveAs : null; },
			get saveInPlace() {
				return _nativeCapability('saveInPlace') ? function (blob, filename, options) {
					return _nativeSaveRequest('saveInPlace', blob, filename || 'document', options);
				} : null;
			},
			get exportArtifact() { return _nativeCapability('artifactExport') ? _nativeExportArtifact : null; },
			get printCurrentDocument() { return _nativeCapability('print') ? _nativePrintCurrentDocument : null; },
			get clipboardWrite() { return _nativeCapability('clipboardWrite') ? _nativeClipboardWrite : null; },
			get externalOpen() {
				return _nativeCapability('externalOpen') ? function (url) {
					return _nativeHostCall('external.open', { url: String(url || '') }).then(function (result) {
						return !result || result.opened !== false;
					});
				} : null;
			},
			get share() { return _nativeCapability('share') ? _nativeShare : null; },
			publishTheme: function (dark) {
				if (_nativeCapability('windowTheme')) _nativeHostNotify('window.theme', { dark: !!dark });
			},
			takeBootDocument: async function () {
				var payload = _rapierBootstrapRuntime.pendingIntake || _nativeIntakeRuntime.last;
				if (!payload) payload = await _waitForNativeIntake();
				return payload ? { kind: 'document', file: payload } : null;
			},
			hasPendingBootDocument: function () {
				return !!(_rapierBootstrapRuntime.pendingIntake || _nativeIntakeRuntime.last || _nativeIntakePending());
			},
			finishBoot: function (state) {
				_nativeHostNotify('page.ready');
				if (state && state.documentConsumed === true) return;
				var payload = _rapierBootstrapRuntime.pendingIntake || _nativeIntakeRuntime.last;
				if (!payload) return;
				try { window.dispatchEvent(new CustomEvent('rapier:platform-open', { detail: payload })); } catch (_) {}
			},
			clearDocumentIntake: function (payload) {
				if (!payload) {
					var open = _nativeIntakeRuntime.transfer;
					if (!open && !_nativeIntakeRuntime.last && !_nativeIntakeRuntime.failure &&
							!_rapierBootstrapRuntime.pendingIntake && !_nativeHostRuntime.state.pendingIntake) return;
					_nativeIntakeRuntime.generation += 1;
					_nativeIntakeFinish(null, null);
					try { _rapierBootstrapRuntime.pendingIntake = null; } catch (_) {}
					_nativeHostNotify('intake.clear', open ? { intakeId: Number(open.id) || 0 } : {});
					return;
				}
				var intakeId = Number(payload && payload.nativeIntakeId) || 0;
				if (!Number.isSafeInteger(intakeId) || intakeId <= 0) return;
				var transferMatches = !!(_nativeIntakeRuntime.transfer && _nativeIntakeRuntime.transfer.id === intakeId);
				var lastMatches = !!(_nativeIntakeRuntime.last && Number(_nativeIntakeRuntime.last.nativeIntakeId) === intakeId);
				var shareMatches = !!(_rapierBootstrapRuntime.pendingIntake && Number(_rapierBootstrapRuntime.pendingIntake.nativeIntakeId) === intakeId);
				if (transferMatches) {
					_nativeIntakeRuntime.generation += 1;
					_nativeIntakeFinish(null, null);
				} else {
					if (lastMatches) _nativeIntakeRuntime.last = null;
					if (shareMatches) {
						try { _rapierBootstrapRuntime.pendingIntake = null; } catch (_) {}
					}
					_nativeHostRuntime.state.pendingIntake = !!_nativeIntakeRuntime.transfer;
				}
				if (lastMatches || shareMatches || transferMatches) _nativeIntakeRuntime.failure = null;
				_nativeHostNotify('intake.clear', { intakeId: intakeId });
			},
			getRecentFiles: function () {
				return _nativeCapability('recents') && Array.isArray(_nativeHostRuntime.state.recents)
					? _nativeHostRuntime.state.recents.slice() : [];
			},
			noteRecent: function (name, path, documentAuthority) {
				if (!_nativeCapability('recents')) return;
				var entry = { name: String(name || 'document'), path: String(path || name || ''), documentAuthority: String(documentAuthority || ''), ts: Date.now() };
				_nativeHostNotify('recent.note', entry);
				_nativeHostRuntime.state.recents = [entry].concat(_nativeHostRuntime.state.recents.filter(function (r) { return r && r.path !== entry.path; })).slice(0, RECENTS_CAP);
				try { window.dispatchEvent(new CustomEvent('rapier:recent-files-changed', { detail: { count: _nativeHostRuntime.state.recents.length } })); } catch (_) {}
			},
			openRecent: function (entry) {
				if (!entry || !_nativeCapability('recents')) return false;
				_nativeHostNotify('recent.open', { path: entry.path || entry.name });
				return true;
			},
			launcherIconState: function () {
				if (!_nativeCapability('launcherIcon')) return null;
				return Object.assign({ color: 'black' }, _nativeHostRuntime.state.launcherIcon || {});
			},
			setLauncherIcon: function (color) {
				if (!_nativeCapability('launcherIcon')) return Promise.reject(new Error('launcher icon is unavailable'));
				return _nativeHostCall('launcherIcon.set', { color: String(color || '') }).then(function (value) {
					_nativeHostRuntime.state.launcherIcon = value && typeof value === 'object'
						? Object.assign({}, value)
						: { color: 'black' };
					try {
						window.dispatchEvent(new CustomEvent('rapier:launcher-icon-changed', {
							detail: Object.assign({}, _nativeHostRuntime.state.launcherIcon),
						}));
					} catch (_) {}
					return Object.assign({}, _nativeHostRuntime.state.launcherIcon);
				});
			},
			get resourceInstallMessage() {
				return _nativeCapability('resources') ? function (resource, phase) {
					// Only the plug-ins the app's pack carries speak its words (the PDF reader is not one of them).
					var state = _nativeHostRuntime.state.resources, words = state && state.words;
					if (String(state && state.plugins || '').split(',').indexOf(String(resource)) < 0) return '';
					return words && typeof words[phase] === 'string' ? words[phase] : '';
				} : null;
			},
			get resourceStatus() {
				return _nativeCapability('resources') ? function (id) { return _nativeHostCall('resources.status', { id: String(id || '') }); } : null;
			},
			get resourceRead() { return _nativeCapability('resources') ? _nativeResourceRead : null; },
			// Google Play may take minutes (and may ask the person first); the call waits an hour before it gives up.
			get resourceEnsure() {
				return _nativeCapability('resources') ? function (id) {
					return _nativeHostCall('resources.ensure', { id: String(id || '') }, 3600000).then(function () { return _nativeResourceRead(id); });
				} : null;
			},
			get resourceRemove() {
				return _nativeCapability('resourceRemove') ? function (id) { return _nativeHostCall('resources.remove', { id: String(id || '') }, 120000); } : null;
			},
			get installationSupported() { return _nativeCapability('installation'); },
			installationState: function () {
				return Object.assign({}, _nativeHostRuntime.state.installation || { state: 'standalone', installed: false });
			},
			install: function () {
				return _nativeHostCall('platform.install', {}).then(function (value) {
					if (value) _nativeHostRuntime.state.installation = value;
					return value;
				});
			},
			uninstall: function () {
				return _nativeHostCall('platform.uninstall', {}).then(function (value) {
					if (value) _nativeHostRuntime.state.installation = value;
					return value;
				});
			},
			get openDefaultApps() {
				return _nativeCapability('defaultApps') ? function () {
					return _nativeHostCall('platform.defaultApps', {}).then(function () { return true; });
				} : null;
			},
			// Typed settings doors carry no page-selected URL or package to either native host.
			get openMicrophoneSettings() {
				return _nativeCapability('microphoneSettings') ? async function () {
					const answer = await _nativeHostCall('platform.microphoneSettings', {});
					if (answer?.opened !== true) throw new Error('Microphone settings could not be opened');
				} : null;
			},
			get reminderState() {
				return _nativeCapability('reminders') ? function () { return _nativeHostCall('reminders.state', {}); } : null;
			},
			get requestReminderPermission() {
				return _nativeCapability('reminders') ? function () { return _nativeHostCall('reminders.permission', {}, 300000); } : null;
			},
			get openReminderSettings() {
				return _nativeCapability('reminders') ? async function (kind) {
					if (kind !== 'notifications' && kind !== 'exact') throw new Error('Unknown reminder setting');
					const answer = await _nativeHostCall('reminders.settings', {kind});
					if (answer?.opened !== true) throw new Error('Reminder settings could not be opened');
				} : null;
			},
			get requestClose() {
				return _nativeCapability('windowClose') ? function () { _nativeHostNotify('window.requestClose'); return true; } : null;
			},
			get notesStore() {
				return _nativeCapability('notesStore') ? function (operation, args) { return _nativeHostCall(operation, args); } : null;
			},
			get openAttachment() {
				return _nativeCapability('notesAttachmentOpen') ? function (name) { return _nativeHostCall('notes.attachment.open', {name}); } : null;
			},
			get unlockNotes() {
				return _nativeCapability('notesCapture') ? function () { return _nativeHostCall('notes.unlock', {}); } : null;
			},
			get captureReady() {
				return _nativeCapability('notesCapture') ? function (token, ready) { return _nativeHostCall('notes.captureReady', {token, ready}); } : null;
			},
			// R86i: null where the role does not exist; still present once held (the reply's "held" says so).
			get requestNotesRole() {
				return _nativeCapability('notesRole') ? function () {
					return _nativeHostCall('notes.requestRole', {});
				} : null;
			},
			// Android only. Nothing crosses: the page cannot name a package, URL or app for the host to open.
			get openSync() {
				return _nativeCapability('sync') ? function () {
					return _nativeHostCall('sync.open', {});
				} : null;
			},
			// Uploaded in bounded messages, replaced atomically after commit; empty cancels all. null only where native scheduling cannot exist.
			get scheduleReminder() {
				return _nativeCapability('reminders') ? async function (rows) {
					const id = crypto.randomUUID();
					try {
						await _nativeHostCall('reminders.begin', {id});
						for (let at = 0; at < rows.length; at += 64) await _nativeHostCall('reminders.rows', {id, rows: rows.slice(at, at + 64)});
						return await _nativeHostCall('reminders.commit', {id});
					} finally { await _nativeHostCall('reminders.cancel', {id}); }
				} : null;
			},
			approveClose: function () {
				if (_nativeCapability('windowClose')) _nativeHostNotify('window.closeApproved');
			},
			publishDirty: function (value) {
				if (_nativeCapability('windowDocumentState')) _nativeHostNotify('document.dirty', { dirty: !!value });
			},
			publishTitle: function (value) {
				if (_nativeCapability('windowDocumentState')) _nativeHostNotify('document.title', { title: String(value || 'Rapier') });
			},
		};
	}

	 
	const appPreferences = new Map();
	const appsPlatform = {id:'mcp-app', ownsRecoveryWriterBoundary:true, ownsRecoveryStore:true, ownsPreferenceStore:true, allowsEmbed:false, allowsBrowserIntake:false, allowsServiceWorker:false, allowsWebShareFallback:false, allowsBrowserDownloadFallback:false, allowsBrowserPrintFallback:false, canSaveInPlace:true, showsRecentFilesUi:false, showsUploadUi:false, canShare:false, proSupported:false, preference:(key,fallback)=>appPreferences.has(key)?appPreferences.get(key):fallback, setPreference:(key,value)=>appPreferences.set(key,value), exportArtifact:async(blob,filename)=>globalThis.RapierMcpApp ? globalThis.RapierMcpApp.exportFile(blob,filename) : false};
	const rawPlatform = globalThis.RAPIER_APPS_HOST === true ? appsPlatform : hasSpeedracer
		? _createSpeedracerPlatform()
		: (hasNative ? _createNativePlatform() : _createWebPlatform());
	Object.freeze(rawPlatform);
	_rapierPlatformPortRuntime.port = _createPlatformPort(rawPlatform);
})();

// Laws 41 and 42: /notes and /draw are the page itself (repo/_redirects). The path names the surface while it is up, / once the editor is;
// only at the site root or a door (a page served as rapier.html keeps its path), never the hash or the query.
function _rapierDoorPathMark(door, on) {
	try {
		if (!/^https?:$/.test(location.protocol) || !new RegExp('^\\/(' + door + '\\/?)?$').test(location.pathname)) return;
		const path = on ? '/' + door : '/';
		// A document's address (#d/<id>) stays on the editor's entry, never the door's.
		const hash = on && /^#d\//.test(location.hash) ? '' : location.hash;
		if (location.pathname !== path || hash !== location.hash) history.replaceState(history.state, '', path + location.search + hash);
	} catch (_) {}
}

// Law 56: the page holds its own entries so Back lands in Rapier: the guard (depth 1), a canvas (depth 2). The engine's _rapierBackWant says how many;
// Notes holds its own (notes/notes.js). The held depth is set before a pop made here, so that pop is never read as the person's Back.
const _rapierBackEntries = {armed: false, held: 0, want: 0, popping: false, leaving: false};
function _rapierBackEntriesHold(want) {
	const rt = _rapierBackEntries;
	rt.want = Math.max(0, Math.min(2, Number(want) || 0));
	if (!rt.armed) {
		if (!rt.want) return;
		rt.armed = true;
		// A reload or a restored session lands on one of Rapier's own entries: the page loaded there is a new
		// document, and that entry is its own now, under the guard pushed next.
		const state = history.state;
		if (state && typeof state === 'object' && (state.rapierBack || state.rapierNotes)) { try { history.replaceState(null, ''); } catch (_) {} }
	}
	if (rt.popping || rt.leaving) return;
	try {
		// Never over Notes' entries and never from under them: the cards push theirs over the guard.
		if (history.state?.rapierNotes) return;
		while (rt.held < rt.want) {
			// Law 42: the canvas's entry is the one /draw names; the guard under it keeps the editor's address.
			if (rt.held === 1) _rapierDoorPathMark('draw', false);
			history.pushState({rapierBack: ++rt.held}, '');
		}
		if (rt.held > rt.want) {
			const delta = rt.want - rt.held;
			rt.held = rt.want; rt.popping = true;
			history.go(delta);
		}
	} catch (_) {}
}
function _rapierBackEntriesArmed() { return _rapierBackEntries.armed && !_rapierBackEntries.leaving; }
// LEAVE (engine.js _rapierLeave): no page can close its tab, so where nothing precedes the page its entries go and the browser's Back is next ('last').
function _rapierBackEntriesLeave() {
	const rt = _rapierBackEntries;
	if (!rt.armed) return '';
	// A push cuts forward entries, so the page's are the tab's last.
	const on = Number(history.state?.rapierBack) || 0, before = on === rt.held ? history.length - 1 - rt.held : 1;
	const again = () => { document.removeEventListener('pointerdown', again, true); document.removeEventListener('keydown', again, true); rt.leaving = false; _rapierBackEntriesHold(rt.want); };
	rt.leaving = true; rt.popping = false;
	document.addEventListener('pointerdown', again, true); document.addEventListener('keydown', again, true);
	const delta = before > 0 ? -(rt.held + 1) : -rt.held;
	rt.held = 0;
	try { if (delta) history.go(delta); } catch (_) {}
	return before > 0 ? 'gone' : 'last';
}
window.addEventListener('popstate', () => {
	const rt = _rapierBackEntries;
	if (!rt.armed) return;
	const state = history.state && typeof history.state === 'object' ? history.state : null;
	if (state?.rapierNotes) return;
	const to = Number(state?.rapierBack) || 0;
	if (rt.popping) { rt.popping = false; rt.held = to; _rapierBackEntriesHold(rt.want); return; }
	if (rt.leaving) { rt.held = to; return; }
	// At or above what is held: a pop of Notes' own entries, or a Forward onto one of these.
	if (to >= rt.held) { rt.held = to; _rapierBackEntriesHold(rt.want); return; }
	rt.held = to;
	// Notes up: a pop through its entries is Notes' own to answer; the guard returns when Notes leaves.
	if (document.body && (document.body.classList.contains('rapier-notes-open') || document.body.classList.contains('rapier-notes-mode'))) return;
	// The page's own entry takes the editor's address before the guard goes back over it.
	if (!to) { _rapierDoorPathMark('notes', false); _rapierDoorPathMark('draw', false); }
	try { window.Rapier.shell.handleBack(); } catch (error) { try { console.warn('[rapier] back', error); } catch (_) {} }
	_rapierBackEntriesHold(rt.want);
});
