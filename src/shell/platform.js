// SPDX-License-Identifier: AGPL-3.0-only
// Packed into the RAPIER_PLATFORM slot; inflated first, before every editor stage and any host handshake.
const _RAPIER_SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const _RAPIER_SHARE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const _RAPIER_STORAGE_BUCKETS = ['notesText', 'notesAudio', 'notesAttachments', 'notesImports', 'notesHistory', 'notesOther', 'recordings', 'palettes', 'preferences', 'otherSaved', 'protected', 'temporary', 'cacheKept'];

function _rapierStorageFormatBytes(value, incomplete) {
	if (!Number.isSafeInteger(value) || value < 0) return 'unavailable';
	var text;
	if (value < 1024) text = value + ' B';
	else {
		var units = ['KB', 'MB', 'GB', 'TB'], shown = value / 1024, index = 0;
		while (shown >= 1024 && index < units.length - 1) { shown /= 1024; index += 1; }
		text = (shown >= 10 ? shown.toFixed(0) : shown.toFixed(1)) + ' ' + units[index];
	}
	return incomplete ? text + ' incomplete' : text;
}

function _rapierStorageTotals(report, pageUsage) {
	var buckets = report && report.buckets;
	if (!buckets || typeof buckets !== 'object') return null;
	var values = {}, i, value, notes = 0, kept = 0;
	for (i = 0; i < _RAPIER_STORAGE_BUCKETS.length; i += 1) {
		value = buckets[_RAPIER_STORAGE_BUCKETS[i]];
		if (!Number.isSafeInteger(value) || value < 0) return null;
		values[_RAPIER_STORAGE_BUCKETS[i]] = value;
	}
	notes = values.notesText + values.notesAudio + values.notesAttachments + values.notesImports + values.notesHistory + values.notesOther + values.recordings;
	kept = values.palettes + values.preferences + values.otherSaved + values.protected + values.cacheKept;
	if (!Number.isSafeInteger(notes) || !Number.isSafeInteger(kept) || !Number.isSafeInteger(notes + kept + values.temporary)) return null;
	return {
		app: notes + kept + values.temporary,
		notes: notes,
		kept: kept,
		temporary: values.temporary,
		page: Number.isSafeInteger(pageUsage) && pageUsage >= 0 ? pageUsage : null,
		incomplete: report.incomplete === true || report.complete === false || report.errors > 0,
	};
}

function _rapierStorageSameReply(current, seen) {
	return Number.isSafeInteger(current) && current === seen;
}

function _rapierTextHasDocumentScalars(value) {
	const text = String(value == null ? '' : value);
	return text.isWellFormed() && !text.includes('\0');
}

