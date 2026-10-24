// SPDX-License-Identifier: AGPL-3.0-only
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
		data = new Uint8Array(data);
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

	function hostedUrl(file) {
		if (globalThis.RAPIER_ASSET_BASE === undefined) return null;
		var base = new URL(globalThis.RAPIER_ASSET_BASE), target = new URL(file, base);
		if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash ||
			!base.pathname.endsWith('/') || target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.search || target.hash)
			throw new Error('The editor asset directory is invalid');
		return target.href;
	}

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

	function pluginUrl(file) {
		if (!pluginDirectory) return null;
		if (pluginDirectory.error) throw new Error(pluginDirectory.error);
		if (!file) throw new Error('The plug-in directory is set, but this plug-in file has no name in it');
		return new URL(String(file), pluginDirectory.url).href;
	}

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

	var cacheDb = null;
	function openCache() {
		if (cacheDb) return cacheDb;
		cacheDb = new Promise(function (resolve, reject) {
			var request = indexedDB.open('rapier:cache', 1);
			request.onupgradeneeded = function () { request.result.createObjectStore('files'); };
			request.onsuccess = function () { resolve(request.result); };
			request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
		});
		cacheDb.catch(function () { cacheDb = null; });
		return cacheDb;
	}
	function store(resource) {
		var prefix = resource + '/';
		function run(mode, act) {
			return openCache().then(function (db) {
				return new Promise(function (resolve, reject) {
					var tx = db.transaction('files', mode), request = act(tx.objectStore('files'));
					tx.oncomplete = function () { resolve(request.result); };
					tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB refused the cache')); };
				});
			});
		}
		return Object.freeze({
			get: function (key) { return run('readonly', function (s) { return s.get(prefix + key); }).then(function (value) { return value || null; }); },
			has: function (key) { return run('readonly', function (s) { return s.count(prefix + key); }).then(function (n) { return n > 0; }); },
			put: function (key, value) { return run('readwrite', function (s) { return s.put(value, prefix + key); }).then(function () { return true; }); },
			remove: function (key) { return run('readwrite', function (s) { return s.delete(prefix + key); }).then(function () { return true; }); },
			keys: function () {
				return run('readonly', function (s) { return s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff')); })
					.then(function (rows) { return rows.map(function (row) { return row.slice(prefix.length); }); });
			},
		});
	}

	return Object.freeze({
		bytes: bytes,
		digestSha384: digestSha384,
		fetchBytes: fetchBytes,
		fromBase64: fromBase64,
		pluginUrl: pluginUrl,
		hostedUrl: hostedUrl,
		resourceBytes: resourceBytes,
		sameOriginUrl: sameOriginUrl,
		shortUrl: shortUrl,
		store: store,
		toBase64: toBase64,
		verifySha384: verifySha384,
	});
})();
