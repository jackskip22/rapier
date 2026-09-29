// SPDX-License-Identifier: AGPL-3.0-only
// Verified plug-ins: pinned by version, length and SHA-384, verified from the bytes held, published as _rapierProviders[key] with
// status on `rapier:<key>plugin`. One loader for every plug-in the page downloads: a single bundle run as a script (MathJax,
// Mermaid, below), or pinned files handed to their owner (RapierPluginLoader.files: the text in pictures reader, Draw's
// letter sets).
// Packed after RapierBundleIO, which it uses.
(function () {
	'use strict';

	// The status every plug-in walks (checking, absent, downloading, installing, ready, error), said on its event and to its
	// listeners.
	function _announce(m, Plugin, listeners, s, err) {
		Plugin.status = s;
		Plugin.error  = err || null;
		var detail = { status: s, installed: (s === 'ready'), error: Plugin.error };
		if (typeof Plugin.progress === 'number') detail.progress = Plugin.progress;
		try { window.dispatchEvent(new CustomEvent('rapier:' + m.key + 'plugin', { detail: detail })); } catch (_) {}
		for (var i = 0; i < listeners.length; i++) {
			try { listeners[i](Plugin.status, Plugin); } catch (_) {}
		}
	}

	// The host that keeps the plug-ins itself (RapierPlatform.resources: Android's Google Play pack, SpeedRacer's declared
	// resources), or null where the page downloads them. Its bytes are held to the same SHA-384 as a download's.
	function _host() {
		var r = window.RapierPlatform && window.RapierPlatform.resources;
		return r && typeof r.ensure === 'function' ? r : null;
	}
	// The host says when its copy arrives, is on its way or leaves (Android: the one Play pack carries every plug-in, so one
	// arrival or one removal is every plug-in's at once).
	function _onHostChange(fn) {
		if (typeof window.addEventListener !== 'function') return;
		window.addEventListener('rapier:platform-resources', function (event) { fn((event && event.detail) || {}); });
	}

	// The person reads these words ("Last attempt failed: ..."); each plug-in keeps its own dash.
	function _friendly(m, err) {
		var s = String(err && err.message || err || 'unknown error'), d = m.dash;
		// The host's own words (Google Play's refusal, said by the app) are already the person's.
		if (/^Google Play /.test(s)) return s;
		if (/AbortError|aborted|timeout/i.test(s))
			return 'connection timed out' + d + 'check your internet and tap retry';
		if (/Failed to fetch|NetworkError|ERR_INTERNET|Unable to resolve|UnknownHost|networkerror/i.test(s))
			return 'no internet' + d + 'connect to a network and tap retry';
		if (/HTTP 4\d\d/.test(s)) return 'the download request was rejected' + d + 'tap retry';
		if (/HTTP 5\d\d/.test(s)) return 'jsDelivr is temporarily unavailable' + d + 'tap retry';
		if (/SHA-384 mismatch|unexpected size/.test(s)) return 'downloaded file failed verification' + d + 'refusing to install';
		if (/secure hash API unavailable/.test(s)) return 'this browser cannot securely verify the plug-in';
		if (/QuotaExceeded|quota/i.test(s)) return 'this device has no room to keep the ' + m.noun + d + 'free some space and tap retry';
		if (m.missing && s === m.missing) return 'the saved plug-in could not run' + d + 'removed; tap retry';
		return m.noun + ' plug-in could not be installed' + d + 'tap retry';
	}

	function _rapierVerifiedPlugin(m) {
		var KEY = m.cacheKey;
		var LS_KEY = RapierStorage.optional[m.key + 'LocalPrefix'] + KEY;
		var RESOURCE = 'rapier-' + m.key;
		var FETCH_TIMEOUT_MS = 25000;
		var Cache = RapierBundleIO.store(RapierStorage.optional[m.key + 'Db'], 'bundle');
		var d = m.dash, present = m.present || m.usable;

		var _listeners = [];
		var Plugin = _rapierProviders[m.key] = Object.seal({
			status: 'checking',
			version: m.version,
			error: null,
			downloadBytes: m.bytes,
			_pendingInstall: null,
			get installed() { return this.status === 'ready'; },
			on:        function (fn) { _listeners.push(fn); },
			install:   function () { return _install(false); },
			reinstall: function () { return _install(true); },
			isNeeded:  function () { return Plugin.status !== 'ready'; },
			// Delete on tap (editor/plugins.js): the copy this page holds, or the host's where the host can remove it (Android
			// removes the one Play pack, and every plug-in in it goes together); a host that cannot keeps it.
			get deletable() { var host = _host(); return !host || typeof host.remove === 'function'; },
			forget:    function () { return _forget(); },
			renderToString: function (src, opts) { return m.render(src, opts, Plugin.status === 'ready'); },
		});

		function _setStatus(s, err) { _announce(m, Plugin, _listeners, s, err); }

		function _idbGet(key) { return Cache.get(key).catch(function () { return null; }); }
		function _idbPut(key, value) { return Cache.put(key, value).catch(function () { return false; }); }
		function _idbDel(key) { return Cache.remove(key).catch(function () { return false; }); }

		function _lsGet() {
			try {
				var rec = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
				if (!rec || rec.sri !== m.sri || rec.version !== m.version || !rec.b64) return null;
				return { bytes: RapierBundleIO.fromBase64(rec.b64), sri: rec.sri, version: rec.version };
			} catch (_) { return null; }
		}
		function _lsPut(bytes) {
			try {
				localStorage.setItem(LS_KEY, JSON.stringify({
					version: m.version,
					sri: m.sri,
					savedAt: Date.now(),
					b64: RapierBundleIO.toBase64(bytes),
				}));
				return true;
			} catch (_) { return false; }
		}
		// Only the URL chain calls this: a host that ensures the resource returns earlier (_forgetCache keeps its guard).
		function _remember(bytes) {
			_idbPut(KEY, { bytes: bytes, sri: m.sri, version: m.version, savedAt: Date.now() });
			_lsPut(bytes);
		}
		function _forgetCache() {
			if (window.RapierPlatform && typeof window.RapierPlatform.resources.ensure === 'function') return;
			try { localStorage.removeItem(LS_KEY); } catch (_) {}
			_idbDel(KEY);
		}

		// Delete: the held copy leaves this browser (IndexedDB and the localStorage fallback) and the status says absent. The
		// renderer already running keeps running until the page reloads; nothing new is drawn with it (renderToString asks for
		// ready). A pending install finishes first, so it cannot write its copy back after the delete.
		function _forget() {
			if (!Plugin.deletable) return Promise.resolve(false);
			var pending = Plugin._pendingInstall ? Plugin._pendingInstall.catch(function () {}) : Promise.resolve();
			var host = _host();
			return pending.then(function () {
				if (host) return host.remove(RESOURCE);
				try { localStorage.removeItem(LS_KEY); } catch (_) {}
				return _idbDel(KEY);
			}).then(function () { _setStatus('absent'); return true; });
		}

		function _verifyBytes(value, source) {
			return RapierBundleIO.verifySha384(value, m.sri, { source: source, byteLength: m.bytes, sizeMessage: 'unexpected size from ' + source });
		}
		function _hostResourceBytes(value) {
			return RapierBundleIO.resourceBytes(value, m.noun + ' resource');
		}
		// A cached copy that fails verification is purged and reads as absent; a browser that cannot
		// verify at all is an error, never an unverified install.
		function _cacheRefused(err, what) {
			if (/secure hash API unavailable/.test(String(err && err.message || err))) throw err;
			_forgetCache();
			try { console.warn('[rapier] cached ' + m.noun + ' ' + what + ' failed verification:', err); } catch (_) {}
			return null;
		}
		function _verifiedCachedBytes() {
			if (window.RapierPlatform && typeof window.RapierPlatform.resources.read === 'function') {
				return window.RapierPlatform.resources.read(RESOURCE).then(function (value) {
					if (!value) return null;
					return _hostResourceBytes(value).then(function (bytes) {
						return _verifyBytes(bytes, 'platform cache');
					});
				}).catch(function (err) {
					if (/secure hash API unavailable/.test(String(err && err.message || err))) throw err;
					try { console.warn('[rapier] cached platform ' + m.noun + ' bundle failed verification:', err); } catch (_) {}
					return null;
				});
			}
			return _idbGet(KEY).then(function (rec) {
				if (!rec || !rec.bytes || rec.sri !== m.sri || rec.version !== m.version) return null;
				return _verifyBytes(rec.bytes, 'IndexedDB cache').catch(function (err) { return _cacheRefused(err, 'bundle'); });
			}).then(function (bytes) {
				if (bytes) return bytes;
				var rec = _lsGet();
				if (!rec || !rec.bytes) return null;
				return _verifyBytes(rec.bytes, 'localStorage cache').catch(function (err) { return _cacheRefused(err, 'fallback'); });
			});
		}

		function _sourceUrls() {
			var urls = [];
			var localUrl = RapierBundleIO.sameOriginUrl(m.file);
			if (localUrl) urls.push(localUrl);
			urls.push(m.cdn);
			var seen = Object.create(null);
			return urls.filter(function (u) {
				if (!u || seen[u]) return false;
				seen[u] = true;
				return true;
			});
		}

		function _fetchAndVerify() {
			_setStatus('downloading');
			if (window.RapierPlatform && typeof window.RapierPlatform.resources.ensure === 'function') {
				return window.RapierPlatform.resources.ensure(RESOURCE).then(_hostResourceBytes).then(function (bytes) {
					return _verifyBytes(bytes, 'platform resource');
				});
			}
			var urls = _sourceUrls();
			var lastErr = null;
			var chain = Promise.resolve(null);
			urls.forEach(function (url) {
				chain = chain.then(function (bytes) {
					if (bytes) return bytes;
					return RapierBundleIO.fetchBytes(url, FETCH_TIMEOUT_MS, { length: m.bytes })
						.then(function (bytes) { return _verifyBytes(bytes, RapierBundleIO.shortUrl(url)); })
						.catch(function (err) { lastErr = err; return null; });
				});
			});
			return chain.then(function (bytes) {
				if (bytes) { _remember(bytes); return bytes; }
				throw lastErr || new Error('could not download ' + m.noun + ' plug-in');
			});
		}

		// The engine the bundle defines must be usable, and configured where it takes configuration;
		// a copy that loads without it is purged so the next attempt downloads a fresh one.
		function _check() {
			if (!m.usable()) {
				_forgetCache();
				throw new Error(m.missing);
			}
			if (m.configure) m.configure();
		}

		function _loadVerifiedBundle(bytes) {
			if (present()) {
				if (m.configure) _check();
				return Promise.resolve();
			}
			if (m.prepare) m.prepare();
			var url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
			return new Promise(function (resolve, reject) {
				var s = document.createElement('script');
				s.src = url;
				s.async = false;
				s.onload = function () {
					URL.revokeObjectURL(url);
					Promise.resolve(m.started && m.started()).then(function () {
						if (m.configure) _check();
					}).then(resolve, reject);
				};
				s.onerror = function () {
					URL.revokeObjectURL(url);
					reject(new Error('the verified ' + m.name + ' bundle was blocked by this browser policy'));
				};
				document.head.appendChild(s);
			});
		}

		function _finishReady() {
			_check();
			_setStatus('ready');
		}

		function _install(force) {
			if (Plugin._pendingInstall) return Plugin._pendingInstall;

			var p = (function () {
				if (force) { _forgetCache(); return _fetchAndVerify(); }
				return _verifiedCachedBytes().then(function (bytes) {
					return bytes || _fetchAndVerify();
				});
			})().then(function (bytes) {
				_setStatus('installing');
				return _loadVerifiedBundle(bytes).then(function () {
					try { _finishReady(); }
					catch (_loadErr) {
						return _fetchAndVerify().then(function (fresh) {
							return _loadVerifiedBundle(fresh).then(_finishReady);
						});
					}
				});
			}).catch(function (err) {
				var msg = _friendlyError(err);
				try { console.error('[rapier] ' + m.noun + ' plug-in install failed:', err); } catch (_) {}
				_setStatus('error', msg);
				throw err;
			});

			Plugin._pendingInstall = p;
			p.then(function () { Plugin._pendingInstall = null; },
				function () { Plugin._pendingInstall = null; });
			return p;
		}

		function _friendlyError(err) { return _friendly(m, err); }

		// The host's copy on its way (another plug-in's row asked for the pack): this row says so; arrived: this one runs it
		// too; gone: absent; failed on the way: this row says the failure. While the boot is still reading, its end hears
		// what the host said last.
		var _hostSaid = null;
		function _followHost(detail) {
			if (!_host() || Plugin._pendingInstall || Plugin.status === 'checking' || Plugin.status === 'installing') return;
			if (detail.status === 'ready' && Plugin.status !== 'ready') _install(false).catch(function () {});
			else if (detail.status === 'absent' && Plugin.status !== 'absent') _setStatus('absent');
			else if (detail.status === 'downloading' && Plugin.status !== 'ready') _setStatus('downloading');
			else if (detail.status === 'error' && Plugin.status === 'downloading') _setStatus('error', detail.error || _friendly(m, detail.error));
		}
		_onHostChange(function (detail) { _hostSaid = detail; _followHost(detail); });

		(function boot() {
			_verifiedCachedBytes().then(function (bytes) {
				if (!bytes) {
					_setStatus('absent');
					if (_hostSaid) _followHost(_hostSaid);
					return;
				}
				_setStatus('installing');
				_loadVerifiedBundle(bytes).then(function () {
					try { _finishReady(); }
					catch (loadErr) {
						try { console.warn('[rapier] cached ' + m.noun + ' bundle unusable, purged:', loadErr); } catch (_) {}
						_setStatus('absent');
					}
				}).catch(function (err) {
					try { console.warn('[rapier] cached ' + m.noun + ' bundle load failed:', err); } catch (_) {}
					_forgetCache();
					_setStatus('absent');
				});
			}).catch(function () { _setStatus('absent'); });
		})();
	}

	// ---- MathJax: TeX to SVG, rendered synchronously once installed. -------------------------------
	var MATHJAX_VERSION = '4.1.3';
	_rapierVerifiedPlugin({
		key: 'math', noun: 'math', name: 'MathJax', dash: ' — ',
		version: MATHJAX_VERSION,
		cdn: 'https://cdn.jsdelivr.net/npm/mathjax@' + MATHJAX_VERSION + '/tex-svg.js',
		file: 'mathjax-tex-svg.js',
		// The exact length and SHA-384 of the pinned file: a download is bounded by the first as it streams (a longer body
		// refused before it is held, a shorter one after) and held to the second before anything stores or runs it.
		bytes: 1849625,
		sri: 'my9P1jDckpHD+5LZsLQ0gaiCl/RMO32HaqwBtbo/25QIMVr6xXIUCg1jvdSRcvb4',
		cacheKey: 'mathjax-tex-svg-v' + MATHJAX_VERSION,
		missing: 'MathJax loaded but tex2svg is missing — cache purged',
		usable: function () { return !!(window.MathJax && typeof window.MathJax.tex2svg === 'function'); },
		prepare: function () {
			window.MathJax = {
				loader: { load: ['[tex]/ams','[tex]/newcommand','[tex]/configmacros'] },
				tex: {
					packages: { '[+]': ['ams','newcommand','configmacros'] },
					inlineMath: [], displayMath: [],
				},
				// MathJax 4 breaks inline math into one <svg> per breakable piece; the page takes one drawing per
				// equation, so an inline equation is drawn whole, on the prose's baseline, and wraps as a word does.
				svg: { fontCache: 'none', linebreaks: { inline: false } },
				options: {
					skipHtmlTags: { '[+]': [] },
					ignoreHtmlClass: '.*',
					processHtmlClass: '__rapier_never__',
				},
				startup: { typeset: false },
			};
		},
		started: function () {
			return window.MathJax && window.MathJax.startup && window.MathJax.startup.promise;
		},
		render: function (src, opts, ready) {
			if (!ready) throw new Error('math plug-in is unavailable');
			var display = !!(opts && opts.displayMode);
			var node = window.MathJax.tex2svg(String(src == null ? '' : src), { display: display });
			var svg = (node && node.tagName && node.tagName.toLowerCase() === 'svg')
				? node
				: (node && node.querySelector ? node.querySelector('svg') : null);
			// A reader without sight is given the equation as it was written.
			if (svg) svg.setAttribute('aria-label', String(src == null ? '' : src));
			return svg ? svg.outerHTML : (node && node.outerHTML ? node.outerHTML : '');
		},
	});

	// ---- Mermaid: diagrams, strict and without HTML labels, rendered asynchronously. --------------
	var MERMAID_VERSION = '10.9.8';
	var MAX_SOURCE_LENGTH = 32768;
	var MAX_NODE_COUNT = 240;
	var MAX_EDGE_COUNT = 480;
	var _renderSeq = 0;

	function _stripDiagramNoise(src) {
		return String(src || '')
			.replace(/%%[^\n]*/g, '')
			.replace(/"[^"\n]*"/g, '""')
			.replace(/\[[^\]]*\]/g, '[]')
			.replace(/\([^)\n]*\)/g, '()')
			.replace(/\{[^}\n]*\}/g, '{}')
			.replace(/\|[^|\n]*\|/g, '||');
	}

	// Structure and styling words are not nodes.
	var KEYWORD = /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|subgraph|end|direction|classDef|class|click|style|linkStyle|accTitle|accDescr|title|section|%%)\b/i;

	// Mermaid's own separators, not a grammar: `;` ends a statement, `&` groups one side, both sides grouped is the product. A bare mention declares a node.
	function _countNodesAndEdges(src) {
		var body = _stripDiagramNoise(src);
		var lines = body.split('\n');
		var nodes = Object.create(null);
		var edges = 0;
		var i, j, k, p, line, statement, parts, side, sides, named, id;
		for (i = 0; i < lines.length; i++) {
			line = lines[i].replace(/^\s+|\s+$/g, '');
			if (!line) continue;
			// Split statements before testing for a structure word.
			var statements = line.split(';');
			for (j = 0; j < statements.length; j++) {
				statement = statements[j].replace(/^\s+|\s+$/g, '');
				if (!statement || KEYWORD.test(statement)) continue;
				parts = statement.split(/-->|-\.->|==>|---|~~~|->>|-->>|<-->|--x|--o/);
				sides = [];
				for (p = 0; p < parts.length; p++) {
					side = parts[p].split('&'); named = 0;
					for (k = 0; k < side.length; k++) {
						id = side[k].replace(/^\s+|\s+$/g, '').split(/\s+/)[0] || '';
						id = id.replace(/[^A-Za-z0-9_:-]/g, '');
						if (id) { nodes[id] = true; named++; }
					}
					// A side that named nothing is still one end of the arrow that was written.
					sides.push(named || 1);
				}
				for (p = 1; p < sides.length; p++) edges += sides[p - 1] * sides[p];
			}
		}
		return { nodes: Object.keys(nodes).length, edges: edges };
	}

	function _boundHit(src) {
		src = String(src == null ? '' : src);
		if (src.length > MAX_SOURCE_LENGTH) return 'source length';
		var counts = _countNodesAndEdges(src);
		if (counts.nodes > MAX_NODE_COUNT) return 'node count';
		if (counts.edges > MAX_EDGE_COUNT) return 'edge count';
		return null;
	}

	_rapierVerifiedPlugin({
		key: 'mermaid', noun: 'diagram', name: 'diagram', dash: ' -- ',
		version: MERMAID_VERSION,
		cdn: 'https://cdn.jsdelivr.net/npm/mermaid@' + MERMAID_VERSION + '/dist/mermaid.min.js',
		file: 'mermaid.min.js',
		bytes: 3337857,
		sri: 'N3QqR/7q+xm3BGX+CBbNI8AUmRRqcsDzToy+0z1NLDI0QmTKW8zvwLvqulJgk3dP',
		cacheKey: 'mermaid-min-v' + MERMAID_VERSION,
		missing: 'diagram plug-in loaded but render is missing -- cache purged',
		present: function () { return !!(window.mermaid && typeof window.mermaid.render === 'function'); },
		usable: function () {
			return !!(window.mermaid && typeof window.mermaid.initialize === 'function' &&
				typeof window.mermaid.render === 'function');
		},
		configure: function () {
			window.mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				htmlLabels: false,
				fontFamily: 'inherit',
				theme: 'neutral',
				flowchart: { htmlLabels: false, useMaxWidth: true },
				sequence: { useMaxWidth: true },
				gantt: { useMaxWidth: true, fontSize: 12, sectionFontSize: 12, barHeight: 24, barGap: 6 },
				er: { useMaxWidth: true },
			});
		},
		render: function (src, opts, ready) {
			var hit = _boundHit(src);
			if (hit) return Promise.reject(new Error(hit));
			if (!ready) return Promise.reject(new Error('diagram plug-in is unavailable'));
			var id = 'rapier-d' + (++_renderSeq);
			return window.mermaid.render(id, String(src == null ? '' : src)).then(function (out) {
				if (typeof out === 'string') return out;
				return (out && out.svg) ? out.svg : '';
			});
		},
	});
	// ---- A plug-in of several pinned files, handed to its owner (the text in pictures reader: a runtime, its WASM, two
	// models and their characters). The same path as a bundle: each file fetched from its pin with no cookie, no referrer
	// and no second copy in the browser's cache, bounded by its pinned length as it streams, held to its pinned SHA-384
	// (RapierBundleIO.verifySha384) before anything stores or runs it, a set that fails refused whole; kept under its version
	// in the plug-in's own store (RapierStorage.optional[key + 'Db']) and verified again each time it is handed over; the
	// same status on the same event, the same words when it fails, the same forget. Nothing here runs the files: `bytes()`
	// hands the owner a verified set, and the owner runs it where it chooses (a worker with no network of its own).
	// A host that keeps the plug-ins (RapierPlatform.resources, Android's Google Play pack) is asked first, one resource id per
	// file ('rapier-' + key + '-' + name; a plug-in of one file is 'rapier-' + key, as a bundle is: the contract the bundles
	// already use, one id and no second argument), each file held to the same pin; the page stores nothing the host keeps and
	// never reaches the CDN while the host answers.
	//   m: {key, noun, dash, version, files: [{name, url, bytes, sri}], timeoutMs, pack(bytes), unpack(value), store}
	//   `pack`/`unpack` shape what the store holds (gzip on the page); `store` is a test double's (RapierBundleIO's otherwise).
	function _rapierVerifiedFiles(m) {
		var KEY = m.version;
		var total = m.files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
		var Cache = m.store || RapierBundleIO.store(RapierStorage.optional[m.key + 'Db'], 'bundle');
		var pack = m.pack || function (bytes) { return bytes; };
		var unpack = m.unpack || function (value) { return value; };
		var listeners = [], pending = null;
		function id(file) { return 'rapier-' + m.key + (m.files.length > 1 ? '-' + file.name : ''); }
		// The host keeps this set when it knows its ids (Android's Play pack does); a host that does not (SpeedRacer's declared
		// resources, which name only the bundles) leaves the page its own path. The last answer decides what delete means.
		var viaHost = null;
		function keeper() {
			var host = _host();
			if (!host) return Promise.resolve(null);
			return Promise.resolve().then(function () { return host.status(id(m.files[0])); }).then(function (s) {
				return s && /^(?:absent|downloading|ready|error)$/.test(s.status) ? host : null;
			}, function () { return null; }).then(function (h) { viaHost = h; return h; });
		}
		var Plugin = _rapierProviders[m.key] = Object.seal({
			status: 'checking',
			version: m.version,
			error: null,
			progress: 0,
			downloadBytes: total,
			files: m.files,
			get deletable() { return !viaHost || typeof viaHost.remove === 'function'; },
			get installed() { return this.status === 'ready'; },
			on:        function (fn) { listeners.push(fn); },
			install:   function () { return install(false); },
			reinstall: function () { return install(true); },
			check:     check,
			bytes:     bytes,
			forget:    forget,
		});
		function set(s, err) { _announce(m, Plugin, listeners, s, err); }
		function complete(record) {
			return !!record && record.version === KEY && !!record.files && m.files.every(function (file) {
				return !!RapierBundleIO.bytes(record.files[file.name]);
			});
		}
		function verified(file, value) {
			return RapierBundleIO.verifySha384(value, file.sri, { byteLength: file.bytes, sizeMessage: 'unexpected size of ' + file.name, source: file.name });
		}
		function check() {
			return keeper().then(function (host) {
				if (host) {
					return Promise.all(m.files.map(function (file) { return Promise.resolve(host.status(id(file))).catch(function () { return null; }); }))
						.then(function (states) { set(states.every(function (s) { return s && s.status === 'ready'; }) ? 'ready' : 'absent'); });
				}
				return Cache.get(KEY).then(function (record) { set(complete(record) ? 'ready' : 'absent'); }, function () { set('absent'); });
			}).then(function () { return Plugin.status; });
		}
		// From the host: every file asked for (the first asks the host to bring what it keeps), each verified as it comes;
		// nothing is written to the page's store.
		function hostInstall(host) {
			Plugin.progress = 0; set('downloading');
			return m.files.reduce(function (chain, file) {
				return chain.then(function () { return host.ensure(id(file)); })
					.then(function (value) { return RapierBundleIO.resourceBytes(value, file.name); })
					.then(function (value) { return verified(file, value); });
			}, Promise.resolve()).then(function () { set('installing'); set('ready'); return Plugin; });
		}
		function install(force) {
			if (pending) return pending;
			pending = keeper().then(function (host) { return host ? hostInstall(host) : fetchInstall(force); }).catch(function (err) {
				try { console.error('[rapier] ' + m.noun + ' plug-in install failed:', err); } catch (_) {}
				set('error', _friendly(m, err));
				throw err;
			});
			pending.then(function () { pending = null; }, function () { pending = null; });
			return pending;
		}
		// From the pins: three files at a time, each bounded and verified as it streams, the set stored whole or not at all.
		function fetchInstall(force) {
			var held = Object.create(null), got = Object.create(null), next = 0, failure = null;
			function tick(file, n) {
				got[file.name] = n;
				var sum = 0; for (var name in got) sum += got[name];
				var percent = Math.floor(sum / total * 100);
				if (percent !== Plugin.progress) { Plugin.progress = percent; set('downloading'); }
			}
			function lane() {
				if (next >= m.files.length || failure) return Promise.resolve();
				var file = m.files[next++];
				return RapierBundleIO.fetchBytes(file.url, m.timeoutMs || 180000, { length: file.bytes, cache: 'no-store', onBytes: function (n) { tick(file, n); } })
					.then(function (value) { return verified(file, value); })
					.then(function (value) { held[file.name] = value; tick(file, file.bytes); }, function (err) { failure = failure || err; })
					.then(lane);
			}
			return (force ? Promise.resolve(null) : Cache.get(KEY).catch(function () { return null; })).then(function (record) {
				if (complete(record)) { set('ready'); return Plugin; }
				return Cache.remove(KEY).catch(function () {}).then(function () {
					Plugin.progress = 0; set('downloading');
					return Promise.all([lane(), lane(), lane()]);
				}).then(function () {
					if (failure) throw failure;
					set('installing');
					var record = { version: KEY, savedAt: Date.now(), files: {} };
					return m.files.reduce(function (chain, file) {
						return chain.then(function () { return pack(held[file.name]); }).then(function (value) { record.files[file.name] = value; });
					}, Promise.resolve()).then(function () { return Cache.put(KEY, record); });
				}).then(function () { set('ready'); return Plugin; });
			});
		}
		// The set, each file verified again: the host's, or the held set, which is forgotten whole and reads absent if it fails.
		function bytes() {
			return keeper().then(function (host) { return host ? hostBytes(host) : heldBytes(); });
		}
		// The host's set, each file verified as it is handed over; the host keeps it, so a failure is an error, not a forget.
		function hostBytes(host) {
			var out = {};
			return m.files.reduce(function (chain, file) {
				return chain.then(function () { return host.read(id(file)); }).then(function (value) {
					if (!value) throw new Error('The ' + m.noun + ' is not installed');
					return RapierBundleIO.resourceBytes(value, file.name);
				}).then(function (value) { return verified(file, value); }).then(function (value) { out[file.name] = value; });
			}, Promise.resolve()).then(function () { return out; }, function (err) {
				Plugin.progress = 0; set('error', _friendly(m, err)); throw err;
			});
		}
		function heldBytes() {
			return Cache.get(KEY).then(function (record) {
				if (!complete(record)) throw new Error('The ' + m.noun + ' is not installed');
				var out = {};
				return m.files.reduce(function (chain, file) {
					return chain.then(function () { return unpack(record.files[file.name]); })
						.then(function (value) { return verified(file, value); })
						.then(function (value) { out[file.name] = value; });
				}, Promise.resolve()).then(function () { return out; }, function (err) {
					return Cache.remove(KEY).catch(function () {}).then(function () { Plugin.progress = 0; set('absent', _friendly(m, err)); throw err; });
				});
			});
		}
		// Delete (editor/plugins.js): a pending install finishes first, then the store forgets every byte.
		function forget() {
			return (pending ? pending.catch(function () {}) : Promise.resolve()).then(keeper).then(function (host) {
				if (host && typeof host.remove !== 'function') return false;
				return (host ? host.remove(id(m.files[0])) : Cache.remove(KEY)).then(function () { Plugin.progress = 0; set('absent'); return true; });
			});
		}
		// The host's copy on its way (its progress is this row's, even while this row's own ask waits), failed on the way,
		// arrived or gone. The host may answer only after this loader was made (the app's state arrives after the page's
		// scripts run), so each word is asked again of the host, never of what was known when the loader was made.
		_onHostChange(function (detail) {
			if (!_host()) return;
			if (detail.status === 'downloading') {
				if (Plugin.status === 'ready' || Plugin.status === 'installing') return;
				Plugin.progress = Math.max(0, Math.min(100, Math.floor(Number(detail.progress) || 0))); set('downloading');
			} else if (pending) return;
			else if (detail.status === 'error') { if (Plugin.status === 'downloading') { Plugin.progress = 0; set('error', detail.error || _friendly(m, detail.error)); } }
			else { Plugin.progress = 0; check(); }
		});
		check();
		return Plugin;
	}
	window.RapierPluginLoader = Object.freeze({ files: _rapierVerifiedFiles });
})();