const RAPIER_DOCUMENT_NAME_MAX_CHARS = 512;
function _rapierDocumentNameIsAdmissible(value) {
	const name = String(value == null ? '' : value);
	return !!name.trim() && name.length <= RAPIER_DOCUMENT_NAME_MAX_CHARS && name !== '.' && name !== '..' &&
		!/[\\/<>"\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff\ud800-\udfff]/u.test(name);
}

function _rapierNormalizeAdmittedText(value, admittedBytes, accepts, bomSeparated = false) {
	let text = String(value == null ? '' : value);
	const byteLength = new TextEncoder().encode(text).byteLength;
	if (admittedBytes != null) {
		const declaredBytes = Number(admittedBytes);
		if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes !== byteLength) {
			throw new Error('document byte length is invalid');
		}
	}
	if (!bomSeparated && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
	if (byteLength > RapierTextCodec.maxDocumentBytes) {
		throw new Error('document is too large for Rapier (max 64 MiB)');
	}
	if (!accepts(text)) throw new Error('document is not plain UTF-8 text');
	return text;
}

const RapierTextCodec = (readRecords => Object.freeze({
	maxDocumentBytes: 64 * 1024 * 1024,
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
	normalizeDocument: function (value, admittedBytes, bomSeparated = false) {
		return _rapierNormalizeAdmittedText(
			value, admittedBytes, RapierTextCodec.isDocumentFragment, bomSeparated
		);
	},
	normalizeDocumentAsync: async function (value, admittedBytes, options = {}) {
		let text = String(value == null ? '' : value), bytes = 0, buffer = new Uint8Array(0);
		if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
		const record = options.readRecord;
		if (readRecords.has(record) && record.text === text &&
				admittedBytes != null && record.bytes === Number(admittedBytes)) {
			return !options.bomSeparated && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
		}
		const encoder = new TextEncoder();
		for (let start = 0; start < text.length;) {
			if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
			let end = Math.min(text.length, start + 1048576);
			if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 &&
					text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 &&
					text.charCodeAt(end) <= 0xdfff) end++;
			const part = text.slice(start, end);
			if (!RapierTextCodec.isDocumentFragment(part)) throw new Error('document is not plain UTF-8 text');
			if (buffer.length < 3 * part.length) buffer = new Uint8Array(3 * part.length);
			bytes += encoder.encodeInto(part, buffer).written;
			if (bytes > RapierTextCodec.maxDocumentBytes) throw new Error('document is too large for Rapier (max 64 MiB)');
			start = end;
			options.onProgress?.(start / text.length);
			if (start < text.length) await (options.yield ? options.yield() : new Promise(resolve => setTimeout(resolve, 0)));
		}
		if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
		if (admittedBytes != null && (!Number.isSafeInteger(Number(admittedBytes)) || Number(admittedBytes) !== bytes)) {
			throw new Error('document byte length is invalid');
		}
		if (!options.bomSeparated && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
		return text;
	},
	normalizeProtocol: function (value, admittedBytes) {
		return _rapierNormalizeAdmittedText(
			value, admittedBytes, RapierTextCodec.isProtocolFragment
		);
	},
	decodeDocumentUtf8: function (bytes) {
		const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
		if (view.byteLength > RapierTextCodec.maxDocumentBytes) {
			throw new Error('document is too large for Rapier (max 64 MiB)');
		}
		let text;
		try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view); }
		catch (_) { throw new Error('document is not plain UTF-8 text'); }
		return RapierTextCodec.normalizeDocument(text, view.byteLength);
	},
	readDocumentBlob: async function (blob) {
		return (await RapierTextCodec.readDocumentRecord(blob)).text;
	},
	readDocumentRecord: async function (blob, options = {}) {
		const size = Number(blob?.size);
		if (!blob || typeof blob.arrayBuffer !== 'function' || typeof blob.slice !== 'function' ||
				!Number.isSafeInteger(size) || size < 0) throw new Error('document bytes are unavailable');
		if (size > RapierTextCodec.maxDocumentBytes) {
			throw new Error('document is too large for Rapier (max 64 MiB)');
		}
		const utf8Rejected = () => Object.assign(new Error('document is not plain UTF-8 text'), {code: 'utf8_bytes'});
		async function readUtf8() {
			const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}), parts = [];
			let bom = false, bytes = 0;
			for (let start = 0; start < size; start += 1048576) {
				if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
				const chunk = new Uint8Array(await blob.slice(start, start + 1048576).arrayBuffer());
				if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
				if (chunk.length !== Math.min(1048576, size - start)) throw new Error('document byte length is invalid');
				if (!start) bom = chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf;
				bytes += chunk.length;
				let part;
				try { part = decoder.decode(chunk, {stream: true}); }
				catch (_) { throw utf8Rejected(); }
				if (!RapierTextCodec.isDocumentFragment(part)) throw new Error('document is not plain UTF-8 text');
				parts.push(part);
				options.onProgress?.(bytes / size);
				if (options.yield) await options.yield();
			}
			if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
			try { parts.push(decoder.decode()); }
			catch (_) { throw utf8Rejected(); }
			const joined = parts.join(''), text = bom ? joined.slice(1) : joined;
			return {text, bom, bytes: bytes - (bom ? 3 : 0), encoding: 'utf-8'};
		}

		async function readWindows1252() {
			const decoder = new TextDecoder('windows-1252'), encoder = new TextEncoder(), parts = [];
			let buffer = new Uint8Array(0), utf8 = 0, read = 0;
			for (let start = 0; start < size; start += 1048576) {
				if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
				const chunk = new Uint8Array(await blob.slice(start, start + 1048576).arrayBuffer());
				if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
				if (chunk.length !== Math.min(1048576, size - start)) throw new Error('document byte length is invalid');
				const part = decoder.decode(chunk, {stream: true});
				if (!RapierTextCodec.isDocumentFragment(part)) throw new Error('document is not plain UTF-8 text');
				if (buffer.length < part.length * 3) buffer = new Uint8Array(part.length * 3);
				utf8 += encoder.encodeInto(part, buffer).written;
				if (utf8 > RapierTextCodec.maxDocumentBytes) throw new Error('document is too large for Rapier (max 64 MiB)');
				parts.push(part);
				read += chunk.length;
				options.onProgress?.(read / size);
				if (options.yield) await options.yield();
			}
			if (options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
			const tail = decoder.decode();
			if (tail) {
				if (!RapierTextCodec.isDocumentFragment(tail)) throw new Error('document is not plain UTF-8 text');
				parts.push(tail);
				utf8 += encoder.encode(tail).byteLength;
				if (utf8 > RapierTextCodec.maxDocumentBytes) throw new Error('document is too large for Rapier (max 64 MiB)');
			}
			return {text: parts.join(''), bom: false, bytes: utf8, encoding: 'windows-1252'};
		}

		let record;
		try { record = await readUtf8(); }
		catch (error) {
			if (error?.code !== 'utf8_bytes') throw error;
			record = await readWindows1252();
		}
		Object.freeze(record);
		readRecords.add(record);
		return record;
	},
}))(new WeakSet());

 
const _rapierProviders = Object.seal({
	speech: null,
	speechUtterance: null,
	math: null,
	mermaid: null,
	'mermaid-zenuml': null,
	'font-subset': null,
	ocr: null,
	'letters-field': null,
	'letters-relief': null,
	'letters-leaf': null,
	'letters-arabesque': null,
	'letters-silhouette': null,
	'letters-gothic': null,
	'letters-sugar': null,
	'letters-illuminated-1490': null,
	'letters-tuscan-1845': null,
	'letters-renaissance-alphabet': null,
	templates: null,
	'elements-ac': null,
	'elements-dn': null,
	'elements-oz': null,
	lettersets: null,
});
const _rapierBootstrapRuntime = Object.seal({ pendingIntake: null, complete: false, failed: false, opened: false });
let _rapierPublishBootFacts;
const _rapierBootFactsPublished = new Promise(resolve => { _rapierPublishBootFacts = resolve; });
const RAPIER_PLATFORM_FACETS = Object.freeze([
	'environment', 'preferences', 'pro', 'water', 'media', 'files',
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

const RAPIER_ACCENT_PRESETS = globalThis.RapierPreferenceDefinitions.PREFERENCE_ACCENTS;

const RAPIER_STORAGE_SCOPE = (function () {
	try {
		if (!/^https?:$/.test(location.protocol)) return '';
		var dir = new URL('.', location.href).pathname;
		return dir === '/' ? '' : '@' + dir;
	} catch (_) { return ''; }
})();
const RapierTabSlot = (function () {
	var single = Object.freeze({slot: 1, fresh: false, claimed: false, claim: null, ready: Promise.resolve(), drafts: '', key: '', scope: function () { return ''; }, move: function () { return false; }, reclaim: function () { return false; }, lease: function () { return ''; }, record: function () { return false; }, unsaved: function () { return []; }});
	try {
		if (window.__RAPIER_NATIVE_WINDOW !== undefined || !/^https?:$/.test(location.protocol) || window.self !== window.top) return single;
		var key = 'rapier:recovery:tab' + RAPIER_STORAGE_SCOPE;
		var drafts = 'rapier:recovery:tab-drafts' + RAPIER_STORAGE_SCOPE;
		var leaseName = function (n) { return 'rapier:recovery:writer:v1' + RAPIER_STORAGE_SCOPE + (n > 1 ? '#t' + n : ''); };
		var namesOf = function (names) { return Array.isArray(names) ? names : []; };
		var taken = function (names, n) { return namesOf(names).indexOf(leaseName(n)) >= 0; };
		var lowest = function (names, skip) { var n = 1; while (taken(names, n) || skip && skip.indexOf(n) >= 0) n++; return n; };
		var marksNow = function () { try { return JSON.parse(localStorage.getItem(drafts) || '{}') || {}; } catch (_) { return {}; } };
		var shownKey = drafts + ':shown';
		var shownNow = function () { try { var value = JSON.parse(localStorage.getItem(shownKey) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
		var order = function (marks, shown, ok) {
			return Object.keys(marks).map(Number).filter(function (n) { return n >= 1 && n < 1000 && marks[n] && marks[n].dirty === true && ok(n); })
				.sort(function (a, b) { return (shown[a] || 0) - (shown[b] || 0) || a - b; });
		};
		var stamped = null;
		var stamp = function (n, at) {
			try {
				var shown = shownNow();
				if (at === undefined) { stamped = {n: n, at: shown[n]}; shown[n] = Date.now(); }
				else if (at) shown[n] = at; else delete shown[n];
				localStorage.setItem(shownKey, JSON.stringify(shown));
			} catch (_) {}
		};
		var unstamp = function () { if (stamped) { stamp(stamped.n, stamped.at || 0); stamped = null; } };
		var choose = function (names, skip) {
			unstamp();
			var open = order(marksNow(), shownNow(), function (n) { return !taken(names, n) && !(skip && skip.indexOf(n) >= 0); });
			if (!open.length) return lowest(names, skip);
			stamp(open[0]);
			return open[0];
		};
		var asked = /(?:^#|&)rapier-tab=(\d{1,3})(?=&|$)/.exec(location.hash), slot = 0, fresh = false;
		var claimed = false, claim = null;
		if (asked) {
			slot = Number(asked[1]);
			try { history.replaceState(history.state, '', location.href.replace(/[#&]rapier-tab=\d{1,3}(?=&|$)/, '').replace(/#$/, '')); } catch (_) {}
		} else slot = Number(sessionStorage.getItem(key)) || 0;
		var locksLive = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' && typeof navigator.locks.query === 'function';
		var readyPromise = Promise.resolve();
		var reserveFresh = function () {
			var gate = 'rapier:recovery:slot-gate:v1' + RAPIER_STORAGE_SCOPE, skip = [], settled = false;
			return new Promise(function (resolve) {
				var finish = function () {
					if (settled) return;
					settled = true;
					if (!claimed && !(slot >= 1 && slot < 1000)) {
						slot = choose([]);
						try { sessionStorage.setItem(key, String(slot)); } catch (_) {}
					}
					resolve();
				};
				var timer = typeof setTimeout === 'function' ? setTimeout(finish, 1500) : 0;
				var work = (async function () {
					for (var attempt = 0; attempt < 8 && !settled; attempt++) {
						var granted = false;
						await navigator.locks.request(gate, async function () {
							if (settled) return;
							var state = await navigator.locks.query();
							if (settled) return;
							var names = (state && state.held || []).map(function (lock) { return lock.name; });
							var pick = choose(names, skip);
							var lease = leaseName(pick);
							var got = await new Promise(function (accept) {
								var request = navigator.locks.request(lease, {mode: 'exclusive', ifAvailable: true}, function (lock) {
									if (!lock) { accept(false); return; }
									accept(true);
									return new Promise(function (release) {
										claim = {name: lease, slot: pick, onLost: null, release: function () { try { release(); } catch (_) {} }};
									});
								});
								if (request && typeof request.catch === 'function') request.catch(function () {
									if (claim && claim.name === lease && typeof claim.onLost === 'function') claim.onLost();
								});
							});
							if (settled) {
								unstamp();
								if (got && claim && claim.name === lease) { try { claim.release(); } catch (_) {} claim = null; }
								return;
							}
							if (!got) { unstamp(); if (skip.indexOf(pick) < 0) skip.push(pick); return; }
							slot = pick;
							claimed = true;
							granted = true;
							try { sessionStorage.setItem(key, String(slot)); } catch (_) {}
						});
						if (granted || settled) return;
					}
				})();
				work.then(function () { if (timer) clearTimeout(timer); finish(); }, function () { if (timer) clearTimeout(timer); finish(); });
			});
		};
		if (!(slot >= 1 && slot < 1000)) {
			fresh = true;
			if (locksLive) readyPromise = reserveFresh();
			else slot = choose([]);
		}
		if (slot >= 1) { try { sessionStorage.setItem(key, String(slot)); } catch (_) {} }
		var recorded = '';
		var readDrafts = function () { try { var value = JSON.parse(localStorage.getItem(drafts) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
		return Object.freeze({
			get slot() { return slot; }, fresh: fresh, get claimed() { return claimed; }, get claim() { return claim; }, ready: readyPromise, drafts: drafts, key: key,
			scope: function (n) { return n > 1 ? '#t' + n : ''; },
			lease: function (n) { return leaseName(n); },
			record: function (dirty, name) {
				var mark = (dirty ? '1' : '0') + String(name || 'untitled.md');
				if (mark === recorded) return true;
				try { var rows = readDrafts(); rows[slot] = {dirty: !!dirty, name: String(name || 'untitled.md'), at: Date.now()}; localStorage.setItem(drafts, JSON.stringify(rows)); recorded = mark; return true; }
				catch (_) { return false; }
			},
			unsaved: function () {
				var rows = readDrafts(), out = [];
				for (var n in rows) { var number = Number(n), row = rows[n]; if (number !== slot && number >= 1 && number < 1000 && row && row.dirty === true) out.push({slot: number, name: String(row.name || 'untitled.md')}); }
				return out.sort(function (a, b) { return a.slot - b.slot; });
			},
			reclaim: function (names) {
				if (!fresh) return false;
				var shown = shownNow(), own = stamped && stamped.n === slot ? stamped.at || 0 : null;
				if (own !== null) { if (own) shown[slot] = own; else delete shown[slot]; }
				var pick = order(marksNow(), shown, function (n) { return n === slot || namesOf(names).indexOf(leaseName(n)) < 0; })[0];
				if (!pick || pick === slot) return false;
				unstamp(); stamp(pick);
				try { sessionStorage.setItem(key, String(pick)); } catch (_) { return false; }
				location.reload();
				return true;
			},
			move: function (names) {
				if (!fresh) return false;
				var next = choose(namesOf(names), [slot]);
				if (next === slot) return false;
				try { sessionStorage.setItem(key, String(next)); } catch (_) { return false; }
				location.reload();
				return true;
			},
		});
	} catch (_) { return single; }
})();
function RAPIER_RECOVERY_SCOPE() {
	var carried = '';
	try { carried = location.protocol === 'file:' && document.getElementById('rapier-document') ? '!' + location.pathname : ''; }
	catch (_) {}
	try {
		var native = window.__RAPIER_NATIVE_WINDOW;
		var tab = Number.isInteger(native) && native > 1 && native < 1000 ? '#' + native : RapierTabSlot.scope(RapierTabSlot.slot);
		return RAPIER_STORAGE_SCOPE + carried + tab;
	} catch (_) { return RAPIER_STORAGE_SCOPE + carried; }
}
const RAPIER_STORAGE_FORBIDDEN = (function () { try { void window.localStorage; return false; } catch (error) { return !!error && error.name === 'SecurityError'; } })();
const RapierStorage = Object.freeze({
	scope: RAPIER_STORAGE_SCOPE,
	get recoveryScope() { return RAPIER_RECOVERY_SCOPE(); },
	preferences: Object.freeze({
		...globalThis.RapierPreferenceDefinitions.PREFERENCE_DEFINITIONS,
		notesPersistAsked: Object.freeze({ key: 'rapier:preference:notes-persist-asked', fallback: false }),
		jxlNoticeShown: Object.freeze({ key: 'rapier:preference:jxl-notice-shown', fallback: '' }),
	}),
	webFileHandlesDb: 'rapier:file-handles' + RAPIER_STORAGE_SCOPE,
	webGenerationPrefix: 'web:',
	keptBindings: 'rapier:kept-bindings' + RAPIER_STORAGE_SCOPE,
	get recoveryDb() { return 'rapier:recovery:6' + RAPIER_RECOVERY_SCOPE(); },
	get recoverySnapshot() { return 'rapier:recovery:snapshot:6' + RAPIER_RECOVERY_SCOPE(); },
	get nativeSaveIntents() { return 'rapier:native:save-intents' + RAPIER_RECOVERY_SCOPE(); },
	get restoreCursor() { return 'rapier:recovery:restore-cursor' + RAPIER_RECOVERY_SCOPE(); },
	get bootAttempt() { return 'rapier:recovery:boot-attempt' + RAPIER_RECOVERY_SCOPE(); },
	get writerPromotion() { return 'rapier:recovery:writer-promotion' + RAPIER_RECOVERY_SCOPE(); },
	readingPoints: 'rapier:recovery:reading-points' + RAPIER_STORAGE_SCOPE,
	get writerLease() { return 'rapier:recovery:writer:v1' + RAPIER_RECOVERY_SCOPE(); },
	embedDraftPrefix: 'rapier:embed:draft' + RAPIER_STORAGE_SCOPE + ':',
});

const RapierBootAttempts = (function () {
	var HOLD_AFTER = 2;
	function key() { return RapierStorage.bootAttempt; }
	function read() {
		var raw = null;
		try { raw = sessionStorage.getItem(key()); } catch (_) {}
		try {
			raw = raw || localStorage.getItem(key());
			var value = raw ? JSON.parse(raw) : null;
			return value && typeof value === 'object' && typeof value.stamp === 'string' && Number.isInteger(value.count) ? value : null;
		} catch (_) { return null; }
	}
	function write(value) {
		var text = value ? JSON.stringify(value) : null;
		try { sessionStorage.removeItem(key()); } catch (_) {}
		try { if (text) localStorage.setItem(key(), text); else localStorage.removeItem(key()); return; } catch (_) {}
		try { if (text) sessionStorage.setItem(key(), text); } catch (_) {}
	}
	return Object.freeze({
		holdAfter: HOLD_AFTER,
		begin: function (stamp) {
			var value = read(), count = value && value.stamp === stamp ? value.count : 0;
			if (count >= HOLD_AFTER) { if (!value.held) write({stamp: stamp, count: count, held: true, at: Date.now()}); return {held: true, count: count}; }
			write({stamp: stamp, count: count + 1, held: false, at: Date.now()});
			return {held: false, count: count + 1};
		},
		settle: function () { var value = read(); if (!value || !value.held) write(null); },
		release: function () { write(null); },
		state: function () { return read(); },
	});
})();
window.RapierBootAttempts = RapierBootAttempts;

const RapierWriterPromotion = (function () {
	function key() { return RapierStorage.writerPromotion; }
	var channel = null, channelKey = '';
	function open() {
		try {
			var name = key();
			if (channel && channelKey !== name) { try { channel.close(); } catch (_) {} channel = null; }
			channelKey = name;
			return channel || (channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null);
		}
		catch (_) { return null; }
	}
	return Object.freeze({
		closed: function () { try { var c = open(); if (c) c.postMessage('closed'); } catch (_) {} },
		onClosed: function (listener) {
			var c = open();
			if (c) c.onmessage = function (event) { if (event.data === 'closed') listener(); };
		},
		mark: function () { try { sessionStorage.setItem(key(), '1'); } catch (_) {} },
		consume: function () {
			try { var marked = sessionStorage.getItem(key()) === '1'; if (marked) sessionStorage.removeItem(key()); return marked; }
			catch (_) { return false; }
		},
	});
})();
window.RapierWriterPromotion = RapierWriterPromotion;

const RapierDocumentClaim = (function () {
	var channelName = 'rapier:document-claim' + RAPIER_STORAGE_SCOPE, lockPrefix = 'rapier:document:' + RAPIER_STORAGE_SCOPE + ':';
	var channel = null, held = {handle: null, key: '', release: null}, asked = [];
	function open() {
		if (channel) return channel;
		try {
			if (typeof BroadcastChannel !== 'function') return null;
			channel = new BroadcastChannel(channelName);
			channel.onmessage = function (event) { answer(event.data); };
		} catch (_) { channel = null; }
		return channel;
	}
	function same(a, b) {
		if (!a || !b) return Promise.resolve(false);
		try { return Promise.resolve(a.isSameEntry(b)).then(function (yes) { return yes === true; }, function () { return false; }); }
		catch (_) { return Promise.resolve(false); }
	}
	function answer(message) {
		if (!message || typeof message !== 'object' || message.type !== 'who' || typeof message.id !== 'string') return;
		var keyed = typeof message.key === 'string' && message.key !== '' && message.key === held.key;
		Promise.resolve(keyed || (message.handle ? same(held.handle, message.handle) : false)).then(function (yes) {
			if (!yes) return;
			try { channel.postMessage({type: 'here', id: message.id}); } catch (_) {}
			try { asked.forEach(function (listener) { listener(); }); } catch (_) {}
			try { window.focus(); } catch (_) {}
		});
	}
	function drop() {
		var release = held.release;
		held = {handle: null, key: '', release: null};
		if (release) release();
	}
	return Object.freeze({
		hold: function (identity) {
			identity = identity || {};
			if (identity.key && identity.key === held.key && held.release) { held.handle = identity.handle || held.handle; return Promise.resolve(true); }
			drop();
			open();
			held = {handle: identity.handle || null, key: typeof identity.key === 'string' ? identity.key : '', release: null};
			if (!held.key || !navigator.locks || typeof navigator.locks.request !== 'function') return Promise.resolve(true);
			var mine = held;
			return new Promise(function (resolve) {
				var settled = false, finish = function (value) { if (!settled) { settled = true; resolve(value); } };
				setTimeout(function () { finish(true); }, 1500);
				try {
					navigator.locks.request(lockPrefix + mine.key, {mode: 'exclusive', ifAvailable: true}, function (lock) {
						if (!lock) { if (held === mine) drop(); finish(false); return; }
						if (held !== mine) { finish(true); return; }
						return new Promise(function (release) { mine.release = release; finish(true); });
					}).catch(function () { finish(true); });
				} catch (_) { finish(true); }
			});
		},
		release: drop,
		find: function (identity, wait) {
			identity = identity || {};
			var c = open();
			if (!c) return Promise.resolve(false);
			var id = Math.random().toString(36).slice(2) + Date.now().toString(36);
			return new Promise(function (resolve) {
				var done = function (value) { c.removeEventListener('message', listen); clearTimeout(timer); resolve(value); };
				var listen = function (event) { if (event.data && event.data.type === 'here' && event.data.id === id) done(true); };
				var timer = setTimeout(function () { done(false); }, wait > 0 ? wait : 400);
				c.addEventListener('message', listen);
				try { c.postMessage({type: 'who', id: id, key: identity.key || '', handle: identity.handle || null}); }
				catch (_) { done(false); }
			});
		},
		onAsked: function (listener) { asked.push(listener); },
		held: function () { return {key: held.key, handle: held.handle}; },
	});
})();
window.RapierDocumentClaim = RapierDocumentClaim;

const RapierPreferences = (function () {
var _preferenceListeners = Object.create(null);
var _preferenceRevisions = Object.create(null);
var _preferenceHeld = Object.create(null);
var _carriedTheme = document.querySelector('meta[name="rapier-appearance"]')?.content;
if (_carriedTheme === 'light' || _carriedTheme === 'dark') _preferenceHeld.theme = _carriedTheme;
var _androidPreferenceRestore = false, _androidPreferenceLoaded = false, _androidPreferenceWrites = Promise.resolve();
function _preferenceAdmits(spec, value) {
	return value != null && typeof value === typeof spec.fallback &&
		Array.isArray(value) === Array.isArray(spec.fallback) &&
		(!spec.values || spec.values.indexOf(value) >= 0) && (!spec.pattern || new RegExp(spec.pattern).test(value));
}
function _androidPreferenceSnapshot() {
	var values = {};
	for (var spec of Object.values(globalThis.RapierPreferenceDefinitions.PREFERENCE_DEFINITIONS)) {
		try { var raw = localStorage.getItem(spec.key), value = raw == null ? null : JSON.parse(raw); if (_preferenceAdmits(spec, value)) values[spec.key] = value; } catch (_) {}
	}
	return values;
}
function _androidPreferenceMirror() {
	var backup = window.RapierPlatform?.host?.notesBackup;
	if (!_androidPreferenceLoaded || _androidPreferenceRestore || typeof backup !== 'function') return;
	var values = _androidPreferenceSnapshot();
	_androidPreferenceWrites = _androidPreferenceWrites.catch(function () {}).then(function () { return backup('notes.backup.settings', {values: values}); });
	void _androidPreferenceWrites.catch(function (error) { console.warn('[rapier] Android settings backup', error); });
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
		if (_preferenceAdmits(spec, value)) return value;
		if (!platform || platform.preferences.ownsStore !== true || typeof platform.preferences.read !== 'function') {
			try { localStorage.removeItem(spec.key); } catch (_) {}
		}
		try { console.warn('[rapier] discarded invalid preference', spec.key); } catch (_) {}
		return spec.fallback;
	},
	write: function rapierWritePreference(field, value, schedule) {
		var spec = RapierStorage.preferences[field];
		if (!spec) throw new Error('unknown Rapier preference: ' + field);
		var admitted = _preferenceAdmits(spec, value) ? value : spec.fallback;
		var revision = _preferenceRevisions[field] = (_preferenceRevisions[field] || 0) + 1;
		var platform = window.RapierPlatform;
		if (platform && platform.preferences.ownsStore === true && typeof platform.preferences.write === 'function') {
			try { Promise.resolve(platform.preferences.write(spec.key, admitted)).catch(function () {}); }
			catch (_) {}
		} else {
			try { localStorage.setItem(spec.key, JSON.stringify(admitted)); } catch (_) {}
		}
		_androidPreferenceMirror();
		var deferred = typeof schedule === 'function', stored = deferred ? RapierPreferences.read(field) : null, notified = false;
		var notify = function () {
			if (notified) return;
			notified = true;
			if (deferred && (_preferenceRevisions[field] !== revision || RapierPreferences.read(field) !== stored)) return;
			var listeners = _preferenceListeners[field];
			for (var at = 0; listeners && at < listeners.length; at++) {
				try { listeners[at](admitted, field); }
				catch (error) { try { console.warn('[rapier] preference listener failed', spec.key, error); } catch (_) {} }
			}
		};
		if (deferred) { try { schedule(notify); } catch (_) { notify(); } }
		else notify();
		return admitted;
	},
	chosen: function (field) {
		var key = RapierStorage.preferences[field].key, platform = window.RapierPlatform, absent = {};
		try { return platform && platform.preferences.ownsStore === true ? platform.preferences.read(key, absent) !== absent : localStorage.getItem(key) != null; }
		catch (_) { return false; }
	},
	hold: function (field, value) { if (value) _preferenceHeld[field] = value; else delete _preferenceHeld[field]; },
	held: function (field) { return _preferenceHeld[field] || ''; },
	look: function (field) { return _preferenceHeld[field] || RapierPreferences.read(field); },
	subscribe: function (field, apply) {
		if (!RapierStorage.preferences[field]) throw new Error('unknown Rapier preference: ' + field);
		(_preferenceListeners[field] || (_preferenceListeners[field] = [])).push(apply);
		return apply;
	},
	snapshot: function () {
		return Object.fromEntries(Object.keys(globalThis.RapierPreferenceDefinitions.PREFERENCE_DEFINITIONS).map(function (field) {
			return [field, RapierPreferences.read(field)];
		}));
	},
	restoreAndroid: function (values) {
		if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Android settings are unreadable.');
		_androidPreferenceRestore = true;
		try {
			for (var field of Object.keys(globalThis.RapierPreferenceDefinitions.PREFERENCE_DEFINITIONS)) {
				var spec = RapierStorage.preferences[field];
				if (!Object.hasOwn(values, spec.key) || !_preferenceAdmits(spec, values[spec.key])) continue;
				if (!RapierPreferences.chosen(field)) RapierPreferences.write(field, values[spec.key]);
			}
		} finally { _androidPreferenceRestore = false; _androidPreferenceLoaded = true; }
		_androidPreferenceMirror();
	},
});
})();

function _rapierPwaFrameAdmission(isTopLevel, hasCarriedDocument, appsHost = false) {
	return isTopLevel === true && hasCarriedDocument !== true && appsHost !== true;
}

(function () {
	'use strict';

	if (globalThis.RapierBenchRoute !== true && globalThis.RapierBenchSession?.active !== true &&
			!window.RapierHost &&
			_rapierPwaFrameAdmission(window.self === window.top, !!document.getElementById('rapier-document'), globalThis.RAPIER_APPS_HOST === true) &&
			(location.protocol === 'http:' || location.protocol === 'https:')) {
		var place = /^\/(notes|draw|paint|watercolor)\/?$/.exec(location.pathname);
		[
			{ rel: 'manifest', href: place ? 'manifest-' + place[1] + '.json' : 'manifest.json' },
		].forEach(function (attrs) {
			var link = document.createElement('link');
			Object.keys(attrs).forEach(function (key) { link.setAttribute(key, attrs[key]); });
			document.head.appendChild(link);
		});
	}

	var hasSpeedracer = window.name === 'speedracer' && window.parent !== window;
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
			support: null,
			launcherIcon: { color: 'black' },
			recents: [],
			pendingIntake: false,
			recoveryAutoResume: false,
			installation: { state: 'standalone', installed: false },
			notesStoreGeneration: null,
			resources: null,
			partPacks: null,
		}),
	});
	const _nativeIntakeRuntime = Object.seal({ transfer: null, waiters: [], last: null, failure: null, generation: 0, transport: null, expecting: false });
	const _nativeSaveRuntime = Object.seal({ sequence: 0, pending: new Map(), receipts: new Map(), replaying: false, replayTask: null, booted: false });
	const _nativeCloseRuntime = Object.seal({ sequence: 0, active: null });
	const _platformBindingRuntime = Object.seal({ files: new Map(), originalProjections: 0 });
	function _platformCheckpoint(checkpoint) {
		var pending = [], accepting = true;
		var collect = Object.freeze({checkpoint: checkpoint, waitUntil: function (completion) {
			if (!accepting) return;
			pending.push(Promise.resolve(completion).then(function (kept) { return kept === true; }, function () { return false; }));
		}});
		try { window.dispatchEvent(new CustomEvent('rapier:checkpoint-requested', {detail: collect})); }
		catch (_) { pending.push(Promise.resolve(false)); }
		accepting = false;
		return Promise.all(pending).then(function (kept) {
			return kept.length > 0 && kept.every(function (value) { return value === true; });
		});
	}
	globalThis.RapierCheckpoint = _platformCheckpoint;
	function _platformDocumentDescriptor(filename, editablePage) {
		return _rapierDocumentNameIsAdmissible(filename) && typeof editablePage === 'boolean'
			? Object.freeze({filename: String(filename), editablePage}) : null;
	}
	function _platformBoundDocument(authority) {
		return _platformBindingRuntime.files.get(String(authority || '').trim())?.document || null;
	}
	function _setPlatformFileBinding(authority, generation, writable, original, document) {
		var id = String(authority || '').trim();
		if (!id) return;
		var previous = _platformBindingRuntime.files.get(id);
		if (previous?.original && previous.original !== original) void previous.original.release().catch(() => {});
		_platformBindingRuntime.files.set(id, {
			original: original || null,
			generation: generation == null ? null : generation,
			writable: writable === true,
			document: document === undefined ? previous?.document || null : document,
		});
	}
	function _clearPlatformFileBinding(authority) {
		var id = String(authority || '').trim();
		for (var [key, binding] of _platformBindingRuntime.files) if (!id || key === id) {
			_platformBindingRuntime.files.delete(key);
			if (binding.original) void binding.original.release().catch(() => {});
		}
	}
	function _platformOriginal(authority) {
		return _platformBindingRuntime.files.get(String(authority || ''))?.original || null;
	}
	function _setNativeCurrentFileBinding(authority, generation, document = _platformBoundDocument(authority)) {
		_clearPlatformFileBinding();
		_setPlatformFileBinding(authority, generation, true, null, document);
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

	function _nativeHostCall(operation, args, timeoutMs, generation) {
		if (!hasNative) return Promise.reject(Object.assign(new Error('native host is unavailable'), {nativeNotSent: true}));
		var id = 'host-' + Date.now().toString(36) + '-' + (++_nativeHostRuntime.sequence).toString(36);
		return new Promise(function (resolve, reject) {
			var timeout = setTimeout(function () {
				if (!_nativeHostRuntime.pending.has(id)) return;
				_nativeHostRuntime.pending.delete(id);
				reject(Object.assign(new Error('native ' + operation + ' timed out'), {nativeTimeout: true}));
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

	function _platformPersistencePending() {
		return !!(_rapierKeptRuntime.saving || _rapierKeptRuntime.saveTask || _nativeSaveRuntime.replaying || _nativeSaveRuntime.replayTask);
	}
	async function _platformSettlePersistence() {
		for (;;) {
			var work = [_rapierKeptRuntime.saveTask, _nativeSaveRuntime.replayTask].filter(Boolean);
			if (!work.length) return !_platformPersistencePending();
			await Promise.allSettled(work);
		}
	}
	function _nativeCloseReceipt(value, token) {
		if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'closeToken') || !Number.isSafeInteger(value.closeToken) ||
				value.closeToken !== token || token <= 0 || Object.keys(value).length !== 2) return null;
		if (Object.hasOwn(value, 'cancelled') && value.cancelled === true && !Object.hasOwn(value, 'closing')) return Object.freeze({closeToken: token, cancelled: true});
		if (Object.hasOwn(value, 'closing') && value.closing === true && !Object.hasOwn(value, 'cancelled')) return Object.freeze({closeToken: token, closing: true});
		return null;
	}
	function _nativeCloseUnknown(error, token) {
		return Object.assign(new Error(error?.message || 'The native close outcome is unknown.'), {closeUnknown: true, closeToken: token});
	}
	function _nativeAcceptCloseReceipt(attempt, receipt) {
		if (attempt.cancelled) return attempt.cancelled;
		if (receipt.cancelled === true) {
			attempt.cancelled = receipt;
			if (_nativeCloseRuntime.active === attempt) _nativeCloseRuntime.active = null;
			attempt.resolve(receipt);
			try { window.dispatchEvent(new CustomEvent('rapier:platform-close-cancelled', {detail: receipt})); } catch (_) {}
		} else attempt.resolve(receipt);
		return receipt;
	}
	function _nativeCloseCancelled(detail) {
		var attempt = _nativeCloseRuntime.active;
		if (!attempt) return;
		var receipt = _nativeCloseReceipt(detail, attempt.token);
		if (receipt?.cancelled === true) _nativeAcceptCloseReceipt(attempt, receipt);
	}
	function _nativeCancelClose(token) {
		if (!Number.isSafeInteger(token) || token <= 0 || token > _nativeCloseRuntime.sequence)
			return Promise.reject(_nativeCloseUnknown(new Error('Unknown close token.'), token));
		var attempt = _nativeCloseRuntime.active?.token === token ? _nativeCloseRuntime.active : null;
		if (attempt) attempt.cancelRequested = true;
		return _nativeHostCall('window.cancelClose', {closeToken: token}).then(function (value) {
			var receipt = _nativeCloseReceipt(value, token);
			if (!receipt) throw new Error('The native close cancellation was not confirmed.');
			return attempt ? _nativeAcceptCloseReceipt(attempt, receipt) : receipt;
		}).catch(function (error) {
			var unknown = _nativeCloseUnknown(error, token);
			if (attempt && _nativeCloseRuntime.active === attempt && !attempt.cancelled) attempt.reject(unknown);
			throw unknown;
		});
	}
	function _nativeApproveClose(options) {
		if (options?.sealed !== true || !_nativeCapability('windowClose') || _nativeCloseRuntime.active || _platformPersistencePending() ||
				_nativeCloseRuntime.sequence >= Number.MAX_SAFE_INTEGER)
			throw Object.assign(new Error('Close requires a current sealed caller.'), {closeNotSent: true});
		var attempt = {token: ++_nativeCloseRuntime.sequence, cancelled: null, cancelRequested: false, resolve: null, reject: null};
		var completion = new Promise(function (resolve, reject) { attempt.resolve = resolve; attempt.reject = reject; });
		_nativeCloseRuntime.active = attempt;
		Promise.resolve().then(function () {
			if (attempt.cancelRequested || attempt.cancelled) return;
			return _nativeHostCall('window.closeApproved', {closeToken: attempt.token}).then(function (value) {
				var receipt = _nativeCloseReceipt(value, attempt.token);
				if (!receipt) throw new Error('The native close outcome was not confirmed.');
				_nativeAcceptCloseReceipt(attempt, receipt);
			}).catch(function () {
				if (attempt.cancelled) return;
				return _nativeCancelClose(attempt.token).catch(function (error) {
					if (!attempt.cancelled) attempt.reject(_nativeCloseUnknown(error, attempt.token));
				});
			});
		});
		return Object.freeze({closeToken: attempt.token, completion: completion});
	}

	function _rapierExternalIntakeReleaseDeferred(payload) {
		var waiting = globalThis._rapierHeldExternalFiles;
		if (!payload || !waiting?.length) return false;
		var id = Number(payload.nativeIntakeId) || 0;
		if (!(id > 0) || !waiting.some(held => Number(held.nativeIntakeId) === id)) return false;
		return globalThis._rapierAcceptedExternalIntakeId !== id;
	}

	function _nativeHostEvent(name, detail) {
		if (name === 'capabilities.changed') {
			Promise.resolve(_nativeHostRuntime.ready).then(function () {
				if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return;
				_nativeHostRuntime.state.capabilities = Object.assign({}, _nativeHostRuntime.state.capabilities, detail);
				window.dispatchEvent(new CustomEvent('rapier:platform-state', {detail: {capabilities: _nativeHostRuntime.state.capabilities}}));
			});
			return;
		}
		if (name === 'clipboard.capture') {
			window.dispatchEvent(new CustomEvent('rapier:native-paste', {detail: {phase: 'capture', pasteToken: String(detail?.pasteToken || '')}}));
			return;
		}
		if (name === 'media.changed') {
			window.dispatchEvent(new CustomEvent('rapier:native-media', {detail}));
			return;
		}
		if (name === 'reminders.actionsChanged') {
			if (typeof window.rapierNotesReceiveReminderActions === 'function') window.rapierNotesReceiveReminderActions();
			return;
		}
		if (name === 'document.saveResult') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-save-result', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'pro.changed') {
			_nativeHostRuntime.state.pro = detail || null;
			_emitPro(_normalizeProState(_nativeHostRuntime.state.pro));
			return;
		}
		if (name === 'support.changed') {
			_nativeHostRuntime.state.support = detail || null;
			try { window.dispatchEvent(new CustomEvent('rapier:support-changed', {detail: detail || {}})); } catch (_) {}
			return;
		}
		if (name === 'review.ready') { _nativeReview.ready(detail); return; }
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
		if (name === 'parts.changed') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-part', { detail: { id: String(detail && detail.id || ''), progress: Number(detail && detail.progress) || 0 } })); } catch (_) {}
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
		if (name === 'document.new') {
			try {
				if (typeof _rapierHostNewDocument === 'function') void _rapierHostNewDocument(detail || {});
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
		if (name === 'window.closeCancelled') { _nativeCloseCancelled(detail); return; }
		if (name === 'window.checkpointRequested') {
			var checkpoint = Number(detail && detail.checkpoint), kept = _platformCheckpoint(checkpoint);
			if (Number.isSafeInteger(checkpoint) && checkpoint > 0) kept.then(function (value) {
				_nativeHostNotify('window.checkpointCompleted', {checkpoint: checkpoint, kept: value});
			});
			return;
		}
		if (name === 'window.memoryTrimmed') {
			try { window.dispatchEvent(new CustomEvent('rapier:memory-trimmed')); } catch (_) {}
			return;
		}
		if (name === 'document.printFinished') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-print-finished')); } catch (_) {}
			return;
		}
		if (name === 'document.printFailed') {
			try { window.dispatchEvent(new CustomEvent('rapier:platform-print-failed', { detail: detail || {} })); } catch (_) {}
			return;
		}
		if (name === 'storage.returned') {
			try { window.dispatchEvent(new CustomEvent('rapier:storage-returned')); } catch (_) {}
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
		else pending.reject(Object.assign(new Error(String(message.error || 'native operation failed')), {nativeRejected: true},
			message.code ? {code: String(message.code)} : {}));
	}

	if (hasNative) nativeHost.onmessage = _nativeHostReceive;

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
				throw new Error('document is too large for Rapier (max 64 MiB)');
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
		if (payload?.purpose === 'clipboard') {
			window.dispatchEvent(new CustomEvent('rapier:native-paste', {detail: {phase: 'deliver', payload}}));
			return;
		}
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
		if (payload && _rapierBootstrapRuntime.complete && (payload.purpose === 'external' || payload.purpose === 'share')) {
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
			if (typeof message.purpose !== 'string' || !message.purpose) {
				_nativeIntakeReject({id: message.id}, new Error('native document transfer named no purpose'));
				return;
			}
			_nativeHostRuntime.state.pendingIntake = true;
			_nativeIntakeRuntime.generation += 1;
			_nativeIntakeRuntime.failure = null;
			_nativeIntakeRuntime.transfer = {
				id: Number(message.id) || 0,
				generation: _nativeIntakeRuntime.generation,
				deliveryGeneration: Number(message.deliveryGeneration),
				frameGeneration: message.generation == null ? null : String(message.generation),
				name: typeof _nativeIntakeDocumentName === 'function'
					? _nativeIntakeDocumentName(message.name, message.contentType) : String(message.name || 'shared'),
				path: message.path == null ? null : String(message.path),
				documentAuthority: message.documentAuthority == null ? '' : String(message.documentAuthority),
				fileGeneration: message.fileGeneration == null ? null : message.fileGeneration,
				purpose: message.purpose,
				pasteToken: message.pasteToken == null ? null : String(message.pasteToken),
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
			try { _nativeIntakeChunk(data); } catch (error) {
				var open = _nativeIntakeRuntime.transfer;
				if (open) _nativeIntakeReject(open, error instanceof Error ? error : new Error(String(error)));
			}
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
					pasteToken: finished.pasteToken,
					transient: finished.transient === true,
					contentType: finished.contentType,
					admittedBytes: finished.receivedBytes,
				};
				if (finished.decoder) {
					var finalText = finished.decoder.decode();
					if (finalText) finished.parts.push(finalText);
					var joined = finished.parts.join('');
					payload.bom = joined.charCodeAt(0) === 0xFEFF;
					payload.text = RapierTextCodec.normalizeDocument(joined, finished.receivedBytes);
					if (payload.bom) payload.admittedBytes -= 3;
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
		try { window.RapierIntake.onmessage = _nativeIntakeOnMessage; } catch (_) {}
		var announce = function () {
			try {
				window.RapierIntake.postMessage(JSON.stringify({
					type: 'ready',
					session: Date.now().toString(36) + Math.random().toString(36).slice(2),
				}));
			} catch (_) {}
		};
		if (window.RapierNativeTransport) announce();
		else window.addEventListener('rapier:runtime-loaded', announce, { once: true });
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
		retired: new Set(),
		epochs: new Map(),
	});

	function _webEpoch(id) {
		var epochs = _webFileRuntime.epochs || (_webFileRuntime.epochs = new Map());
		return epochs.get(id) || 0;
	}
	function _webBumpEpoch(id) {
		var epochs = _webFileRuntime.epochs || (_webFileRuntime.epochs = new Map());
		epochs.set(id, (epochs.get(id) || 0) + 1);
	}
	function _webFileSlot() {
		try {
			var n = typeof RapierTabSlot === 'undefined' || !RapierTabSlot ? 0 : RapierTabSlot.slot;
			return n >= 1 && n < 1000 ? n : 0;
		} catch (_) { return 0; }
	}

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
				store.put(val, key);
				tx.oncomplete = function () { resolve(true); };
				tx.onerror = function () { reject(tx.error); };
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

	async function _blobFingerprint(blob) {
		if (globalThis.crypto?.subtle && blob.size <= 64 * 1024 * 1024) {
			if (blob.size >= 1024 * 1024 && globalThis.RapierWorkerExecution) {
				const install = function (scope) {
					scope.onmessage = async event => {
						try {
							const value = event.data, digest = await globalThis.crypto.subtle.digest('SHA-256', await value.arrayBuffer());
							scope.postMessage({bytes: value.size, algorithm: 'sha256', digest: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')});
						} catch (error) { scope.postMessage({error: String(error.message || error)}); }
					};
				};
				try {
					const worker = globalThis.RapierWorkerExecution.createWorkerExecution({name: 'rapier-fingerprint',
						source: '(' + install.toString() + ')(self);', install});
					try {
						return await new Promise((resolve, reject) => {
							worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
							worker.onerror = worker.onmessageerror = event => reject(event.error || new Error(event.message || 'File fingerprint failed'));
							worker.postMessage(blob);
						});
					} finally { worker.terminate(); }
				} catch (_) {}
			}
			var digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
			return { bytes: blob.size, algorithm: 'sha256', digest: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
		}
		var hash = globalThis.RapierLedger.sha256State();
		for (var at = 0; at < blob.size; at += 1048576) hash.update(new Uint8Array(await blob.slice(at, at + 1048576).arrayBuffer()));
		return { bytes: blob.size, algorithm: 'sha256', digest: hash.finish() };
	}

	function _webGenerationFromFingerprint(fingerprint) {
		if (!fingerprint) return null;
		return RapierStorage.webGenerationPrefix + fingerprint.algorithm + ':' + fingerprint.digest + ':' + fingerprint.bytes;
	}

	async function _webFileGeneration(file) {
		if (!file) return null;
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
		var error = new Error('no authorized destination remains for this document');
		error.code = 'requires_destination';
		return error;
	}

	async function _writeToHandle(handle, blob, options) {
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;
		if (options.check) options.check();

		var expected = await _blobFingerprint(blob);
		if (options.check) options.check();
		var writable = await handle.createWritable({ keepExistingData: false, mode: 'exclusive' });
		try {
			if (options.check) options.check();
			if (options.fileGeneration != null) {
				if (!handle || typeof handle.getFile !== 'function') throw new Error('saved file cannot be inspected before writing');
				var previousFile = await handle.getFile();
				var previousGeneration = await _webFileGeneration(previousFile);
				if (previousGeneration !== String(options.fileGeneration)) {
					throw _externalFileChangedError();
				}
			}
			if (options.check) options.check();
			await writable.write(blob);
			if (options.check) options.check();
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

	function _pickerAcceptFor(filename, offerRapierFile) {
		var name = String(filename || 'document');
		var page = /.\.rapier\.html$/i.test(name);
		if (offerRapierFile) {
			var types = [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
				{ description: 'Rapier file (.rapier.html)', accept: { 'text/html': ['.rapier.html'] } }];
			return page ? types.reverse() : types;
		}
		var ext = page ? '.rapier.html' : name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '.md';
		 
		if (!/^\.[A-Za-z0-9+.]+$/.test(ext) || ext.length > 16 || ext.endsWith('.')) return null;
		var accept = {};
		var mime = ({
			'.md':   'text/markdown', '.markdown': 'text/markdown', '.mdown': 'text/markdown',
			'.txt':  'text/plain',
			'.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
			'.js':   'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript',
			'.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml',
			'.png':  'image/png', '.jxl': 'image/jxl', '.ora': 'image/openraster',
			'.csv':  'text/csv', '.yaml': 'application/yaml', '.yml': 'application/yaml',
		})[ext.toLowerCase()] || 'application/octet-stream';
		accept[mime] = [ext];
		return [{ description: page ? 'Rapier file (.rapier.html)' : 'Rapier document', accept: accept }];
	}

	async function _webDownload(blob, filename, options) {
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;
		if (options.check) options.check();
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
		return { handle: value.handle, generation: value.generation, document: value.document && _platformDocumentDescriptor(value.document.filename, value.document.editablePage) };
	}

	function _webRecordForAuthority(authority) {
		var id = String(authority || '').trim();
		if (!id) return Promise.resolve({ handle: null, generation: null });
		return _queueWebBindingMutation(async function () {
			if (_webFileRuntime.retired.has(id)) return { handle: null, generation: null };
			var epoch = _webEpoch(id);
			var live = _webFileRuntime.liveHandles.get(id);
			if (live) {
				var liveRecord = _webHandleRecord(live);
				if (liveRecord.handle) return liveRecord;
				_webFileRuntime.liveHandles.delete(id);
			}
			var stored = await _idbGet('authority:' + id);
			if (_webFileRuntime.retired.has(id) || _webEpoch(id) !== epoch) return { handle: null, generation: null };
			var record = _webHandleRecord(stored);
			if (stored && stored.handle && !record.handle) {
				await _idbDeleteHandle('authority:' + id);
			}
			if (record.handle) {
				if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) return { handle: null, generation: null };
				_webFileRuntime.activeAuthority = id;
				_webFileRuntime.liveHandles.set(id, record);
				if (!_platformBindingRuntime.files.has(id)) _setPlatformFileBinding(id, record.generation, true, null, record.document || _platformBoundDocument(id));
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
			encoding: read.encoding,
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

	var _WEB_PICKER_UNAVAILABLE = Object.freeze({ unavailable: true }), _webPickerSilent = false;
	function _webPickSaveDestination(filename, offerRapierFile) {
		if (_webPickerSilent) return Promise.resolve(_WEB_PICKER_UNAVAILABLE);
		var pickerPromise, asked = Date.now();
		try {
			var pickerOptions = { suggestedName: filename || 'document' };
			var pickerTypes = _pickerAcceptFor(filename, offerRapierFile);
			if (pickerTypes) pickerOptions.types = pickerTypes;
			pickerPromise = window.showSaveFilePicker(pickerOptions);
		} catch (error) {
			pickerPromise = Promise.reject(error);
		}
		return pickerPromise.then(async function (handle) {
			var writable = await _handleWritable(handle);
			if (!writable) return null;
			if (!handle || typeof handle.getFile !== 'function') {
				throw new Error('selected destination cannot be inspected before writing');
			}
			var selectedFile = await handle.getFile();
			var selectedGeneration = await _webFileGeneration(selectedFile);
			return { handle: handle, generation: selectedGeneration };
		}).catch(function (error) {
			if (error && (error.name === 'AbortError' || error.code === 20)) {
				if (Date.now() - asked < 150) { _webPickerSilent = true; return _WEB_PICKER_UNAVAILABLE; }
				return null;
			}
			throw error;
		});
	}

	function _webPickerSave(blob, filename, options, persistedKey, selected) {
		if (options && options.requireExistingDestination === true) {
			return Promise.reject(_requiresDestinationError());
		}
		var chooses = typeof blob === 'function';
		return (selected ? Promise.resolve(selected) : _webPickSaveDestination(filename, chooses)).then(async function (destination) {
			if (!destination) return _saveResult('cancelled');
			if (destination === _WEB_PICKER_UNAVAILABLE) {
				var bytes = chooses ? await blob(String(filename || '')) : blob;
				if (!bytes) return _saveResult('cancelled');
				var name = _webNextDownloadName(filename, options);
				return _webDownload(bytes, name, options).then(function (result) { return Object.assign(result, { downloadName: name }); });
			}
			var handle = destination.handle;
			var writeOptions = Object.assign({}, options || {}, { fileGeneration: destination.generation });
			var data = chooses ? await blob(String(handle && handle.name || filename || '')) : blob;
			if (!data) return _saveResult('cancelled');
			var result = await _writeToHandle(handle, data, writeOptions);
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
									document: _platformDocumentDescriptor(result.destinationName, options?.editablePage),
								}, persistedKey, true)
							: _webForgetCurrentFileNow(authority);
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

	function _webPrepareExportArtifact(filename) {
		return _webPickSaveDestination(filename).then(function (selected) {
			if (selected === _WEB_PICKER_UNAVAILABLE) return function (blob, options) { return _webDownload(blob, filename, options); };
			return selected ? function (blob, options) {
				return _webPickerSave(blob, filename, options, null, selected);
			} : null;
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
		return _webDownload(blob, _webNextDownloadName(filename, options), options).then(function (result) {
			return Object.assign(result, { downloadName: _webDownloadNames.last });
		});
	}

	var _webDownloadNames = { counts: Object.create(null), last: '' };
	function _webNextDownloadName(filename, options) {
		var name = String(filename || 'document');
		var key = name.toLowerCase(), count = (_webDownloadNames.counts[key] || (options && options.nameTaken ? 1 : 0)) + 1;
		_webDownloadNames.counts[key] = count;
		var type = /.\.rapier\.html$/i.test(name) ? name.slice(-12) : /.\.[A-Za-z0-9+]{1,16}$/.test(name) ? name.slice(name.lastIndexOf('.')) : '';
		return _webDownloadNames.last = count > 1 ? name.slice(0, name.length - type.length) + '-' + count + type : name;
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
			exclusiveNewDestination: options.exclusiveNewDestination === true,
			chosenDestination: String(options.chosenDestination || ''),
			payloadLength: fingerprint.bytes,
			payloadDigest: fingerprint.digest,
		};
		var begun = false;
		try {
			if (options.check) options.check();
			var begin = await _nativeHostCall('transfer.begin', args, 15000);
			begun = true;
			if (options.onAccepted) options.onAccepted();
			if (options.check) options.check();
			var generation = begin && typeof begin.generation === 'string' ? begin.generation : '';
			if (!generation) throw new Error('native transfer named no generation');
			var chunkBytes = begin.chunkBytes;
			if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes > NATIVE_TRANSFER_CHUNK_BYTES) {
				throw new Error('native transfer named no valid chunk byte limit');
			}
			var sequence = 0;
			for (var offset = 0; offset < blob.size; offset += chunkBytes) {
				if (options.check) options.check();
				var part = new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer());
				if (options.check) options.check();
				await _nativeHostCall('transfer.chunk', {
					requestId: requestId,
					sequence: sequence,
					bytes: part,
				}, 30000, generation);
				sequence += 1;
			}
			if (options.check) options.check();
			if (options.onEnding) options.onEnding();
			return await _nativeHostCall('transfer.end', { requestId: requestId }, 120000);
		} catch (error) {
			if (!begun && error.nativeRejected === true) error.nativeNeverAccepted = true;
			if (begun && !options.onAccepted) _nativeHostNotify('transfer.cancel', { requestId: requestId });
			throw error;
		}
	}

	function _nativeSaveIntents() {
		var rows = JSON.parse(localStorage.getItem(RapierStorage.nativeSaveIntents) || '[]');
		if (!Array.isArray(rows) || rows.some(function (row) {
			return !row || typeof row.requestId !== 'string' || row.requestId.length > 160 ||
				!['saveAs', 'saveInPlace', 'export'].includes(row.purpose) ||
				typeof row.documentAuthority !== 'string' || !/^[0-9a-f]{64}$/.test(row.payloadDigest) ||
				!Number.isSafeInteger(row.payloadLength) || row.payloadLength < 0 ||
				!Number.isSafeInteger(row.documentGeneration) || !Number.isSafeInteger(row.documentRevision);
		})) throw new Error('native save intents are unreadable');
		return rows;
	}
	function _nativeKeepSaveIntent(intent) {
		var rows = _nativeSaveIntents();
		if (rows.some(function (row) { return row.requestId === intent.requestId; })) throw new Error('native save request was reused');
		rows.push(intent);
		localStorage.setItem(RapierStorage.nativeSaveIntents, JSON.stringify(rows));
	}
	function _nativeForgetSaveIntent(requestId) {
		var rows = _nativeSaveIntents().filter(function (row) { return row.requestId !== requestId; });
		if (rows.length) localStorage.setItem(RapierStorage.nativeSaveIntents, JSON.stringify(rows));
		else localStorage.removeItem(RapierStorage.nativeSaveIntents);
	}
	function _nativeSaveReceiptMatches(detail, intent) {
		return !!intent && detail.requestId === intent.requestId && detail.purpose === intent.purpose &&
			detail.documentAuthority === intent.documentAuthority && detail.documentGeneration === intent.documentGeneration &&
			detail.documentRevision === intent.documentRevision && detail.payloadDigest === intent.payloadDigest &&
			detail.payloadLength === intent.payloadLength &&
			(['cancelled', 'failed', 'written-unverified'].includes(detail.status) ||
				detail.status === 'confirmed' && detail.ok === true && detail.verified === true);
	}
	function _nativeSaveBinding(detail) {
		if (detail.status !== 'confirmed' || detail.purpose === 'export') return;
		if (detail.bindingPublished === true && _engineOwnsDocumentAuthority(detail.documentAuthority)) {
			var intent = _nativeSaveIntents().find(function (row) { return row.requestId === detail.requestId; });
			if (!_nativeSaveReceiptMatches(detail, intent)) return;
			_setNativeCurrentFileBinding(detail.documentAuthority, detail.fileGeneration,
				_platformDocumentDescriptor(detail.destinationName, intent.resume?.editablePage));
		} else _clearPlatformFileBinding(detail.documentAuthority);
	}
	function _nativeSaveStopWaiting(pending) {
		if (pending.answer) clearTimeout(pending.answer);
		if (pending.retry) clearTimeout(pending.retry);
		if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort);
	}
	async function _nativeAcknowledgeSave(detail, applied) {
		_nativeSaveRuntime.pending.delete(detail.requestId);
		if (applied !== true) {
			return false;
		}
		try {
			var answer = await _nativeHostCall('document.ackSaveResult', {requestId: detail.requestId, payloadDigest: detail.payloadDigest});
			if (answer?.acknowledged !== true) throw new Error('native save result is still retained');
			_nativeForgetSaveIntent(detail.requestId);
			_nativeSaveRuntime.pending.delete(detail.requestId);
			_nativeSaveRuntime.receipts.delete(detail.requestId);
			return true;
		} catch (_) {
			setTimeout(function () { if (_nativeSaveRuntime.receipts.has(detail.requestId)) void _nativeAcknowledgeSave(detail, true); }, 30000);
			return false;
		}
	}
	function _nativeSaveOutcome(detail) {
		return _saveResult(detail.status, {
			verified: detail.verified === true, bytes: detail.payloadLength, fingerprint: detail.payloadDigest,
			fileGeneration: detail.fileGeneration == null ? null : detail.fileGeneration,
			destinationName: String(detail.destinationName || ''), destinationSelected: detail.destinationSelected === true,
			savedWhere: String(detail.savedWhere || ''), noChooser: detail.noChooser === true,
			bindingPublished: detail.bindingPublished === true,
			applyBinding: function () { _nativeSaveBinding(detail); },
			acknowledge: function (applied) { return _nativeAcknowledgeSave(detail, applied); },
		});
	}
	function _nativeReplaySaveResults() {
		if (!_nativeSaveRuntime.booted) return Promise.resolve();
		if (_nativeSaveRuntime.replaying) return _nativeSaveRuntime.replayTask || Promise.resolve();
		_nativeSaveRuntime.replaying = true;
		var replay = (async function () {
			try {
				for (var detail of _nativeSaveRuntime.receipts.values()) {
					if (_nativeSaveRuntime.pending.has(detail.requestId)) continue;
					var intent = _nativeSaveIntents().find(function (row) { return row.requestId === detail.requestId; });
					if (!_nativeSaveReceiptMatches(detail, intent)) continue;
					var close = _nativeCloseRuntime.active;
					if (close) {
						var retired = await _nativeCancelClose(close.token);
						if (retired?.closeToken !== close.token || retired.cancelled !== true || _nativeCloseRuntime.active)
							throw _nativeCloseUnknown(new Error('The native close cancellation was not confirmed.'), close.token);
					}
					if (detail.status !== 'confirmed' || detail.purpose === 'export') { await _nativeAcknowledgeSave(detail, true); continue; }
					var work = [], accepting = true;
					var receipt = Object.freeze({intent: intent, result: _nativeSaveOutcome(detail),
						applyBinding: function () { _nativeSaveBinding(detail); },
						waitUntil: function (completion) { if (accepting) work.push(Promise.resolve(completion)); }});
					window.dispatchEvent(new CustomEvent('rapier:platform-save-recovered', {detail: receipt}));
					accepting = false;
					if (work.length) {
						var settled = await Promise.allSettled(work), failure = settled.find(function (row) { return row.status === 'rejected'; });
						if (failure) throw failure.reason;
						if (settled.every(function (row) { return row.value === true; })) await _nativeAcknowledgeSave(detail, true);
					}
				}
			} catch (error) { console.warn('[rapier-platform] retained save receipt is waiting for its document', error); }
		})().finally(function () {
			if (_nativeSaveRuntime.replayTask === replay) { _nativeSaveRuntime.replayTask = null; _nativeSaveRuntime.replaying = false; }
		});
		_nativeSaveRuntime.replayTask = replay;
		return replay;
	}
	window.addEventListener('rapier:platform-save-result', function (event) {
		var detail = event && event.detail;
		if (!detail || typeof detail.requestId !== 'string') return;
		var pending = _nativeSaveRuntime.pending.get(detail.requestId), intent;
		try { intent = pending?.intent || _nativeSaveIntents().find(function (row) { return row.requestId === detail.requestId; }); }
		catch (_) { return; }
		if (!_nativeSaveReceiptMatches(detail, intent)) return;
		_nativeSaveRuntime.receipts.set(detail.requestId, detail);
		if (!pending || pending.detached) {
			if (pending) {
				pending.terminal = true;
				_nativeSaveStopWaiting(pending);
				_nativeSaveRuntime.pending.delete(detail.requestId);
			}
			void _nativeReplaySaveResults();
			return;
		}
		if (pending.terminal) return;
		pending.terminal = true;
		_nativeSaveStopWaiting(pending);
		var outcome = _nativeSaveOutcome(detail);
		if (detail.status === 'confirmed' || detail.status === 'cancelled') pending.resolve(outcome);
		else pending.reject(Object.assign(new Error(String(detail.error || (
			detail.status === 'written-unverified' ? 'the provider accepted the write but Rapier could not verify it' : 'native save failed'
		))), {code: String(detail.errorCode || 'native_save_failed'), nativeSaveTerminal: true, acknowledge: outcome.acknowledge}));
	});
	window.addEventListener('rapier:document-admitted', function () { setTimeout(_nativeReplaySaveResults, 0); });

	async function _nativeSaveRequest(purpose, blob, filename, options) {
		if (!hasNative) throw new Error('native save is unavailable');
		options = options || {};
		if (options.beforeWrite) await options.beforeWrite;
		if (options.check) options.check();
		var fingerprint = await _blobFingerprint(blob);
		if (options.check) options.check();
		var mime = (blob && blob.type) || 'application/octet-stream';
		var requestId = 'save-' + Date.now().toString(36) + '-' + (++_nativeSaveRuntime.sequence).toString(36);
		var intent = {requestId: requestId, purpose: purpose,
			documentAuthority: String(options.documentAuthority || ''), documentGeneration: Number(options.documentGeneration || 0),
			documentRevision: Number(options.documentRevision || 0), payloadDigest: fingerprint.digest, payloadLength: fingerprint.bytes,
			resume: options.nativeSaveResume ? {...options.nativeSaveResume, editablePage: options.editablePage} : null};
		_nativeKeepSaveIntent(intent);
		var pending;
		var resultPromise = new Promise(function (resolve, reject) {
			pending = {resolve: resolve, reject: reject, intent: intent, accepted: false, terminal: false,
				retry: null, cancelling: false, signal: options.signal, abort: null};
			_nativeSaveRuntime.pending.set(requestId, pending);
		});
		var neverAccepted = function (error) {
			if (pending.terminal) return;
			pending.terminal = true; _nativeSaveStopWaiting(pending);
			_nativeSaveRuntime.pending.delete(requestId);
			try { _nativeForgetSaveIntent(requestId); } catch (_) {}
			if (pending.detached) return;
			if (error && error.name !== 'AbortError') pending.reject(error);
			else pending.resolve(_saveResult('cancelled'));
		};
		var cancelLimit = 3;
		var cancel = async function (error) {
			if (pending.terminal || pending.cancelling || pending.cancelSends >= cancelLimit) return;
			pending.cancelling = true;
			pending.cancelSends = (pending.cancelSends || 0) + 1;
			try {
				var answer = await _nativeHostCall('transfer.cancel', {requestId: requestId});
				if (answer?.accepted === false && answer.cancelled === true) { neverAccepted(error); return; }
				_nativeHostNotify('page.ready');
			} catch (_) {}
			finally { pending.cancelling = false; }
			if (!pending.terminal && pending.cancelSends < cancelLimit)
				pending.retry = setTimeout(function () { void cancel(error); }, 30000);
		};
		var requestedAnswer = Number(options.answerMs);
		var answerMs = Number.isFinite(requestedAnswer) && requestedAnswer > 0 ? requestedAnswer : 120000;
		var detachUnanswered = function () {
			if (pending.terminal || pending.detached) return;
			pending.detached = true;
			if (pending.answer) { clearTimeout(pending.answer); pending.answer = null; }
			pending.resolve(_saveResult('unconfirmed', {confirmed: false, verified: false, cancelled: pending.ended !== true}));
		};
		pending.abort = function () { void cancel(new DOMException('Canceled', 'AbortError')); };
		pending.answer = setTimeout(detachUnanswered, answerMs);
		if (options.signal) options.signal.addEventListener('abort', pending.abort, {once: true});
		resultPromise.catch(function () {});
		void _sendNativeTransfer(purpose, blob, filename, mime, Object.assign({}, options, {
				check: function () {
					if (pending.terminal || pending.detached || options.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
					if (options.check) options.check();
				},
				onAccepted: function () { pending.accepted = true; },
				onEnding: function () { pending.ended = true; },
			}), requestId, fingerprint).catch(function (error) {
			if (!pending.accepted && (error.nativeNeverAccepted === true || error.nativeNotSent === true)) neverAccepted(error);
			else void cancel(error);
		});
		return resultPromise;
	}

	async function _nativeSaveAs(blob, filename, options) {
		options = options || {};
		if (typeof blob === 'function') {
			if (options.beforeWrite) await options.beforeWrite;
			if (options.check) options.check();
			if (_nativeCapability('chooseSave')) {
				var chosen = await _nativeHostCall('save.choose', {name: filename || 'document.md',
					documentAuthority: String(options.documentAuthority || ''),
					documentGeneration: Number(options.documentGeneration || 0),
					documentRevision: Number(options.documentRevision || 0),
					fileGeneration: options.fileGeneration == null ? null : options.fileGeneration}, 3600000);
				if (!chosen || chosen.cancelled === true || !chosen.token || !chosen.name) return _saveResult('cancelled');
				var saveOptions = options;
				options = {...options, chosenDestination: String(chosen.token), get editablePage() { return saveOptions.editablePage; }};
				filename = String(chosen.name);
				blob = await blob(filename);
			} else blob = await blob(filename || 'document.md');
		}
		return _nativeSaveRequest('saveAs', blob, filename || 'download', options);
	}

	async function _nativeExportArtifact(blob, filename, options) {
		try {
			var result = await _nativeSaveRequest('export', blob, filename || 'download', options || {});
			if (result.acknowledge) void result.acknowledge(true);
			return result;
		} catch (error) {
			if (error.nativeSaveTerminal && error.acknowledge) void error.acknowledge(true);
			throw error;
		}
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

	async function _nativeOpenAttachment(name, readFile) {
		if (!_nativeCapability('notesAttachmentBytes')) return _nativeHostCall('notes.attachment.open', {name});
		if (typeof readFile !== 'function') throw new Error('The attachment bytes are unavailable.');
		var file = await readFile();
		if (!(file instanceof Blob) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 300000000) throw new Error('Invalid attachment size.');
		var fingerprint = await _blobFingerprint(file), requestId = 'attachment-' + crypto.randomUUID(), generation = crypto.randomUUID();
		try {
			var begin = await _nativeHostCall('notes.attachment.begin', {requestId, generation, name,
				payloadLength: fingerprint.bytes, payloadDigest: fingerprint.digest});
			if (begin?.generation !== generation || !Number.isSafeInteger(begin.chunkBytes) ||
				begin.chunkBytes < 1 || begin.chunkBytes > NATIVE_TRANSFER_CHUNK_BYTES) throw new Error('Invalid attachment transfer.');
			for (var offset = 0, sequence = 0; offset < file.size; sequence++) {
				var bytes = new Uint8Array(await file.slice(offset, offset + begin.chunkBytes).arrayBuffer());
				var answer = await _nativeHostCall('notes.attachment.chunk', {requestId, sequence, bytes}, 30000, begin.generation);
				offset += bytes.length;
				if (answer?.sequence !== sequence || answer.received !== offset) throw new Error('The attachment transfer is incomplete.');
			}
			return await _nativeHostCall('notes.attachment.open', {requestId, generation: begin.generation}, 1800000);
		} catch (error) {
			_nativeHostNotify('notes.attachment.cancel', {requestId, generation});
			throw error;
		}
	}

	async function _nativeShare(blob, filename, mime, options) {
		if (!hasNative) return false;
		var fingerprint = await _blobFingerprint(blob);
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
			if (purpose === 'open' && await RapierDocumentClaim.find({handle})) return null;
			const file = await handle.getFile();
			const read = purpose === 'open' ? null : await RapierTextCodec.readDocumentRecord(file);
			const content = read ? {text: read.text, bom: read.bom, encoding: read.encoding} : {blob: file};
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

	function _webForgetAuthority(id) {
		if (!id) return;
		if (_webFileRuntime.activeAuthority === id) {
			_webFileRuntime.activeAuthority = '';
			try { RapierDocumentClaim.release(); } catch (_) {}
		}
		_clearPlatformFileBinding(id);
		_webFileRuntime.liveHandles.delete(id);
		_webFileRuntime.reportedGenerations.delete(id);
	}

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
		if (!record.document) record.document = _platformBoundDocument(id);
		var epoch = _webEpoch(id);
		if (!id || !record.handle || _webFileRuntime.retired.has(id)) return { bound: false, persisted: false };
		if (requireEngineAuthority && !_engineOwnsDocumentAuthority(id)) {
			return { bound: false, persisted: false };
		}
		if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) return { bound: false, persisted: false };
		_webFileRuntime.activeAuthority = id;
		_webFileRuntime.liveHandles.set(id, record);
		_webFileRuntime.reportedGenerations.delete(id);
		_setPlatformFileBinding(id, record.generation, true, null, record.document || _platformBoundDocument(id));
		var key = persistedKey || ('authority:' + id);
		var slot = _webFileSlot();
		var storedRecord = {handle: record.handle, generation: record.generation, document: record.document};
		if (slot) storedRecord.slot = slot;
		var stored = await _idbPut(key, storedRecord);
		if (_webFileRuntime.retired.has(id) || _webEpoch(id) !== epoch || (requireEngineAuthority && !_engineOwnsDocumentAuthority(id))) {
			_webForgetAuthority(id);
			await _idbDeleteHandle(key);
			return { bound: false, persisted: false };
		}
		return { bound: true, persisted: stored === true };
	}

	async function _webBindCurrentFileNow(authority, value, persistedKey) {
		var id = String(authority || '').trim();
		if (!id) return { bound: false, persisted: false };
		_webFileRuntime.retired.delete(id);
		if (_webFileRuntime.activeAuthority && _webFileRuntime.activeAuthority !== id) await _webDropCurrentFileNow(_webFileRuntime.activeAuthority);
		if (value && value.handle) void RapierDocumentClaim.hold({handle: value.handle});
		return _webRefreshCurrentFileNow(id, value, persistedKey);
	}

	async function _webDropCurrentFileNow(authority) {
		var id = String(authority || '').trim();
		if (!id) return false;
		_webFileRuntime.retired.add(id);
		_webBumpEpoch(id);
		_webForgetAuthority(id);
		return _idbDeleteHandle('authority:' + id);
	}

	async function _webForgetCurrentFileNow(authority) {
		var id = String(authority || '').trim();
		if (!id || _webFileRuntime.retired.has(id)) return false;
		_webBumpEpoch(id);
		_webForgetAuthority(id);
		return _idbDeleteHandle('authority:' + id);
	}

	function _webDetachCurrentFile() {
		var expectedAuthority = arguments.length ? String(arguments[0] || '').trim() : String(_webFileRuntime.activeAuthority || '');
		if (!expectedAuthority) return Promise.resolve(false);
		_webFileRuntime.retired.add(expectedAuthority);
		_webBumpEpoch(expectedAuthority);
		_webForgetAuthority(expectedAuthority);
		return _queueWebBindingMutation(function () {
			return _webDropCurrentFileNow(expectedAuthority);
		});
	}

	function _webAcceptOpenedDocument(payload) {
		payload = payload || {};
		var handle = payload.webFileHandle;
		var authority = String(payload.documentAuthority || '').trim();
		if (!handle) return Promise.resolve({ bound: true, persisted: false });
		if (!authority) return Promise.resolve({ bound: false, persisted: false });
		var record = { handle: handle, generation: payload.fileGeneration == null ? null : payload.fileGeneration,
			document: _platformDocumentDescriptor(payload.name, payload.editablePage === true) };
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
			await _queueWebBindingMutation(function () { return _webForgetCurrentFileNow(authority); });
			return _webPickerSave(blob, filename, options, key);
		}

		var writeOptions = Object.assign({}, options || {});
		if (writeOptions.fileGeneration == null && record.generation != null) {
			writeOptions.fileGeneration = record.generation;
		}
		try {
			var result = await _writeToHandle(record.handle, blob, writeOptions);
			var nextRecord = { handle: record.handle, generation: result.fileGeneration,
				document: _platformDocumentDescriptor(record.handle.name || filename, options?.editablePage) || record.document };
			await _queueWebBindingMutation(function () {
				return _webRefreshCurrentFileNow(authority, nextRecord, key, true);
			});
			return result;
		} catch (error) {
			if (error && error.code === 'external_file_changed') throw error;
			await _queueWebBindingMutation(function () { return _webForgetCurrentFileNow(authority); });
			throw error;
		}
	}

	 
	var RECENTS_CAP = 24;

	const _defaultProState = Object.freeze({
		available: false,
		unlocked: true,
		billingStatus: 'not-applicable',
		purchasePending: false,
		message: '',
	});
	const _lockedProState = Object.freeze({
		available: false,
		unlocked: false,
		billingStatus: 'unavailable',
		purchasePending: false,
		message: '',
	});
	function _nativeAdultGate() {
		var gate = globalThis.RapierAdultGate;
		if (_nativeHostRuntime.state.platformId !== 'android' || !gate || typeof gate.check !== 'function') return Promise.resolve(true);
		return Promise.resolve(gate.check()).then(function (passed) { return passed === true; }, function () { return false; });
	}
	function _nativeProAuthority() {
		var id = String(_nativeHostRuntime.state.platformId || _nativePlatformId).toLowerCase();
		return !!(hasNative && (id === 'android' || id === 'native'));
	}

	function _normalizeProState(raw) {
		if (!_nativeProAuthority()) return _defaultProState;
		var value = raw;
		if (!value || typeof value !== 'object') return _lockedProState;
		var explicitlyAvailable = value.available === true;
		return {
			available: explicitlyAvailable,
			unlocked: explicitlyAvailable && value.unlocked === true,
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

	function _applyNativeResources(value, silent = false) {
		if (!value || typeof value !== 'object') return;
		var held = _nativeHostRuntime.state.resources, said = Array.isArray(value.packs) ? value.packs : [value];
		if (Array.isArray(value.packs)) _nativeHostRuntime.state.resources = { packs: value.packs.slice() };
		else if (value.pack && held && Array.isArray(held.packs)) {
			var packs = held.packs.slice(), at = packs.findIndex(function (row) { return row && row.pack === value.pack; });
			if (at < 0) packs.push(value); else packs[at] = value;
			_nativeHostRuntime.state.resources = { packs: packs };
		} else _nativeHostRuntime.state.resources = value;
		if (silent) return;
		said.forEach(function (row) {
			if (!row || typeof row !== 'object') return;
			try {
				window.dispatchEvent(new CustomEvent('rapier:platform-resources', {
					detail: { status: String(row.status || 'absent'), progress: Number(row.progress) || 0, error: row.error || null,
						plugins: row.plugins == null ? null : String(row.plugins).split(',') },
				}));
			} catch (_) {}
		});
	}
	function _nativeResourcePack(resource) {
		var state = _nativeHostRuntime.state.resources, key = String(resource).split('-')[0];
		var packs = state && Array.isArray(state.packs) ? state.packs : state ? [state] : [];
		return packs.find(function (row) { return row && String(row.plugins || '').split(',').indexOf(key) >= 0; }) || null;
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
		_nativeHostRuntime.state.support = _nativeCapability('support') && value.support && typeof value.support === 'object'
			? value.support : null;
		_nativeHostRuntime.state.launcherIcon = value.launcherIcon && typeof value.launcherIcon === 'object'
			? Object.assign({}, value.launcherIcon)
			: { color: 'black' };
		_nativeHostRuntime.state.recents = Array.isArray(value.recents) ? value.recents : [];
		_nativeHostRuntime.state.pendingIntake = !!value.pendingIntake;
		_nativeHostRuntime.state.recoveryAutoResume = value.recoveryAutoResume === true;
		_nativeHostRuntime.state.notesStoreGeneration = typeof value.notesStoreGeneration === 'string' ? value.notesStoreGeneration : null;
		if (_nativeHostRuntime.transport && _nativeHostRuntime.transport.connected().lane !== (_nativeCapability('binaryTransport') ? 'binary' : 'base64')) _nativeHostRuntime.transport = null;
		if (_nativeIntakeRuntime.transport && _nativeIntakeRuntime.transport.connected().lane !== (_nativeCapability('binaryTransport') ? 'binary' : 'base64')) _nativeIntakeRuntime.transport = null;
		if (value.currentFileBound === true && value.currentFileAuthority) {
			_setNativeCurrentFileBinding(value.currentFileAuthority, value.currentFileGeneration);
		} else if (value.currentFileBound === false) {
			_clearPlatformFileBinding();
		}
		if (value.installation && typeof value.installation === 'object') _nativeHostRuntime.state.installation = value.installation;
		if (value.windowInsets) _applyNativeWindowInsets(value.windowInsets);
		if (value.resources) _applyNativeResources(value.resources);
		if (Array.isArray(value.partPacks)) _nativeHostRuntime.state.partPacks = value.partPacks.map(String);
		try { window.dispatchEvent(new CustomEvent('rapier:platform-state', { detail: value })); } catch (_) {}
	}

	_nativeHostRuntime.ready = hasNative
		? _nativeHostCall('platform.state', {}, 15000).then(function (state) {
				_applyNativeHostState(state);
				return state;
			}).catch(function (error) {
				_nativeHostRuntime.state.pro = null;
				_emitPro(_currentProState());
				try { console.warn('[rapier-platform] native platform state unavailable; continuing with portable defaults and Pro locked', error); } catch (_) {}
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

	const _nativeReview = (() => {
		let token = '', serial = 0, listening = false;
		const saved = new Set();
		const enabled = () => _nativeCapability('reviewPrompt') && _nativeHostRuntime.state.platformId === 'android';
		const idle = () => document.visibilityState === 'visible' && typeof rapier !== 'undefined' &&
			!rapier.composition.block && !rapier.composition.source &&
			!(typeof _rapierMutationBarrierActive === 'function' && _rapierMutationBarrierActive()) &&
			!(_rapierDrawPart?.state.open || _rapierDrawPart?.state.finishing) &&
			!(typeof _rapierDialogRuntime !== 'undefined' && _rapierDialogRuntime.open.size) &&
			!document.activeElement?.matches?.('input, textarea, [contenteditable]:not([contenteditable="false"])');
		const cancel = () => {
			if (!token) return;
			token = '';
			_nativeHostNotify('review.cancel');
		};
		function listen() {
			if (listening) return;
			listening = true;
			for (const name of ['pointerdown', 'keydown', 'beforeinput', 'compositionstart']) {
				document.addEventListener(name, event => { if (event.isTrusted) cancel(); }, true);
			}
			document.addEventListener('visibilitychange', cancel);
			window.addEventListener('blur', cancel);
		}
		return Object.freeze({
			saved(identity) {
				if (!enabled() || typeof identity !== 'string' || !identity.startsWith('note:') ||
					identity.length <= 5 || identity.length > 256 || saved.has(identity) || saved.size >= 10) return;
				saved.add(identity);
				_nativeHostCall('review.saved', {identity}).then(value => {
					if (value?.saved !== true) saved.delete(identity);
				}, () => { saved.delete(identity); });
			},
			finished(kind) {
				if (!enabled()) return;
				listen(); cancel();
				if (!idle() || !['drawing-done', 'saved-document-left'].includes(kind)) return;
				const current = token = String(++serial);
				_nativeHostCall('review.finished', {kind, token: current}).catch(() => { if (token === current) token = ''; });
			},
			ready(detail) {
				if (!enabled() || !token || detail?.token !== token) return;
				if (!idle()) { cancel(); return; }
				const current = token; token = '';
				_nativeHostNotify('review.launch', {token: current});
			},
		});
	})();

	const _SR_EXTENSION = 'website.rapier/speedracer';
	const _srState = Object.seal({
		origin: null, sequence: 0, pending: new Map(), calls: new Map(), tools: new Map(), granted: null, openLinks: false,
		preferences: Object.create(null), preferenceVersion: 0,
		current: null, currentVersion: 0, recents: [], recentsVersion: 0,
		recovery: null, recoveryVersion: 0, recoveryWriteUncertain: false,
		writeChain: Promise.resolve(), recoveryChain: Promise.resolve(),
	});
	function _srPost(message) {
		window.parent.postMessage(Object.assign({ jsonrpc: '2.0' }, message), _srState.origin || '*');
	}
	function _srRequest(method, params) {
		return new Promise(function (resolve, reject) {
			var id = ++_srState.sequence;
			_srState.pending.set(id, { method: method, resolve: resolve, reject: reject });
			_srPost({ id: id, method: method, params: params || {} });
		});
	}
	function _srCall(service, verb, params) {
		if (!_srState.granted || !_srState.granted[service]) {
			return Promise.reject(Object.assign(new Error('The speedracer host did not grant ' + service + '.'), { code: 'denied' }));
		}
		return _srRequest('speedracer/' + service + '/' + verb, params);
	}
	function _srMissingOnly(error) {
		if (error && (error.code === 'not_found' || error.code === 'revoked')) return null;
		throw error;
	}
	if (hasSpeedracer) window.addEventListener('message', function (event) {
		var message = event.data;
		if (event.source !== window.parent || !message || message.jsonrpc !== '2.0') return;
		if (_srState.origin === null) {
			var first = _srState.pending.get(message.id);
			if (!first || first.method !== 'ui/initialize' || message.method || event.origin === 'null') return;
			_srState.origin = event.origin;
		}
		if (event.origin !== _srState.origin) return;
		if (message.method) { if (_srState.granted) _srServe(message); return; }
		var waiter = _srState.pending.get(message.id);
		if (!waiter) return;
		_srState.pending.delete(message.id);
		if (!message.error) { waiter.resolve(message.result || {}); return; }
		var data = message.error.data || {};
		waiter.reject(Object.assign(new Error(String(message.error.message || 'The speedracer host refused.')),
			{ code: String(data.reason || 'failed'), version: data.version }));
	});
	async function _srServe(message) {
		var params = message.params || {};
		if (message.method === 'notifications/cancelled') {
			var running = _srState.calls.get(params.requestId);
			if (running) running.abort();
			return;
		}
		if (message.id == null) return;
		var reply = { id: message.id };
		try {
			if (message.method === 'tools/list') {
				reply.result = { tools: Array.from(_srState.tools.values(), function (tool) {
					return { name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations };
				}) };
			} else if (message.method === 'tools/call') {
				reply.result = await _srCallTool(message.id, params);
			} else if (message.method === 'ui/resource-teardown') {
				var kept = await _platformCheckpoint(0);
				await Promise.all([_srState.writeChain, _srState.recoveryChain]);
				if (!kept) throw new Error('rapier could not keep its work.');
				reply.result = {};
			} else if (message.method === 'ping') {
				reply.result = {};
			} else {
				reply.error = { code: -32601, message: 'Method not found' };
			}
		} catch (error) {
			reply.error = { code: -31010, message: String(error && error.message || error), data: { reason: 'failed' } };
		}
		_srPost(reply);
	}
	async function _srCallTool(id, params) {
		var tool = _srState.tools.get(String(params.name || ''));
		if (!tool) throw new Error('rapier has no tool named ' + String(params.name || '') + '.');
		var meta = params._meta && params._meta[_SR_EXTENSION] || {};
		var controller = new AbortController();
		_srState.calls.set(id, controller);
		try {
			var value = await tool.execute(params.arguments || {}, { signal: controller.signal, id: String(id),
				agent: typeof meta.agent === 'string' ? meta.agent.slice(0, 96) : '' });
			return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
		} catch (error) {
			return { content: [{ type: 'text', text: String(error && error.message || error) }], isError: true };
		} finally {
			_srState.calls.delete(id);
		}
	}
	const _SR_RECOVERY_MAGIC = new Uint8Array([82, 80, 82, 50]);
	const _SR_RECOVERY_HEADER_MAX_BYTES = 64 * 1024;
	function _srRecoveryStateManifest(value) {
		var state = value && typeof value === 'object' ? value : {};
		var snapshot = state.snapshot && typeof state.snapshot === 'object' ? state.snapshot : {};
		return JSON.stringify([
			String(snapshot.filename || 'untitled.md'),
			snapshot.bom === true,
			String(snapshot.documentAuthority || ''),
			snapshot.virtualDocumentKind === 'welcome' ? 'welcome' : '',
			snapshot.saveAsRequired === true,
			String(snapshot.docKind || 'markdown'),
			Number(state.generation || 0),
			Number(state.documentRevision || 0),
			typeof state.savedGeneration === 'number' ? state.savedGeneration : null,
			state.savedBaseline,
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
				bom: snapshot.bom === true,
				encoding: snapshot.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8',
				documentAuthority: String(snapshot.documentAuthority || ''),
				virtualDocumentKind: snapshot.virtualDocumentKind === 'welcome' ? 'welcome' : '',
				saveAsRequired: snapshot.saveAsRequired === true,
				docKind: String(snapshot.docKind || 'markdown'),
			},
		});
		var canonical = RapierTextCodec.normalizeDocument(String(snapshot.canonicalText || ''));
		var undo = metadata.undo; delete metadata.undo;
		if (!_srUndoIntegrityMatches(undo) || undo.schemaVersion !== 5) throw new Error('Canonical recovery history is required.');
		var sourceBytes = new TextEncoder().encode(canonical), undoBytes = new TextEncoder().encode(JSON.stringify(undo));
		metadata.schemaVersion = 5;
		metadata.canonicalBytes = sourceBytes.byteLength; metadata.undoBytes = undoBytes.byteLength;
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
		return new Blob([prefix, header, sourceBytes, undoBytes], { type: 'application/vnd.rapier.recovery' });
	}
	async function _srRecoveryPayload(content) {
		if (!(content instanceof Blob)) throw new Error('Invalid Rapier recovery payload.');
		var bytes = new Uint8Array(await content.arrayBuffer());
		if (bytes.byteLength < 8 ||
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
		if (metadata.schemaVersion !== 5 || metadata.integritySchema !== 1) {
			throw new Error('Unsupported Rapier recovery schema.');
		}
		if (!_srRecoveryStateIntegrityMatches(metadata)) {
			throw new Error('Rapier recovery metadata failed integrity verification.');
		}
		if (!Number.isSafeInteger(metadata.canonicalBytes) || metadata.canonicalBytes < 0 ||
				metadata.canonicalBytes > RapierTextCodec.maxDocumentBytes || !Number.isSafeInteger(metadata.undoBytes) || metadata.undoBytes < 1 ||
				8 + headerLength + metadata.canonicalBytes + metadata.undoBytes !== bytes.byteLength) throw new Error('Invalid Rapier recovery lengths.');
		var sourceEnd = 8 + headerLength + metadata.canonicalBytes;
		var canonicalText = RapierTextCodec.decodeDocumentUtf8(bytes.subarray(8 + headerLength, sourceEnd));
		var undo = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(sourceEnd)));
		if (!_srUndoIntegrityMatches(undo) || undo.schemaVersion !== 5 ||
				undo.checkpointId !== metadata.checkpointId || undo.sourceRootId !== metadata.sourceRootId ||
				undo.generation !== metadata.generation || undo.documentRevision !== metadata.documentRevision ||
				undo.historyComplete !== metadata.historyComplete || undo.documentAuthority !== metadata.snapshot.documentAuthority ||
				undo.virtualDocumentKind !== metadata.snapshot.virtualDocumentKind || undo.saveAsRequired !== metadata.snapshot.saveAsRequired ||
				undo.docKind !== metadata.snapshot.docKind || undo.filename !== metadata.snapshot.filename)
			throw new Error('Rapier recovery history does not describe its document.');
		metadata.undo = undo;
		if (!_rapierIntegrityMatches(
				metadata.contentIntegrity,
				_rapierTextIntegrity(canonicalText)
		)) {
			throw new Error('Rapier recovery content failed integrity verification.');
		}
		metadata.snapshot = Object.assign({}, metadata.snapshot, { canonicalText: canonicalText });
		var snapshot = metadata.snapshot;
		var snapshotAdmissible = typeof snapshot.filename === 'string' && _rapierDocumentNameIsAdmissible(snapshot.filename) &&
			typeof snapshot.bom === 'boolean' &&
			(snapshot.encoding === undefined || snapshot.encoding === 'utf-8' || snapshot.encoding === 'windows-1252') &&
			typeof snapshot.documentAuthority === 'string' && !!snapshot.documentAuthority &&
			(snapshot.virtualDocumentKind === '' || snapshot.virtualDocumentKind === 'welcome') &&
			typeof snapshot.saveAsRequired === 'boolean' &&
			['markdown', 'text', 'code'].indexOf(snapshot.docKind) >= 0;
		var countersAdmissible = Number.isSafeInteger(metadata.generation) && metadata.generation >= 0 &&
			Number.isSafeInteger(metadata.documentRevision) && metadata.documentRevision >= 0 &&
			Number.isSafeInteger(metadata.nextBlockId) && metadata.nextBlockId >= 1 &&
			(metadata.savedGeneration === null ||
				(Number.isSafeInteger(metadata.savedGeneration) && metadata.savedGeneration >= -1));
		if (!snapshotAdmissible || !countersAdmissible || !_rapierSavedBaselineValid(metadata.savedBaseline) || typeof metadata.historyComplete !== 'boolean' ||
				typeof metadata.dirty !== 'boolean' || typeof metadata.checkpointId !== 'string' || !metadata.checkpointId ||
				typeof metadata.sourceRootId !== 'string' || !metadata.sourceRootId ||
				(metadata.baseFileGeneration !== null && typeof metadata.baseFileGeneration !== 'string')) {
			throw new Error('Rapier recovery metadata is inadmissible.');
		}
		metadata.integrityVerified = true;
		return metadata;
	}
	function _srSameDocument(recovery, filePayload) {
		return !!(recovery && recovery.snapshot && filePayload
			&& recovery.snapshot.saveAsRequired !== true && recovery.snapshot.bom === filePayload.bom
			&& (recovery.snapshot.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8') === (filePayload.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8')
			&& String(recovery.snapshot.canonicalText || '') === String(filePayload.text || ''));
	}
	function _srRecoveryKind(recovery, filePayload) {
		if (!recovery || !recovery.snapshot) return filePayload ? 'file' : null;
		var authority = String(recovery.snapshot.documentAuthority || '');
		if (recovery.dirty !== true && authority && authority === String(filePayload && filePayload.documentAuthority || '')) {
			return _srSameDocument(recovery, filePayload) && recovery.snapshot.filename === filePayload.name
				? 'recovery-bound' : 'recovery-conflict';
		}
		if (recovery.dirty !== true) return filePayload ? 'file' : 'recovery-transient';
		if (_srSameDocument(recovery, filePayload)) return filePayload ? 'file' : 'recovery-transient';
		var base = recovery.baseFileGeneration == null ? null : String(recovery.baseFileGeneration);
		var current = filePayload && filePayload.generation != null ? String(filePayload.generation) : null;
		if (!filePayload || !base) return 'recovery-transient';
		if (current != null && base === current) return 'recovery-bound';
		return 'recovery-conflict';
	}
	function _srQueuePut(key, value, versionField) {
		_srState.writeChain = _srState.writeChain.catch(function () { return null; }).then(async function () {
			var result = await _srCall('store', 'put', { key: key, value: value, ifVersion: _srState[versionField] });
			_srState[versionField] = result.version;
			return result;
		});
		return _srState.writeChain;
	}
	function _srRememberRecent(record) {
		if (!record || !record.id) return;
		var next = { id: record.id, name: String(record.name || 'document'), ts: Date.now() };
		_srState.recents = [next].concat(_srState.recents.filter(function (item) { return item && item.id !== next.id; })).slice(0, 24);
		_srQueuePut('recents', _srState.recents, 'recentsVersion').catch(function (error) {
			try { console.warn('[rapier-platform] could not retain recent File metadata', error); } catch (_) {}
		});
		try { window.dispatchEvent(new CustomEvent('rapier:recent-files-changed')); } catch (_) {}
	}
	function _srPersistCurrent(record) {
		_srState.current = record;
		_srRememberRecent(record);
		return _srQueuePut('document', record, 'currentVersion');
	}
	function _srDetachCurrent(expectedAuthority) {
		var expected = String(expectedAuthority || '').trim();
		if (expected && expected !== _srCurrentAuthority()) return Promise.resolve(false);
		_srState.current = null;
		return _srQueuePut('document', null, 'currentVersion');
	}
	function _srCurrentAuthority() {
		return String(_srState.current && _srState.current.documentAuthority || '').trim();
	}
	function _srAdmitName(name) {
		if (!_rapierDocumentNameIsAdmissible(name)) throw new Error('The speedracer host returned an invalid or overlong document name.');
		return name;
	}
	function _srOpened(file, writable) {
		var name = _srAdmitName(String(file.name || ''));
		return { blob: new File([file.content], name, { type: String(file.type || '') }), name: name,
			handle: writable ? String(file.id) : null, generation: writable ? String(file.version) : null, transient: !writable };
	}
	async function _srResume(record) {
		var file = await _srCall('files', 'read', { id: record.id });
		var name = _srAdmitName(String(file.name || ''));
		var read = await RapierTextCodec.readDocumentRecord(file.content);
		return { text: read.text, bom: read.bom, encoding: read.encoding, name: name, handle: String(file.id), generation: String(file.version),
			documentAuthority: String(record.documentAuthority || '').trim(), transient: false };
	}
	async function _srInitialise() {
		var answer = await Promise.race([_srRequest('ui/initialize', {
			protocolVersion: '2026-01-26',
			appInfo: { name: 'rapier', version: String(document.querySelector('meta[name="rapier-version"]')?.content || '') },
			appCapabilities: { tools: { listChanged: true }, extensions: { [_SR_EXTENSION]: {} } },
		}), new Promise(function (resolve) { setTimeout(resolve, 10000); })]);
		var host = answer && answer.hostCapabilities || {};
		var granted = host.extensions && host.extensions[_SR_EXTENSION];
		if (!granted || !granted.store || !granted.files) {
			_srState.granted = false;
			_srState.pending.clear();
			throw new Error('rapier needs the person\'s store and files from its speedracer host.');
		}
		_srState.granted = granted;
		_srState.openLinks = !!host.openLinks;
		_srPost({ method: 'ui/notifications/initialized', params: {} });
		var records = await Promise.all(['preferences', 'document', 'recents', 'recovery'].map(function (key) {
			return _srCall('store', 'get', { key: key });
		}));
		if (records[0].value && typeof records[0].value === 'object') _srState.preferences = records[0].value;
		_srState.preferenceVersion = records[0].version;
		_srState.current = records[1].value && records[1].value.id ? records[1].value : null;
		_srState.currentVersion = records[1].version;
		if (Array.isArray(records[2].value)) _srState.recents = records[2].value;
		_srState.recentsVersion = records[2].version;
		_srState.recovery = records[3].value;
		_srState.recoveryVersion = records[3].version;
		return answer;
	}
	const _srReady = hasSpeedracer ? _srInitialise() : Promise.resolve(null);
	var _srBootDecision = null;
	function _srBoot() {
		return _srBootDecision || (_srBootDecision = _srDecideBoot());
	}
	async function _srDecideBoot() {
		await _srReady;
		_srState.recovery = _srState.recovery ? await _srRecoveryPayload(_srState.recovery) : null;
		var filePayload = null;
		if (_srState.current) {
			try { filePayload = await _srResume(_srState.current); }
			catch (error) {
				_srMissingOnly(error);
				await _srDetachCurrent().catch(function () { return null; });
			}
		}
		var recoveryKind = _srRecoveryKind(_srState.recovery, filePayload);
		if (recoveryKind === 'recovery-transient' || recoveryKind === 'recovery-conflict') {
			await _srDetachCurrent().catch(function () { return null; });
			_srState.recovery.snapshot.saveAsRequired = true;
			_srState.recovery.savedGeneration = null;
			_srState.recovery.savedBaseline = null;
			_srState.recovery.baseFileGeneration = null;
		}
		return recoveryKind && recoveryKind.indexOf('recovery-') === 0
			? { kind: recoveryKind, recovery: _srState.recovery, file: filePayload }
			: (filePayload ? { kind: 'document', file: filePayload } : null);
	}

	async function _srCreate(blob, name, settles, options) {
		await _srReady;
		if (options && options.beforeWrite) await options.beforeWrite;
		if (options && options.check) options.check();
		var created = await _srCall('files', 'create', { name: name, type: blob.type || 'text/plain', content: blob });
		if (created.cancelled === true) return false;
		if (!settles) return true;
		var fingerprint = await _srVerifyWritten(String(created.id), String(created.version), blob);
		var destinationName = _rapierDocumentNameIsAdmissible(String(created.name || '')) ? String(created.name) : '';
		var authority = String(options && options.documentAuthority || '').trim();
		if (_engineOwnsDocumentAuthority(authority) && (!_srCurrentAuthority() || _srCurrentAuthority() === authority)) {
			try {
				if (destinationName) await _srPersistCurrent({ id: String(created.id), name: destinationName, generation: String(created.version), documentAuthority: authority, editablePage: options?.editablePage });
				else await _srDetachCurrent(authority);
			} catch (error) { try { console.warn('[rapier-platform] File saved but its resume pointer was not retained', error); } catch (_) {} }
		}
		return _saveResult('confirmed', { verified: true, bytes: fingerprint.bytes, fingerprint: fingerprint.digest,
			fileGeneration: String(created.version), destinationName: destinationName });
	}
	function _srSaveAs(blob, filename, options) { return _srCreate(blob, filename || 'document.md', true, options); }
	async function _srVerifyWritten(id, version, blob) {
		var expected = await _blobFingerprint(blob);
		var read = await _srCall('files', 'read', { id: id });
		var content = read && read.content;
		var bytes = content instanceof Blob ? content : (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) ? new Blob([content]) : null;
		var actual = bytes && String(read.version) === version ? await _blobFingerprint(bytes) : null;
		if (!actual || actual.bytes !== expected.bytes || actual.digest !== expected.digest) {
			throw new Error('The speedracer host accepted the write but Rapier could not verify it.');
		}
		return expected;
	}
	async function _srSaveInPlace(blob, filename, options) {
		await _srReady;
		if (options && options.beforeWrite) await options.beforeWrite;
		if (options && options.check) options.check();
		var authority = String(options && options.documentAuthority || '').trim();
		var bound = _srState.current;
		if (!bound || !authority || authority !== _srCurrentAuthority()) {
			if (options && options.requireExistingDestination === true) throw _requiresDestinationError();
			return _srSaveAs(blob, filename, options);
		}
		var written = await _srCall('files', 'write', { id: bound.id, content: blob, ifVersion: bound.generation });
		var name = _rapierDocumentNameIsAdmissible(String(written.name || bound.name)) ? String(written.name || bound.name) : '';
		var generation = String(written.version);
		var fingerprint = await _srVerifyWritten(bound.id, generation, blob);
		if (_engineOwnsDocumentAuthority(authority) && _srState.current === bound) {
			try {
				if (name) await _srPersistCurrent({ id: bound.id, name: name, generation: generation, documentAuthority: authority, editablePage: options?.editablePage });
				else await _srDetachCurrent(authority);
			} catch (error) { try { console.warn('[rapier-platform] File saved but its resume pointer was not retained', error); } catch (_) {} }
		}
		return _saveResult('confirmed', { verified: true, bytes: fingerprint.bytes, fingerprint: fingerprint.digest,
			fileGeneration: generation, destinationName: name });
	}

	function _createSpeedracerPlatform() {
		return {
			id: 'speedracer',
			canSaveInPlace: true,
			showsRecentFilesUi: true,
			get ownsPreferenceStore() { return _srState.granted !== false; },
			get ownsRecoveryStore() { return _srState.granted !== false; },
			get ownsRecoveryWriterBoundary() { return _srState.granted !== false; },
			allowsBrowserPrintFallback: true,
			ready: function () { return _srReady; },
			preference: function (key, fallback) {
				return Object.prototype.hasOwnProperty.call(_srState.preferences, key) ? _srState.preferences[key] : fallback;
			},
			setPreference: function (key, value) {
				_srState.preferences[key] = value;
				return _srQueuePut('preferences', Object.assign({}, _srState.preferences), 'preferenceVersion');
			},
			getProState: function () { return _defaultProState; },
			purchasePro: function () { return Promise.resolve(_defaultProState); },
			restorePro: function () { return Promise.resolve(_defaultProState); },
			refreshPro: function () { return Promise.resolve(_defaultProState); },
			takeBootDocument: async function () {
				var value = await _srBoot();
				_srBootDecision = Promise.resolve(null);
				return value;
			},
			registerOperations: async function (tools) {
				await _srReady;
				_srState.tools = new Map(tools.map(function (tool) { return [tool.name, tool]; }));
				_srPost({ method: 'notifications/tools/list_changed', params: {} });
			},
			currentFileGeneration: function (documentAuthority) {
				var expected = String(documentAuthority || '').trim();
				return expected && expected === _srCurrentAuthority() ? _srState.current.generation : null;
			},
			currentFileAuthority: _srCurrentAuthority,
			openDocument: async function () {
				await _srReady;
				var file = await _srCall('files', 'open', {});
				return file.cancelled === true ? null : _srOpened(file, true);
			},
			acceptOpenedDocument: function (payload) {
				if (!payload || !payload.handle) return Promise.resolve({ bound: false });
				return _srPersistCurrent({ id: payload.handle, name: payload.name, generation: payload.generation,
					documentAuthority: String(payload.documentAuthority || '').trim(), editablePage: payload.editablePage === true }).then(function () { return { bound: true }; }, function (error) {
					try { console.warn('[rapier-platform] document opened but its resume pointer was not retained', error); } catch (_) {}
					return { bound: true };
				});
			},
			detachCurrentFile: function (documentAuthority) { return _srDetachCurrent(documentAuthority); },
			hasWritableHandle: function (documentAuthority) {
				var expected = String(documentAuthority || '').trim();
				return !!expected && expected === _srCurrentAuthority();
			},
			chooseCompareDocument: async function () {
				await _srReady;
				var file = await _srCall('files', 'open', { readOnly: true });
				if (file.cancelled === true) return null;
				var read = await RapierTextCodec.readDocumentRecord(file.content);
				return { text: read.text, bom: read.bom, name: _srAdmitName(String(file.name || '')), transient: true };
			},
			saveAs: _srSaveAs,
			saveInPlace: _srSaveInPlace,
			exportArtifact: function (blob, filename, options) {
				return _srCreate(blob, filename || 'download', false, options);
			},
			persistRecovery: function (payload) {
				_srState.recoveryChain = _srState.recoveryChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					if (_srState.recoveryWriteUncertain) throw new Error('Recovery publication is uncertain; reopen before writing again.');
					var blob = _srRecoveryBlob(payload);
					var verified = await _srRecoveryPayload(blob);
					var result;
					try {
						result = await _srCall('store', 'put', { key: 'recovery', value: blob, ifVersion: _srState.recoveryVersion });
						if (!Number.isSafeInteger(result.version)) throw new Error('Recovery publication was not acknowledged.');
					} catch (error) {
						_srState.recoveryWriteUncertain = true;
						throw error;
					}
					_srState.recoveryVersion = result.version;
					_srState.recovery = verified;
					return result;
				});
				return _srState.recoveryChain;
			},
			clearRecovery: function () {
				_srState.recoveryChain = _srState.recoveryChain.catch(function () { return null; }).then(async function () {
					await _srReady;
					if (_srState.recoveryWriteUncertain) throw new Error('Recovery publication is uncertain; reopen before clearing it.');
					var result = await _srCall('store', 'delete', { key: 'recovery', ifVersion: _srState.recoveryVersion });
					_srState.recoveryVersion = 0;
					_srState.recovery = null;
					return result;
				});
				return _srState.recoveryChain;
			},
			externalOpen: async function (url) {
				await _srReady;
				if (!_srState.openLinks) return false;
				await _srRequest('ui/open-link', { url: String(url || '') });
				return true;
			},
			hasPendingBootDocument: function () { return !!(_srState.current || _srState.recovery); },
			finishBoot: function () {},
			clearDocumentIntake: function () {},
			getRecentFiles: function () {
				return _srState.recents.slice(0, 5).map(function (item) { return Object.assign({ key: item.id }, item); });
			},
			noteRecent: function (name) {
				if (_srState.current) _srRememberRecent({ id: _srState.current.id, name: name });
			},
			openRecent: async function (entry) {
				await _srReady;
				var file = await _srCall('files', 'read', { id: entry.id });
				try { window.dispatchEvent(new CustomEvent('rapier:platform-open', { detail: _srOpened(file, true) })); } catch (_) {}
				return true;
			},
			publishDirty: function (value) { if (_srState.granted) _srPost({ method: 'speedracer/notifications/status', params: { dirty: !!value } }); },
			publishTitle: function (value) { if (_srState.granted) _srPost({ method: 'speedracer/notifications/status', params: { title: String(value || 'rapier') } }); },
		};
	}

	async function _nativeRequestIntake(operation, args, purpose) {
		if (!hasNative) return null;
		_nativeIntakeRuntime.last = null;
		_nativeIntakeRuntime.failure = null;
		try { _rapierBootstrapRuntime.pendingIntake = null; } catch (_) {}
		_nativeIntakeRuntime.expecting = true;
		try {
			var result = await _nativeHostCall(operation, Object.assign({ purpose: purpose }, args || {}), operation === 'file.open' ? 3600000 : 120000);
			if (!result || result.cancelled === true || result.started === false) return null;
			return await _waitForNativeIntake();
		} finally {
			_nativeIntakeRuntime.expecting = false;
		}
	}

	const _rapierKeptRuntime = Object.seal({ bindings: new Map(), dirty: false, timer: 0, saving: false, saveTask: null, stored: true, held: false, told: false, watching: false });
	function _rapierKeep() {
		if (globalThis.RapierBenchSession?.active === true) return null;
		var keep = globalThis.RapierNotesKeep;
		try { return keep && keep.available() ? keep : null; } catch (_) { return null; }
	}
	function _rapierKeepCarried() {
		return globalThis.RapierBenchSession?.active !== true && typeof RapierParts !== 'undefined' && RapierParts.has('notes');
	}
	async function _rapierKeepFor(bound) {
		if (!bound) return null;
		if (!_rapierKeep() && _rapierKeepCarried()) await RapierParts.need('notes');
		return _rapierKeep();
	}
	const _RAPIER_KEPT_STORED = 16;
	function _rapierKeptStoredList() {
		try {
			var list = JSON.parse(localStorage.getItem(RapierStorage.keptBindings) || '[]');
			return Array.isArray(list) ? list.filter(function (entry) {
				return !!entry && typeof entry.authority === 'string' && /^\S{1,256}$/.test(entry.authority)
					&& typeof entry.file === 'string' && /^[^/\\\u0000]{1,1024}$/.test(entry.file)
					&& (entry.id === null || typeof entry.id === 'string') && typeof entry.digest === 'string' && /^[0-9a-f]{64}$/.test(entry.digest);
			}) : [];
		} catch (_) { return []; }
	}
	function _rapierKeptStore(authority, bound) {
		try {
			var list = authority ? _rapierKeptStoredList().filter(function (entry) { return entry.authority !== authority; }) : [];
			if (bound) list.unshift({ authority: authority, file: bound.file, id: bound.id, digest: bound.digest, document: bound.document });
			list = list.slice(0, _RAPIER_KEPT_STORED);
			if (list.length) localStorage.setItem(RapierStorage.keptBindings, JSON.stringify(list));
			else localStorage.removeItem(RapierStorage.keptBindings);
		} catch (_) {}
	}
	function _rapierKeptBinding(authority) {
		var id = String(authority || '').trim();
		if (!id) return null;
		if (_rapierKeptRuntime.bindings.has(id)) return _rapierKeptRuntime.bindings.get(id);
		if (!_rapierKeptRuntime.stored) return null;
		var entry = _rapierKeptStoredList().find(function (item) { return item.authority === id; });
		var bound = entry ? Object.freeze({ file: entry.file, id: entry.id, digest: entry.digest,
			document: entry.document && _platformDocumentDescriptor(entry.file, entry.document.editablePage) }) : null;
		_rapierKeptRuntime.bindings.set(id, bound);
		return bound;
	}
	async function _rapierKeptText(blob) { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await blob.arrayBuffer()); }
	function _rapierKeptBind(authority, kept, editablePage) {
		var id = String(authority || '').trim(), bound = Object.freeze({ file: kept.file, id: kept.id, digest: kept.digest,
			document: _platformDocumentDescriptor(kept.file, editablePage) });
		_rapierKeptRuntime.bindings.set(id, bound);
		_rapierKeptStore(id, bound);
		_rapierKeptAutosave();
		return { status: 'saved', confirmed: true, verified: true, fileGeneration: kept.digest, destinationName: kept.file, destinationSelected: true };
	}
	function _rapierKeptUnbind(authority) {
		var id = String(authority || '').trim();
		if (id) { _rapierKeptRuntime.bindings.set(id, null); _rapierKeptStore(id, null); return; }
		_rapierKeptRuntime.bindings.clear();
		_rapierKeptRuntime.stored = false;
		_rapierKeptStore('', null);
	}
	function _rapierKeptResume() {
		if (!_rapierKeptRuntime.held) return;
		_rapierKeptRuntime.held = false;
		_rapierKeptAutosave();
	}
	function _rapierKeptWatch() {
		if (_rapierKeptRuntime.watching) return;
		_rapierKeptRuntime.watching = true;
		addEventListener('rapier:kept-edited', _rapierKeptResume);
		document.addEventListener('visibilitychange', function () {
			if (document.visibilityState === 'visible') _rapierKeptResume();
		});
	}
	function _rapierKeptTerminal(result) {
		if (result === true || result && result.saved === true) return false;
		var status = result && typeof result.status === 'string' ? result.status : '';
		return status !== 'edit-in-progress' && status !== 'busy' && status !== 'cancelled' && status !== 'superseded';
	}
	function _rapierKeptFail() {
		_rapierKeptRuntime.held = true;
		clearInterval(_rapierKeptRuntime.timer);
		_rapierKeptRuntime.timer = 0;
		if (_rapierKeptRuntime.told) return;
		_rapierKeptRuntime.told = true;
		try { globalThis.RapierKeptSave?.failed?.(); } catch (_) {}
	}
	function _rapierKeptOwner() {
		try {
			var read = globalThis.RapierKeptSave && globalThis.RapierKeptSave.owner;
			var owner = typeof read === 'function' ? read() : null;
			if (!owner || typeof owner.authority !== 'string' || !owner.authority) return null;
			return {authority: owner.authority};
		} catch (_) { return null; }
	}
	function _rapierKeptOwns(started) {
		var now = _rapierKeptOwner();
		return !!started && !!now && now.authority === started.authority;
	}
	function _rapierKeptAutosave() {
		_rapierKeptWatch();
		if (_rapierKeptRuntime.held || !_rapierKeptRuntime.dirty || !_rapierKeptBinding(_engineDocumentAuthority())) { clearInterval(_rapierKeptRuntime.timer); _rapierKeptRuntime.timer = 0; return; }
		if (_rapierKeptRuntime.timer) return;
		_rapierKeptRuntime.timer = setInterval(function () {
			var authority = _engineDocumentAuthority(), bound = _rapierKeptBinding(authority);
			if (!bound || !_rapierKeptRuntime.dirty || _rapierKeptRuntime.held) { _rapierKeptAutosave(); return; }
			if (_rapierKeptRuntime.saving || _nativeCloseRuntime.active) return;
			_rapierKeptRuntime.saving = true;
			var started = null;
			var saving = Promise.resolve().then(function () {
				var keptSave = globalThis.RapierKeptSave, save = keptSave && keptSave.save;
				started = _rapierKeptOwner();
				if (typeof save !== 'function' || !started || started.authority !== String(authority))
					return {status: 'superseded', saved: false};
				return save({quiet: true, returnReceipt: true});
			}).then(function (result) {
				if (!_rapierKeptOwns(started)) return;
				if (result === true || result && result.saved === true) { _rapierKeptRuntime.told = false; return; }
				if (_rapierKeptTerminal(result)) _rapierKeptFail();
			}).catch(function () {
				if (_rapierKeptOwns(started)) _rapierKeptFail();
			}).finally(function () {
				if (_rapierKeptRuntime.saveTask === saving) { _rapierKeptRuntime.saveTask = null; _rapierKeptRuntime.saving = false; }
			});
			_rapierKeptRuntime.saveTask = saving;
		}, 700);
	}
	function _rapierKeptFiles(raw) {
		return Object.freeze({
			saveAs: raw.saveAs && async function (blob, filename, options) {
				var keep = _rapierKeep(), authority = String(options && options.documentAuthority || '').trim();
				if (!keep || !authority || authority.indexOf('notes:') === 0 || !keep.synced()) return raw.saveAs(blob, filename, options);
				var choice = await keep.ask('save');
				if (choice === 'secondary') { _rapierKeptUnbind(authority); return raw.saveAs(blob, filename, options); }
				if (choice !== true) return { status: 'cancelled', confirmed: false, verified: false };
				if (options && options.beforeWrite) await options.beforeWrite;
				if (options && options.check) options.check();
				if (typeof blob === 'function') blob = await blob(String(filename || 'document.md'));
				if (!blob) return { status: 'cancelled', confirmed: false, verified: false };
				if (options && options.keptPlain) blob = await options.keptPlain() || blob;
				return _rapierKeptBind(authority, await keep.keep(await _rapierKeptText(blob), String(filename || 'document.md')), options?.editablePage);
			},
			saveInPlace: async function (blob, filename, options) {
				var authority = String(options && options.documentAuthority || '').trim(), bound = _rapierKeptBinding(authority), keep = await _rapierKeepFor(bound);
				if (!keep) return raw.saveInPlace ? raw.saveInPlace(blob, filename, options) : raw.saveAs ? raw.saveAs(blob, filename, options)
					: Promise.reject(new Error('This host does not provide a save destination.'));
				if (options && options.beforeWrite) await options.beforeWrite;
				if (options && options.check) options.check();
				if (options && options.keptPlain) blob = await options.keptPlain() || blob;
				var saved = await keep.save(bound, await _rapierKeptText(blob));
				return _rapierKeptBind(authority, saved, options?.editablePage);
			},
			acceptOpened: function (payload) {
				var kept = payload && payload.rapierKept, authority = String(payload && payload.documentAuthority || '').trim();
				if (kept && authority && _rapierKeep()) { _rapierKeptBind(authority, kept, payload.editablePage === true); return Promise.resolve({ bound: true, persisted: false }); }
				return raw.acceptOpened ? raw.acceptOpened(payload) : Promise.resolve({ bound: true, persisted: false });
			},
			detach: function (authority) {
				_rapierKeptUnbind(authority);
				return raw.detach ? raw.detach.apply(null, arguments) : Promise.resolve();
			},
			hasWritable: function (authority) { return !!_rapierKeptBinding(authority) || (raw.hasWritable ? raw.hasWritable(authority) : false); },
			keptFile: function (authority) { var bound = _rapierKeptBinding(authority); return bound ? bound.file : ''; },
			generation: function (authority) { var bound = _rapierKeptBinding(authority); return bound ? bound.digest : raw.generation ? raw.generation(authority) : null; },
			open: raw.open && async function () {
				var keep = _rapierKeep();
				if (!keep || !keep.synced()) return raw.open.apply(null, arguments);
				var choice = await keep.ask('open');
				if (choice === 'secondary') return raw.open.apply(null, arguments);
				if (choice === true) await keep.show();
				return null;
			},
			publishDirty: function (value) {
				var dirty = value === true;
				if (!dirty) { _rapierKeptRuntime.held = false; _rapierKeptRuntime.told = false; }
				_rapierKeptRuntime.dirty = dirty;
				_rapierKeptAutosave();
				if (raw.publishDirty) return raw.publishDirty(value);
			},
		});
	}

	function _createPlatformPort(raw) {
		function method(name) {
			return typeof raw[name] === 'function' ? raw[name] : null;
		}
		function kept(name, rawName) {
			if (!_rapierKeep() && !_rapierKeepCarried()) return method(rawName);
			return _rapierKeptFiles({ saveAs: method('saveAs'), saveInPlace: method('saveInPlace'), acceptOpened: method('acceptOpenedDocument'),
				detach: method('detachCurrentFile'), hasWritable: method('hasWritableHandle'), generation: method('currentFileGeneration'),
				open: method('openDocument'), publishDirty: method('publishDirty') })[name] || null;
		}
		var environment = Object.freeze({
			get id() { return String(raw.id || 'unknown').toLowerCase(); },
			get android() { return environment.id === 'android'; },
			get native() { return raw.native === true; },
			get network() { return raw.native !== true || raw.network === true; },
			get here() { return environment.id === 'web' ? 'This browser' : 'This app'; },
			get updateEngine() { return environment.android ? 'Update Android System WebView in Google Play, then reopen Rapier.'
				: environment.id === 'windows' ? 'Update Microsoft Edge WebView2 Runtime, then reopen Rapier.' : ''; },
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
			get review() { return method('reviewPro'); },
			get supportState() { return method('supportState'); },
			get supportPurchase() { return method('supportPurchase'); },
		});
		var water = Object.freeze({
			get available() { return raw.waterProAvailable === true; },
			get authorize() { return method('authorizeWaterPro'); },
			get readPalettes() { return method('readWaterPalettes'); },
			get writePalettes() { return method('writeWaterPalettes'); },
			get shareVideo() { return method('shareWaterVideo'); },
		});
		var files = Object.freeze({
			get canSaveInPlace() { return raw.canSaveInPlace === true; },
			get savesChosenType() { return raw.savesChosenType === true; },
			get showsRecentFilesUi() { return raw.showsRecentFilesUi === true; },
			get showsUploadUi() { return raw.showsUploadUi === true; },
			get open() { return kept('open', 'openDocument'); },
			get upload() { return method('uploadDocument'); },
			get chooseCompare() { return method('chooseCompareDocument'); },
			get readCurrent() { return async function (authority) {
				var original = _platformOriginal(authority);
				if (!original) return method('readCurrentDocument')?.(authority) || null;
				var refreshed = await original.refresh();
				var {blob, ...payload} = refreshed.payload, read = await RapierTextCodec.readDocumentRecord(blob);
				return {...payload, text: read.text, bom: read.bom, encoding: read.encoding, admittedBytes: read.bytes, documentAuthority: authority};
			}; },
			get checkExternalChange() { return async function (authority) {
				var original = _platformOriginal(authority);
				if (!original) return method('checkExternalFileChange')?.(authority) || false;
				try { await original.validate(); return false; }
				catch (error) {
					var reason = typeof error.code === 'string' ? error.code : error.name || 'original_unavailable';
					var missing = ['missing', 'not_found', 'NotFoundError', 'stale_locator'].includes(reason);
					if (!missing && reason !== 'external_file_changed') throw error;
					window.dispatchEvent(new CustomEvent('rapier:file-changed', {detail: {
						documentAuthority: authority, missing, reason}})); return true;
				}
			}; },
			get acceptOpened() { return async function (payload) {
				var original = payload?.originalFile, authority = String(payload?.documentAuthority || '');
				if (!original) return kept('acceptOpened', 'acceptOpenedDocument')?.(payload) || {bound: true, persisted: false};
				if (!_engineOwnsDocumentAuthority(authority)) return {bound: false, persisted: false};
				await original.validate();
				if (!_engineOwnsDocumentAuthority(authority)) return {bound: false, persisted: false};
				_setPlatformFileBinding(authority, payload.fileGeneration, false, original,
					_platformDocumentDescriptor(payload.name, payload.editablePage === true));
				original.activate(authority, () => _engineOwnsDocumentAuthority(authority));
				return {bound: true, persisted: false};
			}; },
			get detach() { return async function (authority) {
				var original = _platformOriginal(authority);
				if (!original) return kept('detach', 'detachCurrentFile')?.(authority);
				_clearPlatformFileBinding(authority); await original.release();
			}; },
			get hasOriginal() { return authority => !!_platformOriginal(authority); },
			get original() { return authority => _platformOriginal(authority); },
			get relativeCandidate() { return href => (!!_platformOriginal(_engineDocumentAuthority()) || _platformBindingRuntime.originalProjections > 0) &&
				typeof href === 'string' && !!href && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href); },
			get holdOriginalProjection() { return () => {
				_platformBindingRuntime.originalProjections++;
				let held = true;
				return () => { if (held) { held = false; _platformBindingRuntime.originalProjections--; globalThis.RapierEmbeddedImages?.originalReady(); } };
			}; },
			get boundDocument() { return authority => {
				var kept = _rapierKeptBinding(authority);
				if (kept) return kept.document || null;
				if (raw.id === 'speedracer') return String(authority || '') === _srCurrentAuthority()
					? _platformDocumentDescriptor(_srState.current?.name, _srState.current?.editablePage) : null;
				return _platformBoundDocument(authority);
			}; },
			get hasWritable() { return kept('hasWritable', 'hasWritableHandle'); },
			get currentAuthority() { return method('currentFileAuthority'); },
			get generation() { return kept('generation', 'currentFileGeneration'); },
			get observeGeneration() { return method('observeFileGeneration') || _webFileGeneration; },
			get saveAs() { return async function (blob, name, options = {}) {
				var original = _platformOriginal(options.documentAuthority);
				if (!original) return kept('saveAs', 'saveAs')?.(blob, name, options);
				await options.beforeWrite; options.check?.();
				var data = typeof blob === 'function' ? await blob(name) : blob;
				if (!data) return {status: 'cancelled', confirmed: false, verified: false};
				if (environment.id === 'web') return _webDownload(data, _webNextDownloadName(name, {...options, nameTaken: true}), options);
				if (_nativeCapability('exclusiveNewDestination')) {
					var copy;
					try { copy = await _nativeExportArtifact(data, name, {...options, exclusiveNewDestination: true}); }
					catch (error) {
						if (options.signal?.aborted) return {status: 'cancelled', confirmed: false, verified: false};
						return {status: 'retained-draft', confirmed: false, verified: false, originalPreserved: true,
							reason: error.code || 'copy_not_created', recoveryChoices: ['keep-editing', 'save-copy', 'reopen-original']};
					}
					if (copy?.status === 'cancelled') return copy;
					return {status: 'retained-draft', confirmed: false, verified: false,
						reason: copy?.confirmed && copy?.verified ? 'copy_created_original_unchanged' : 'copy_not_created',
						copyVerified: copy?.confirmed === true && copy?.verified === true, destinationName: copy?.destinationName || '',
						originalPreserved: true, recoveryChoices: ['keep-editing', 'save-copy', 'reopen-original']};
				}
				return {status: 'retained-draft', confirmed: false, verified: false, originalPreserved: true,
					reason: 'safe_new_destination_unavailable', recoveryChoices: ['keep-editing', 'reopen-original']};
			}; },
			get saveInPlace() { return function (blob, name, options = {}) {
				var original = _platformOriginal(options.documentAuthority);
				return original ? original.save(blob, options) : kept('saveInPlace', 'saveInPlace')?.(blob, name, options);
			}; },
			get exportArtifact() { return method('exportArtifact'); },
			get prepareExportArtifact() { return method('prepareExportArtifact'); },
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
			get clear() { return method('clearRecovery'); },
			get binaryStore() { return raw.binaryRecoveryStore || null; },
		});
		var resources = Object.freeze({
			get installMessage() { return method('resourceInstallMessage'); },
			get status() { return method('resourceStatus'); },
			get read() { return method('resourceRead'); },
			get ensure() { return method('resourceEnsure'); },
			get remove() { return method('resourceRemove'); },
			get part() { return method('partEnsure'); },
		});
		var host = Object.freeze({
			get canShare() { return raw.canShare === true; },
			get defersBrowserPrintCleanup() { return raw.defersBrowserPrintCleanup === true; },
			get clipboardWrite() { return method('clipboardWrite'); },
			get externalOpen() { return method('externalOpen'); },
			get newWindow() { return method('newWindow'); },
			get share() { return method('share'); },
			get printCurrentDocument() { return method('printCurrentDocument'); },
			get requestClose() { return method('requestClose'); },
			get originalFolder() { return _nativeCapability('originalFolder') ? Object.freeze({
				choose: () => _nativeHostCall('folder.choose', {}, 120000),
				call: (token, method, args) => _nativeHostCall('folder.call', {token, method, args}),
				close: token => _nativeHostCall('folder.close', {token}),
			}) : null; },
			get notesStore() { return method('notesStore'); },
			get lockedNotes() { return raw.lockedNotes === true; },
			get lockedNoteCards() { return method('lockedNoteCards'); },
			get openLockedNote() { return method('openLockedNote'); },
			get notesBackup() { return method('notesBackup'); },
			get shareInbox() { return method('shareInbox'); },
			get readShared() { return method('readShared'); },
			get openAttachment() { return method('openAttachment'); },
			get unlockNotes() { return method('unlockNotes'); },
			get captureReady() { return method('captureReady'); },
			get requestNotesRole() { return method('requestNotesRole'); },
			get pinNote() { return method('pinNote'); },
			get noteOpened() { return method('noteOpened'); },
			get noteGone() { return method('noteGone'); },
			get mediaPlaying() { return method('mediaPlaying'); },
			get openSync() { return method('openSync'); },
			get scheduleReminder() { return method('scheduleReminder'); },
			get reminderState() { return method('reminderState'); },
			get reminderActions() { return method('reminderActions'); },
			get acknowledgeReminderActions() { return method('acknowledgeReminderActions'); },
			get requestReminderPermission() { return method('requestReminderPermission'); },
			get openReminderSettings() { return method('openReminderSettings'); },
			get openMicrophoneSettings() { return method('openMicrophoneSettings'); },
			get storageReport() { return method('storageReport'); },
			get storageClearTemporary() { return method('storageClearTemporary'); },
			get storageCancel() { return method('storageCancel'); },
			get openAppStorage() { return method('openAppStorage'); },
			get approveClose() { return method('approveClose'); },
			get cancelClose() { return method('cancelClose'); },
			get settlePersistence() { return _platformSettlePersistence; },
			get persistencePending() { return _platformPersistencePending(); },
			get reviewSaved() { return method('reviewSaved'); },
			get reviewFinished() { return method('reviewFinished'); },
			get publishDirty() { return kept('publishDirty', 'publishDirty'); },
			get publishTitle() { return method('publishTitle'); },
			get publishSelection() { return method('publishSelection'); },
			get publishTheme() { return method('publishTheme'); },
			get publishBackState() { return method('publishBackState'); },
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
		});
		return Object.freeze({ media: Object.freeze({get createAudio() { return method('createAudio'); }}), environment: environment, preferences: preferences, pro: pro, water: water, files: files,
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
			get savesChosenType() { return _hasFsaSave; },
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
			prepareExportArtifact: _hasFsaSave ? _webPrepareExportArtifact : null,
			saveInPlace: _webSaveInPlace,
		};
	}

	function _createBenchPlatform(session) {
		if (window.self === window.top || globalThis.origin !== 'null') throw new Error('The benchmark requires an isolated frame.');
		const preferences = new Map();
		session.capture ||= {clipboard: null, saved: null};
		const current = () => {
			if (session.active !== true || session.signal?.aborted) throw session.signal?.reason || new DOMException('Benchmark stopped', 'AbortError');
		};
		return {
			id: 'benchmark', ownsPreferenceStore: true, ownsRecoveryStore: true, ownsRecoveryWriterBoundary: true,
			allowsEmbed: false, allowsBrowserIntake: false, allowsServiceWorker: false,
			allowsWebShareFallback: false, allowsBrowserDownloadFallback: false, allowsBrowserPrintFallback: false,
			canSaveInPlace: false, showsRecentFilesUi: false, showsUploadUi: false, canShare: false, proSupported: false,
			preference: (key, fallback) => preferences.has(key) ? preferences.get(key) : fallback,
			setPreference(key, value) { current(); preferences.set(key, value); },
			persistRecovery(payload) { current(); session.recovery = payload; return Promise.resolve(); },
			clearRecovery() { current(); session.recovery = null; return Promise.resolve(); },
			clipboardWrite(payload) { current(); session.capture.clipboard = payload; return Promise.resolve(true); },
			async saveAs(blob, filename, options) {
				current();
				if (options?.beforeWrite) await options.beforeWrite;
				const bytes = new Uint8Array(await blob.arrayBuffer());
				current();
				const held = new Blob([bytes], {type: blob.type});
				const read = new Uint8Array(await held.arrayBuffer());
				if (read.length !== bytes.length || read.some((value, at) => value !== bytes[at])) throw new Error('The benchmark capture changed.');
				current();
				session.capture.saved = {blob: held, filename, options, bytes: held.size};
				return {status: 'saved', confirmed: true, verified: true, destinationName: filename, destinationSelected: true};
			},
		};
	}

	function _nativeResourceRead(id) {
		return fetch('/plugins/' + encodeURIComponent(String(id || '')), { cache: 'no-store', credentials: 'omit' }).then(function (response) {
			return response.ok ? response.blob().then(function (blob) { return { content: blob }; }) : null;
		});
	}

	var _nativeReportedGenerations = new Map();

	function _nativeDrawGestureExclusion() {
		if (!_nativeCapability('gestureExclusion')) return;
		var canvas = null, last = '', pending = false;
		var resize = new ResizeObserver(update);
		function update() {
			if (pending) return;
			pending = true;
			requestAnimationFrame(function () {
				pending = false;
				var next = document.body.classList.contains('rapier-draw-open') ? document.querySelector('.rapier-draw-canvas') : null;
				if (canvas !== next) { resize.disconnect(); canvas = next; if (canvas) resize.observe(canvas); }
				var rect = canvas?.getBoundingClientRect();
				var value = {width: innerWidth, rect: rect && rect.width > 0 && rect.height > 0 ?
					{left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom} : null};
				var key = JSON.stringify(value);
				if (key !== last) { last = key; _nativeHostNotify('window.gestureExclusion', value); }
			});
		}
		new MutationObserver(update).observe(document.body, {attributes: true, attributeFilter: ['class']});
		window.addEventListener('resize', update);
		update();
	}

	async function _nativeCreateAudio(options) {
		var state = await _nativeHostCall('media.prepare', options, 20000), stamp = performance.now(), chain = Promise.resolve(), closed = false;
		var audio = new EventTarget(), id = state.id;
		function apply(next) {
			if (closed || next?.id !== id) return;
			var previous = state; state = next; stamp = performance.now();
			for (var type of ['timeupdate', ...(previous.duration !== state.duration ? ['durationchange'] : []),
				...(previous.paused !== state.paused ? [state.paused ? 'pause' : 'play'] : []),
				...(!previous.ended && state.ended ? ['ended'] : []), ...(previous.speed !== state.speed ? ['ratechange'] : []),
				...(!previous.error && state.error ? ['error'] : [])]) audio.dispatchEvent(new Event(type));
		}
		function call(operation, args = {}) {
			var request = chain.catch(() => {}).then(() => _nativeHostCall('media.' + operation, {id, ...args})).then(result => {
				apply(result); if (!closed && operation === 'seek') audio.dispatchEvent(new Event('seeked')); return result;
			});
			chain = request;
			return request;
		}
		function changed(event) { apply(event.detail); }
		function changedAsync(operation, args) { void call(operation, args).catch(error => { if (!closed) { state.error = error; audio.dispatchEvent(new Event('error')); } }); }
		window.addEventListener('rapier:native-media', changed);
		Object.defineProperties(audio, {
			currentTime: {get: () => Math.min(state.duration / 1000, state.position / 1000 + (state.paused ? 0 : (performance.now() - stamp) / 1000 * state.speed)),
				set: value => { if (!Number.isFinite(value) || closed) return; state.position = Math.max(0, value * 1000); stamp = performance.now(); changedAsync('seek', {position: Math.round(state.position)}); }},
			duration: {get: () => state.duration / 1000}, paused: {get: () => state.paused}, ended: {get: () => state.ended},
			error: {get: () => state.error}, playbackRate: {get: () => state.speed, set: value => { if (Number.isFinite(value) && !closed) changedAsync('speed', {speed: value}); }},
		});
		audio.src = '/' + options.key.split('/').map(encodeURIComponent).join('/');
		audio.play = () => closed ? Promise.reject(new Error('This audio session has ended')) : call('play').then(() => {});
		audio.pause = () => { if (!closed) changedAsync('pause'); };
		audio.removeAttribute = name => { if (name !== 'src' || closed) return; closed = true; window.removeEventListener('rapier:native-media', changed); void call('stop').catch(() => {}); };
		audio.load = () => {};
		return audio;
	}

	function _nativeBinaryRecoveryStore() {
		var prepared = null;
		var call = function (operation, args) { return _nativeHostCall('recovery.store.' + operation, args || {}, 30000); };
		var prepare = function () {
			if (!prepared) prepared = call('prepare').then(function (result) {
				if (result?.writable !== true) throw new Error(result?.reason || 'Recovery storage is unavailable. Previous copies are kept.');
			}).catch(function (error) { prepared = null; throw error; });
			return prepared;
		};
		return Object.freeze({
			async list() { var value = await call('list'); if (!Array.isArray(value.names)) throw new Error('Recovery listing was incomplete'); return value.names; },
			async read(name) {
				var id = crypto.randomUUID(), parts = [], opened = false;
				try {
					var value = await call('read.begin', {id, name});
					if (value?.missing === true) return null;
					opened = true;
					if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > 128 * 1048576) throw new Error('Recovery size was refused');
					for (var offset = 0; offset < value.size;) {
						var size = Math.min(32768, value.size - offset), part = await call('read.chunk', {id, offset, size});
						if (!(part.bytes instanceof Uint8Array) || part.bytes.length !== size || part.offset !== offset) throw new Error('Recovery bytes were incomplete');
						parts.push(part.bytes); offset += size;
					}
					return new Blob(parts, {type: 'application/json'});
				} finally { if (opened) await call('read.close', {id}); }
			},
			async write(name, blob, options = {}) {
				if (!(blob instanceof Blob) || blob.size > 128 * 1048576) throw new Error('Recovery bytes were refused');
				await prepare();
				var proof = await _blobFingerprint(blob), id = crypto.randomUUID(), begun = false;
				try {
					begun = true;
					await call('write.begin', {id, name, size: blob.size, digest: proof.digest,
						...(Object.hasOwn(options, 'expectedDigest') ? {expectedDigest: options.expectedDigest} : {})});
					for (var offset = 0; offset < blob.size;) {
						var bytes = new Uint8Array(await blob.slice(offset, offset + 32768).arrayBuffer());
						var reply = await call('write.chunk', {id, offset, bytes}); offset += bytes.length;
						if (reply.offset !== offset) throw new Error('Recovery did not keep the complete byte range');
					}
					var result = await call('write.commit', {id}); begun = false;
					if (result?.written !== true) throw Object.assign(new Error('A newer recovery was kept. This copy cannot replace it.'), {code: 'recovery_changed'});
					return proof.digest;
				} finally { if (begun) await call('write.abort', {id}).catch(function () {}); }
			},
			async remove(name) { await prepare(); await call('remove', {name}); },
			fingerprint: _blobFingerprint,
		});
	}

	function _createNativePlatform() {
		var binaryRecovery = null;
		var preferencesReady;
		return {
			get id() { return _nativeHostRuntime.state.platformId; },
			native: true,
			get network() { return _nativeCapability('network'); },
			get createAudio() { return _nativeCapability('nativeMedia') ? _nativeCreateAudio : null; },
			get recoveryAutoResume() { return _nativeHostRuntime.state.recoveryAutoResume === true; },
			ready: function () {
				if (!preferencesReady) preferencesReady = _nativeHostRuntime.ready.then(function (state) {
					_nativeDrawGestureExclusion();
					if (!_nativeCapability('notesBackup')) return;
					try { if (state?.notesBackupSettings) RapierPreferences.restoreAndroid(state.notesBackupSettings.values); }
					catch (error) { console.warn('[rapier] Android settings restore', error); }
				});
				return preferencesReady;
			},
			ownsPreferenceStore: false,
			get ownsRecoveryStore() { return _nativeCapability('lockedNotes'); },
			get binaryRecoveryStore() { return _nativeCapability('binaryRecovery') ? binaryRecovery ||= _nativeBinaryRecoveryStore() : null; },
			get persistRecovery() { return _nativeCapability('lockedNotes') ? function () {
				return Promise.reject(Object.assign(new Error('Locked notes use their encrypted Notes store.'), {code: 'notes_locked'}));
			} : null; },
			get ownsRecoveryWriterBoundary() { return _nativeCapability('ownsRecoveryWriterBoundary'); },
			allowsEmbed: false,
			allowsBrowserIntake: false,
			allowsServiceWorker: false,
			allowsWebShareFallback: false,
			allowsBrowserDownloadFallback: false,
			allowsBrowserPrintFallback: false,
			defersBrowserPrintCleanup: false,
			get canSaveInPlace() { return _nativeCapability('saveInPlace'); },
			get savesChosenType() { return _nativeCapability('chooseSave'); },
			get showsRecentFilesUi() { return _nativeCapability('recents'); },
			showsUploadUi: false,
			get canShare() { return _nativeCapability('share'); },
			get proSupported() { return _nativeProAuthority(); },
			getProState: _currentProState,
			get supportState() {
				return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('support') ? () => _nativeHostRuntime.state.support : null;
			},
			get supportPurchase() {
				return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('support') ? product => _nativeHostCall('support.purchase', {product}) : null;
			},
			get reviewSaved() { return _nativeCapability('reviewPrompt') ? _nativeReview.saved : null; },
			get reviewFinished() { return _nativeCapability('reviewPrompt') ? _nativeReview.finished : null; },
			get waterProAvailable() { return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('waterPro') && _currentProState().unlocked; },
			get authorizeWaterPro() { return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('waterPro') ? function (feature) {
				return _nativeHostCall('water.pro.authorize', {feature: feature});
			} : null; },
			get readWaterPalettes() { return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('waterPro') ? function () {
				return _nativeHostCall('water.palettes.read', {});
			} : null; },
			get writeWaterPalettes() { return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('waterPro') ? function (value) {
				return _nativeHostCall('water.palettes.write', value);
			} : null; },
			get shareWaterVideo() { return _nativeHostRuntime.state.platformId === 'android' && _nativeCapability('waterPro') ? async function (blob, name, options) {
				if (!(blob instanceof Blob) || blob.type !== 'video/mp4' || blob.size === 0 || blob.size > 64 * 1024 * 1024) throw new Error('The video is too large to share.');
				if (!await _nativeAdultGate()) throw Object.assign(new Error('Sharing was canceled.'), {name: 'AbortError'});
				var authorization = await _nativeHostCall('water.pro.authorize', {feature:'video'});
				if (authorization?.authorized !== true) throw new Error('Pro watercolor is unavailable.');
				var fingerprint = await _blobFingerprint(blob);
				var result = await _sendNativeTransfer('waterVideo', blob, name || 'painting.mp4', 'video/mp4', options || {},
					'water-video-' + Date.now().toString(36) + '-' + (++_nativeSaveRuntime.sequence).toString(36), fingerprint);
				if (result?.shared !== true) throw new Error('The video could not be shared.');
				return true;
			} : null; },
			purchasePro: function () {
				if (!_nativeProAuthority()) return Promise.resolve(_defaultProState);
				return _nativeAdultGate().then(function (passed) { return passed ? _callPro('pro.purchase') : _currentProState(); });
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
						nativeDocumentAuthority: payload.nativeDocumentAuthority || '',
						fileGeneration: payload.fileGeneration == null ? null : payload.fileGeneration,
						intakeId: Number(payload.nativeIntakeId) || 0,
					});
					var bound = !!payload.path && !!result && result.bound === true;
					if (bound) {
						_setNativeCurrentFileBinding(payload.documentAuthority, payload.fileGeneration,
							_platformDocumentDescriptor(payload.name, payload.editablePage === true));
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
					return _nativeAdultGate().then(function (passed) {
						return passed ? _nativeHostCall('external.open', { url: String(url || '') }) : { opened: false, canceled: true };
					}).then(function (result) {
						return !result || result.opened !== false;
					});
				} : null;
			},
			get share() { return _nativeCapability('share') ? _nativeShare : null; },
			get newWindow() {
				return _nativeCapability('newWindow') ? function () {
					return _nativeHostCall('window.new', {}).then(function (result) { return !!(result && result.opened); }, function () { return false; });
				} : null;
			},
			publishTheme: function (dark) {
				if (_nativeCapability('windowTheme')) _nativeHostNotify('window.theme', { dark: !!dark });
			},
			get publishBackState() {
				return _nativeCapability('backState') ? function (consumes) {
					_nativeHostNotify('window.backState', { consumes: consumes === true });
				} : null;
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
				_nativeSaveRuntime.booted = true;
				_nativeHostNotify('page.ready');
				void _nativeReplaySaveResults();
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
				if (payload.purpose !== 'clipboard' && _rapierExternalIntakeReleaseDeferred(payload)) return true;
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
				return _nativeHostCall('recent.open', { path: entry.path || entry.name }).then(function () { return true; });
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
					var pack = _nativeResourcePack(resource), words = pack && pack.words;
					return words && typeof words[phase] === 'string' ? words[phase] : '';
				} : null;
			},
			get resourceStatus() {
				return _nativeCapability('resources') ? function (id) {
					return _nativeHostCall('resources.status', { id: String(id || '') }).then(function (state) { _applyNativeResources(state, true); return state; });
				} : null;
			},
			get resourceRead() { return _nativeCapability('resources') ? _nativeResourceRead : null; },
			get resourceEnsure() {
				return _nativeCapability('resources') ? function (id) {
					return _nativeHostCall('resources.ensure', { id: String(id || '') }, 3600000).then(function () { return _nativeResourceRead(id); });
				} : null;
			},
			get resourceRemove() {
				return _nativeCapability('resourceRemove') ? function (id) { return _nativeHostCall('resources.remove', { id: String(id || '') }, 120000); } : null;
			},
			get partEnsure() {
				var packed = _nativeHostRuntime.state.partPacks;
				return _nativeCapability('partPacks') && Array.isArray(packed) ? function (id, onProgress) {
					if (packed.indexOf(String(id)) < 0) return null;
					var follow = function (event) { if (event.detail.id === String(id) && onProgress) onProgress(event.detail.progress); };
					window.addEventListener('rapier:platform-part', follow);
					return _nativeHostCall('parts.ensure', { id: String(id) }, 3600000).finally(function () { window.removeEventListener('rapier:platform-part', follow); });
				} : null;
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
			get openMicrophoneSettings() {
				return _nativeCapability('microphoneSettings') ? async function () {
					const answer = await _nativeHostCall('platform.microphoneSettings', {});
					if (answer?.opened !== true) throw new Error('Microphone settings could not be opened');
				} : null;
			},
			get storageReport() {
				return _nativeCapability('storage') ? function () { return _nativeHostCall('storage.report', {}, 120000); } : null;
			},
			get storageClearTemporary() {
				return _nativeCapability('storage') ? function () { return _nativeHostCall('storage.clearTemporary', {}, 120000); } : null;
			},
			get storageCancel() {
				return _nativeCapability('storage') ? function () { return _nativeHostCall('storage.cancel', {}, 15000); } : null;
			},
			get openAppStorage() {
				return _nativeCapability('storage') ? async function () {
					const answer = await _nativeHostCall('platform.appStorage', {});
					const opened = answer && answer.opened;
					if (opened !== 'storage' && opened !== 'app-info' && opened !== 'unavailable') return 'unavailable';
					if (answer.cleared === true) throw new Error('Android storage handoff must not clear data');
					return opened;
				} : null;
			},
			get reminderState() {
				return _nativeCapability('reminders') ? function () { return _nativeHostCall('reminders.state', {}); } : null;
			},
			get requestReminderPermission() {
				return _nativeCapability('reminders') ? function () { return _nativeHostCall('reminders.permission', {}, 300000); } : null;
			},
			get reminderActions() {
				return _nativeCapability('reminders') ? function () { return _nativeHostCall('reminders.actions', {}); } : null;
			},
			get acknowledgeReminderActions() {
				return _nativeCapability('reminders') ? function (tokens) { return _nativeHostCall('reminders.ack', {tokens}); } : null;
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
			get lockedNotes() { return _nativeCapability('lockedNotes'); },
			get lockedNoteCards() { return _nativeCapability('notesStore') && !_nativeCapability('lockedNotes')
				? () => _nativeHostCall('notes.store.locked.list', {}) : null; },
			get openLockedNote() { return _nativeCapability('notesStore') && !_nativeCapability('lockedNotes')
				? id => _nativeHostCall('notes.store.locked.open', {id}) : null; },
			get notesStore() {
				return _nativeCapability('notesStore') ? function (operation, args) { return _nativeHostCall(operation, args); } : null;
			},
			get notesBackup() {
				return _nativeCapability('notesBackup') ? function (operation, args) {
					if (!/^notes\.backup\.(?:pending|status|settings|settings\.get|complete|copy|read\.(?:begin|chunk|close))$/.test(operation)) throw new Error('Unknown Android backup operation');
					return _nativeHostCall(operation, args || {}, 600000);
				} : null;
			},
			get openAttachment() {
				return _nativeCapability('notesAttachmentOpen') ? _nativeOpenAttachment : null;
			},
			get shareInbox() {
				return _nativeCapability('shareInbox') ? function (operation, args) {
					if (!['list', 'ack'].includes(operation)) throw new Error('Unknown share inbox operation');
					return _nativeHostCall('shares.' + operation, args || {});
				} : null;
			},
			get readShared() {
				return _nativeCapability('shareInbox') ? async function (entry) {
					if (!Number.isSafeInteger(entry?.size) || entry.size < 0 || entry.size > 300000000) throw new Error('Invalid shared file size');
					const chunks = [];
					for (let offset = 0; offset < entry.size;) {
						const size = Math.min(65536, entry.size - offset);
						const value = await _nativeHostCall('shares.read.chunk', {id: entry.id, offset, size});
						if (value.offset !== offset || !(value.bytes instanceof Uint8Array) || value.bytes.length !== size) throw new Error('Incomplete shared file');
						chunks.push(value.bytes); offset += size;
					}
					return new Blob(chunks, {type: entry.mime});
				} : null;
			},
			get unlockNotes() {
				return _nativeCapability('notesCapture') ? function () { return _nativeHostCall('notes.unlock', {}); } : null;
			},
			get captureReady() {
				return _nativeCapability('notesCapture') ? function (token, ready) { return _nativeHostCall('notes.captureReady', {token, ready}); } : null;
			},
			get pinNote() {
				return _nativeCapability('notesPin') ? async function (file, id, title) {
					return (await _nativeHostCall('notes.pinShortcut', {file: String(file), id: String(id)}))?.requested === true;
				} : null;
			},
			get noteOpened() {
				return _nativeCapability('notesPin') ? function (file, id) { _nativeHostNotify('notes.opened', {file: String(file), id: String(id)}); } : null;
			},
			get noteGone() {
				return _nativeCapability('notesPin') ? function (id) { _nativeHostNotify('notes.gone', {id: String(id)}); } : null;
			},
			get mediaPlaying() {
				return _nativeCapability('mediaPlaying') && !_nativeCapability('nativeMedia') ? function (playing) { _nativeHostNotify('media.playing', {playing: playing === true}); } : null;
			},
			get requestNotesRole() {
				return _nativeCapability('notesRole') ? function () {
					return _nativeHostCall('notes.requestRole', {});
				} : null;
			},
			get openSync() {
				return _nativeCapability('sync') ? function () {
					return _nativeHostCall('sync.open', {});
				} : null;
			},
			get syncTransport() {
				return _nativeCapability('syncTransport') ? function (operation, args) {
					const name = String(operation || '');
					if (_nativePlatformId === 'windows' && !name.startsWith('sync.')) return Promise.reject(new Error('unsupported sync operation'));
					return _nativeHostCall(_nativePlatformId === 'windows' ? name : 'sync.' + name, args || {}, 600000);
				} : null;
			},
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
			get approveClose() { return _nativeCapability('windowClose') ? _nativeApproveClose : null; },
			get cancelClose() { return _nativeCapability('windowClose') ? _nativeCancelClose : null; },
			publishDirty: function (value) {
				if (!_nativeCapability('windowDocumentState') && !_nativeCapability('windowClose')) return Promise.resolve(false);
				return _nativeHostCall('document.dirty', { dirty: !!value }).then(function () { return true; }, function (error) {
					try { console.warn('[rapier-platform] native document.dirty failed', error); } catch (_) {}
					return false;
				});
			},
			publishTitle: function (value) {
				if (_nativeCapability('windowDocumentState')) _nativeHostNotify('document.title', { title: String(value || 'Rapier') });
			},
		};
	}

	 
	const appPreferences = new Map();
	const appsPlatform = {id:'mcp-app', ownsRecoveryWriterBoundary:true, ownsRecoveryStore:true, ownsPreferenceStore:true, allowsEmbed:false, allowsBrowserIntake:false, allowsServiceWorker:false, allowsWebShareFallback:false, allowsBrowserDownloadFallback:false, allowsBrowserPrintFallback:false, canSaveInPlace:true, showsRecentFilesUi:false, showsUploadUi:false, canShare:false, proSupported:false, preference:(key,fallback)=>appPreferences.has(key)?appPreferences.get(key):fallback, setPreference:(key,value)=>appPreferences.set(key,value), exportArtifact:async(blob,filename)=>globalThis.RapierMcpApp ? globalThis.RapierMcpApp.exportFile(blob,filename) : false};
	const rawPlatform = globalThis.RapierBenchSession?.active === true ? _createBenchPlatform(globalThis.RapierBenchSession)
		: globalThis.RAPIER_APPS_HOST === true ? appsPlatform : hasSpeedracer
		? _createSpeedracerPlatform()
		: (hasNative ? _createNativePlatform() : _createWebPlatform());
	Object.freeze(rawPlatform);
	_rapierPlatformPortRuntime.port = _createPlatformPort(rawPlatform);
})();

function _rapierDoorPathMark(door, on) {
	try {
		if (door === 'draw' && /^\/(?:watercolor|paint)\/?$/.test(location.pathname)) door = location.pathname.replace(/\//g, '');
		if (!/^https?:$/.test(location.protocol) || !new RegExp('^\\/(' + door + '\\/?)?$').test(location.pathname)) return;
		const canvas = door === 'draw' || door === 'watercolor' || door === 'paint';
		const path = on && (!canvas || location.pathname !== '/') ? '/' + door : '/';
		const hash = path !== '/' && /^#d\//.test(location.hash) ? '' : location.hash;
		if (location.pathname !== path || hash !== location.hash) history.replaceState(history.state, '', path + location.search + hash);
		if (on && canvas && _rapierBackEntries.held === 2) _rapierBackEntries.canvasAddress = location.href;
		queueMicrotask(() => window.dispatchEvent(new Event('rapier:door-path-changed')));
	} catch (_) {}
}

const _rapierBackEntries = {armed: false, held: 0, want: 0, popping: false, leaving: false, canvasAddress: null, floor: (() => {
	try {
		const own = history.state;
		return Number.isSafeInteger(own?.floor) && own.floor >= 0 ? own.floor : Number.isSafeInteger(own?.at) && own.at >= 0 ? own.at : Math.max(0, history.length - 1);
	} catch (_) { return 0; }
})()};
function _rapierBackState(state, push = true) {
	const rt = _rapierBackEntries, here = Number.isSafeInteger(history.state?.at) ? history.state.at : rt.floor;
	return {...(typeof rt.liveNavigationState === 'function' ? rt.liveNavigationState(state) : state), floor: rt.floor, at: here + (push ? 1 : 0)};
}
function _rapierBackEntriesHold(want) {
	const rt = _rapierBackEntries;
	rt.want = Math.max(0, Math.min(2, Number(want) || 0));
	if (rt.want < 2) rt.canvasAddress = null;
	if (!rt.armed) {
		if (!rt.want) return;
		rt.armed = true;
		const state = history.state;
		if (state && typeof state === 'object' && (state.rapierBack || state.rapierNotes)) { try { history.replaceState(_rapierBackState({}, false), ''); } catch (_) {} }
	}
	if (rt.popping || rt.leaving) return;
	try {
		if (history.state?.rapierNotes) return;
		while (rt.held < rt.want) {
			const address = rt.held === 1 ? (rt.canvasAddress ||= location.href) : location.href;
			if (rt.held === 1) _rapierDoorPathMark('draw', false);
			history.pushState(_rapierBackState({rapierBack: ++rt.held}), '', address);
		}
		if (rt.held > rt.want) {
			const delta = rt.want - rt.held;
			rt.held = rt.want; rt.popping = true;
			history.go(delta);
		}
	} catch (_) {}
}
function _rapierBackEntriesArmed() { return _rapierBackEntries.armed && !_rapierBackEntries.leaving; }
function _rapierBackEntriesLeave() {
	const rt = _rapierBackEntries;
	if (!rt.armed) return '';
	const on = Number(history.state?.rapierBack) || 0, known = on === rt.held;
	const here = Number.isSafeInteger(history.state?.at) ? history.state.at : rt.floor;
	const before = known ? rt.floor : 1, older = known ? Math.max(0, here - rt.held - rt.floor) : 0;
	const again = () => { document.removeEventListener('pointerdown', again, true); document.removeEventListener('keydown', again, true); rt.leaving = false; _rapierBackEntriesHold(rt.want); };
	rt.leaving = true; rt.popping = false;
	document.addEventListener('pointerdown', again, true); document.addEventListener('keydown', again, true);
	const delta = before > 0 ? -(rt.held + 1 + older) : -(rt.held + older);
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
	if (to >= rt.held) { rt.held = to; _rapierBackEntriesHold(rt.want); return; }
	rt.held = to;
	if (document.body && (document.body.classList.contains('rapier-notes-open') || document.body.classList.contains('rapier-notes-mode'))) return;
	if (!to) { _rapierDoorPathMark('notes', false); _rapierDoorPathMark('draw', false); }
	try { window.Rapier.shell.handleBack(); } catch (error) { try { console.warn('[rapier] back', error); } catch (_) {} }
	_rapierBackEntriesHold(rt.want);
});
