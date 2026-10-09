// SPDX-License-Identifier: AGPL-3.0-only
// RapierBundleIO: verified resource bytes in and out of Cache Storage. Packed into the platform stage.
const RapierBundleIO = (function () {
	'use strict';

	function bytes(value) {
		if (!value) return null;
		if (value instanceof Uint8Array) return value;
		if (value instanceof ArrayBuffer) return new Uint8Array(value);
		if (ArrayBuffer.isView(value)) {
			return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		}
		if (value && value.bytes) return bytes(value.bytes);
		return null;
	}

	async function resourceBytes(value, label) {
		var content = value && typeof value === 'object' &&
			Object.prototype.hasOwnProperty.call(value, 'content') ? value.content : value;
		if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer());
		var normalized = bytes(content);
		if (!normalized) throw new Error('The platform returned invalid ' + String(label || 'resource') + ' bytes');
		return normalized;
	}

	function toBase64(value) {
		var data = bytes(value);
		if (!data) return '';
		var binary = '';
		var chunk = 0x8000;
		for (var i = 0; i < data.length; i += chunk) {
			binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
		}
		return btoa(binary);
	}

	function fromBase64(value) {
		var binary = atob(String(value || ''));
		var out = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out;
	}

	function exactBuffer(value) {
		var data = bytes(value);
		if (!data) return null;
		return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
			? data.buffer
			: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	}

	// Base64 SHA-384: what a pin is compared against and what the PDF root is computed over.
	function digestSha384(value) {
		var data = bytes(value);
		if (!data) return Promise.reject(new Error('invalid bundle bytes'));
		if (!(window.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function')) {
			return Promise.reject(new Error('secure hash API unavailable'));
		}
		return crypto.subtle.digest('SHA-384', exactBuffer(data)).then(function (digest) {
			return toBase64(new Uint8Array(digest));
		});
	}

	function verifySha384(value, expectedBase64, options) {
		var opts = options || {};
		var data = bytes(value);
		if (!data) return Promise.reject(new Error(String(opts.invalidMessage || 'invalid bundle bytes')));
		if (Number.isFinite(opts.byteLength) && data.byteLength !== opts.byteLength) {
			return Promise.reject(new Error(String(opts.sizeMessage || 'unexpected bundle size')));
		}
		return digestSha384(data).then(function (actual) {
			if (actual !== expectedBase64) {
				var suffix = opts.source ? (' from ' + String(opts.source)) : '';
				throw new Error('SHA-384 mismatch' + suffix);
			}
			return data;
		});
	}

	function shortUrl(url) {
		try {
			var parsed = new URL(url, location.href);
			return parsed.host ? (parsed.host + parsed.pathname) : parsed.pathname;
		} catch (_) { return String(url); }
	}

	function sameOriginUrl(file) {
		try {
			if (!window.location || !location.origin || location.origin === 'null') return null;
			return new URL(file, location.href).href;
		} catch (_) { return null; }
	}

	// Where the plug-in files are kept when the page's host keeps them itself: `?plugins=<address>` on the page's own address (the
	// `plugins` option of Rapier.mount writes it). With a directory named, every plug-in is read from it and from nowhere else, each
	// file by its path under the directory (rapier-plugins.json names the same paths). The page's security policy lets it read only
	// its own origin, so a directory anywhere else is refused here, in words, before any request is made. Every file is still held
	// to its pinned length and SHA-384, so a directory can make a plug-in fail to install but never change what runs.
	var pluginDirectory = (function () {
		var value = null;
		try { value = new URLSearchParams(location.search).get('plugins'); } catch (_) {}
		if (value === null) return null;
		var named = null;
		try { named = new URL(value.replace(/\/?$/, '/'), location.href); } catch (_) {}
		var fail = function (why) { return { error: 'The plug-in directory ' + JSON.stringify(value) + ' ' + why }; };
		var found = !value ? fail('is empty: name the directory that holds the plug-in files')
			: !named || !/^https?:$/.test(named.protocol) || named.username || named.password || named.search || named.hash ? fail('is not an http or https directory address')
			: named.origin !== location.origin ? fail('is on another origin (' + named.origin + '). This page reads plug-ins only from its own origin, ' + location.origin + ': serve the directory from there')
			: { url: named.href };
		if (found.error) { try { console.warn('[rapier] ' + found.error); } catch (_) {} }
		return found;
	})();

	// The address of a plug-in file under the host's directory (`file` is its path there: the name, or `folder/name`), or null when the
	// host names no directory. A directory that was refused throws its reason, which the plug-in loader shows as the plug-in's status.
	function pluginUrl(file) {
		if (!pluginDirectory) return null;
		if (pluginDirectory.error) throw new Error(pluginDirectory.error);
		if (!file) throw new Error('The plug-in directory is set, but this plug-in file has no name in it');
		return new URL(String(file), pluginDirectory.url).href;
	}

	// `options` (a plug-in of pinned files): `length` bounds the download as it streams, a longer body refused before it is
	// held and a shorter one after; `onBytes(n)` hears how far it has come; `cache: 'no-store'` keeps no second copy in the
	// browser's cache, so a plug-in's delete leaves nothing of it behind.
	function fetchBytes(url, timeoutMs, options) {
		var opts = options || {};
		var controller = typeof AbortController === 'function' ? new AbortController() : null;
		var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
		var bound = Number.isFinite(opts.length) ? opts.length : -1;
		var wrongSize = function () { return new Error('unexpected size from ' + shortUrl(url)); };
		return fetch(url, {
			method: 'GET',
			mode: 'cors',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			cache: opts.cache || 'default',
			signal: controller ? controller.signal : undefined,
		}).then(function (response) {
			if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + shortUrl(url));
			if (bound < 0 || !response.body || typeof response.body.getReader !== 'function') return response.arrayBuffer();
			var reader = response.body.getReader(), out = new Uint8Array(bound), at = 0;
			function pump() {
				return reader.read().then(function (step) {
					if (step.done) return out;
					if (at + step.value.length > bound) { reader.cancel().catch(function () {}); throw wrongSize(); }
					out.set(step.value, at); at += step.value.length;
					if (typeof opts.onBytes === 'function') opts.onBytes(at);
					return pump();
				});
			}
			return pump().then(function (held) { if (at !== bound) throw wrongSize(); return held; });
		}).then(function (buffer) {
			var held = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
			if (bound >= 0 && held.byteLength !== bound) throw wrongSize();
			return held;
		}).finally(function () {
			if (timer) clearTimeout(timer);
		});
	}

	function store(dbName, storeName) {
		var dbPromise = null;
		function open() {
			if (dbPromise) return dbPromise;
			dbPromise = new Promise(function (resolve, reject) {
				try {
					if (!('indexedDB' in window)) throw new Error('IndexedDB unavailable');
					var request = indexedDB.open(dbName, 1);
					request.onupgradeneeded = function () {
						if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
					};
					request.onsuccess = function () { resolve(request.result); };
					request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
				} catch (error) { reject(error); }
			});
			dbPromise.catch(function () { dbPromise = null; });
			return dbPromise;
		}
		function get(key) {
			return open().then(function (db) {
				return new Promise(function (resolve, reject) {
					var request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
					request.onsuccess = function () { resolve(request.result || null); };
					request.onerror = function () { reject(request.error || new Error('IndexedDB read failed')); };
				});
			});
		}
		function put(key, value) {
			return open().then(function (db) {
				return new Promise(function (resolve, reject) {
					var tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).put(value, key);
					tx.oncomplete = function () { resolve(true); };
					tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB write failed')); };
				});
			});
		}
		function remove(key) {
			return open().then(function (db) {
				return new Promise(function (resolve, reject) {
					var tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).delete(key);
					tx.oncomplete = function () { resolve(true); };
					tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB delete failed')); };
				});
			});
		}
		function keys() {
			return open().then(function (db) {
				return new Promise(function (resolve, reject) {
					var objectStore = db.transaction(storeName, 'readonly').objectStore(storeName);
					if (typeof objectStore.getAllKeys !== 'function') { resolve([]); return; }
					var request = objectStore.getAllKeys();
					request.onsuccess = function () { resolve(Array.isArray(request.result) ? request.result : []); };
					request.onerror = function () { reject(request.error || new Error('IndexedDB key read failed')); };
				});
			});
		}
		return Object.freeze({ get: get, put: put, remove: remove, keys: keys });
	}

	return Object.freeze({
		bytes: bytes,
		digestSha384: digestSha384,
		fetchBytes: fetchBytes,
		fromBase64: fromBase64,
		pluginUrl: pluginUrl,
		resourceBytes: resourceBytes,
		sameOriginUrl: sameOriginUrl,
		shortUrl: shortUrl,
		store: store,
		toBase64: toBase64,
		verifySha384: verifySha384,
	});
})();
