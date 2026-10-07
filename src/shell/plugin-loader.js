// SPDX-License-Identifier: AGPL-3.0-only
// Verified plug-ins: pinned by version, length and SHA-384, verified from the bytes held, published as _rapierProviders[key] with
// status on `rapier:<key>plugin`. One loader for every plug-in the page downloads: a single bundle run as a script (MathJax,
// below), or pinned files handed to their owner (RapierPluginLoader.files: diagrams, the text in pictures reader, Draw's
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
			/* RAPIER_BUILTIN_PLUGIN_EXECUTE */
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
		cdn: 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@main/math/mathjax-' + MATHJAX_VERSION + '.offline-svg.js',
		file: 'mathjax-' + MATHJAX_VERSION + '.offline-svg.js',
		// The exact length and SHA-384 of the pinned file: a download is bounded by the first as it streams (a longer body
		// refused before it is held, a shorter one after) and held to the second before anything stores or runs it.
		bytes: 11948066,
		sri: 'wDGx1UhqWHiww1a2D8xGpGfoo5DNg2fGlytVMPYeyL2w9kz5HfO+i6h6IxNBnrB+',
		cacheKey: 'mathjax-offline-svg-v' + MATHJAX_VERSION,
		missing: 'MathJax loaded but its SVG renderer is missing — cache purged',
		usable: function () { return !!(window.RapierMath && typeof window.RapierMath.renderToString === 'function'); },
		render: function (src, opts, ready) {
			if (!ready) throw new Error('math plug-in is unavailable');
			return window.RapierMath.renderToString(src, opts);
		},
	});

	// ---- Mermaid: diagrams with inert labels and native MathML, rendered asynchronously. ----------
	var MERMAID_RESOURCES = /* RAPIER_MERMAID_RESOURCES */ null;
	var MERMAID_FONT_FAMILY = 'Geist, system-ui, sans-serif';
	var MERMAID_FONT_SIZE = 14;
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

	function _diagramResourceText(src) {
		var text = String(src == null ? '' : src), previous;
		// A detached textarea decodes character references without constructing a label subtree.
		var decoder = document.createElement('textarea');
		do {
			previous = text;
			decoder.innerHTML = text;
			text = decoder.value.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/\\(?:u([\da-fA-F]{4})|U([\da-fA-F]{8})|x([\da-fA-F]{2}))/g, function (_, short, long, byte) {
					var code = parseInt(short || long || byte, 16);
					return code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
				})
				.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[ \t\n\r\f])?|([^\n\r\f]))/gi, function (_, hex, char) {
					var code = hex ? parseInt(hex, 16) : 0;
					return hex ? code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd' : char;
				});
		} while (text !== previous);
		return text;
	}

	function _diagramResourceHit(src) {
		// Some diagram families attach authored CSS, and image shapes start an Image load before
		// Mermaid returns any SVG to Rapier's sanitizer. Refuse those resource instructions before
		// layout. This is a read-only check: neither a refused source nor ordinary link text changes.
		var source = String(src == null ? '' : src), text = _diagramResourceText(source);
		if (/(?:^|[^\w-])(?:url|src|image|(?:-webkit-)?image-set)\s*\(|@import\b/i.test(text)) {
			return 'Diagram CSS cannot load resources';
		}
		// The metadata's YAML can form an img key through an alias or sequence too. Inspect its
		// whole body, preserving quoted braces while finding the closing delimiter.
		var metadata = source.match(/@\{(?:[^"}]|"(?:[^"\\]|\\.)*")*\}/g) || [];
		if (metadata.some(function (body) { return /\bimg\b/i.test(_diagramResourceText(body)); })) {
			return 'Diagram image resources are unavailable';
		}
		return null;
	}

	function _rapierMermaidPalette(paint) {
		const t = {};
		const p = name => paint('--md-' + name);
		const set = (token, keys) => { for (const key of keys.split(' ')) t[key] = p(token); };
		const series = index => p('mermaid-series-' + index);
		const tint = index => p('mermaid-tint-' + index);
		const ink = p('color-text'), paper = p('color-bg'), surface = p('mermaid-surface');
		const border = p('mermaid-border'), grid = p('mermaid-grid'), muted = p('mermaid-muted');
		const onSeries = p('mermaid-on-series');

		set('color-text', 'text textColor primaryTextColor secondaryTextColor tertiaryTextColor titleColor labelColor actorTextColor signalTextColor labelTextColor loopTextColor noteTextColor taskTextOutsideColor classText stateLabelColor transitionLabelColor requirementTextColor relationLabelColor pieTitleTextColor pieSectionTextColor pieLegendTextColor vennTitleTextColor vennSetTextColor branchLabelColor tagLabelColor');
		set('color-text', 'lineColor defaultLinkColor signalColor arrowheadColor transitionColor specialStateColor innerEndBackground archEdgeColor archEdgeArrowColor relationColor emArrowhead emRelationStroke');
		set('color-bg', 'background compositeBackground altSectionBkgColor edgeLabelBackground relationLabelBackground rowOdd attributeBackgroundColorOdd commitLabelBackground');
		set('mermaid-surface', 'primaryColor tertiaryColor mainBkg nodeBkg actorBkg labelBoxBkgColor activationBkgColor stateBkg labelBackgroundColor compositeTitleBackground altBackground rectBkgColor personBkg requirementBackground tagLabelBackground rowEven attributeBackgroundColorEven emUiFill');
		set('color-surface', 'secondaryColor secondBkg clusterBkg sectionBkgColor sectionBkgColor2 excludeBkgColor');
		set('mermaid-border', 'contrast border1 border2 primaryBorderColor secondaryBorderColor tertiaryBorderColor nodeBorder clusterBorder actorBorder labelBoxBorderColor activationBorderColor personBorder archGroupBorderColor flowContainerStroke stateBorder requirementBorderColor tagLabelBorder emUiStroke emSwimlaneBackgroundStroke');
		set('mermaid-grid', 'gridColor actorLineColor');
		set('mermaid-muted', 'done doneTaskBkgColor doneTaskBorderColor commitLabelColor');
		set('mermaid-tint-6', 'note noteBkgColor');
		set('mermaid-series-6', 'noteBorderColor');
		set('mermaid-series-1', 'taskBkgColor taskBorderColor');
		set('mermaid-series-4', 'activeTaskBkgColor activeTaskBorderColor');
		set('mermaid-series-5', 'critical critBkgColor critBorderColor todayLineColor vertLineColor');
		set('mermaid-series-7', 'taskTextClickableColor');
		set('mermaid-on-series', 'taskTextLightColor taskTextColor taskTextDarkColor scaleLabelColor');
		// Number discs use line ink; their labels therefore use the page color.
		t.sequenceNumberColor = paper;
		t.errorBkgColor = tint(5); t.errorTextColor = ink;
		t.gradientStart = border; t.gradientStop = border;
		t.useGradient = false; t.dropShadow = 'none';

		for (let i = 0; i < 12; i++) {
			t['cScale' + i] = series(i + 1);
			t['cScalePeer' + i] = series(i + 1);
			t['cScaleInv' + i] = border;
			t['cScaleLabel' + i] = onSeries;
			t['pie' + (i + 1)] = tint(i + 1);
			if (i < 8) {
				t['fillType' + i] = tint(i + 1);
				t['git' + i] = series(i + 1);
				t['gitInv' + i] = onSeries;
				t['gitBranchLabel' + i] = onSeries;
				t['venn' + (i + 1)] = series(i + 1);
			}
			if (i < 5) {
				t['surface' + i] = surface;
				t['surfacePeer' + i] = border;
			}
		}
		t.pieStrokeColor = paper; t.pieOuterStrokeColor = border; t.pieOpacity = 1;
		for (let i = 1; i <= 4; i++) {
			t['quadrant' + i + 'Fill'] = p('color-surface');
			t['quadrant' + i + 'TextFill'] = ink;
		}
		t.quadrantPointFill = series(1);
		t.quadrantPointTextFill = ink; t.quadrantXAxisTextFill = ink; t.quadrantYAxisTextFill = ink;
		t.quadrantInternalBorderStrokeFill = border; t.quadrantExternalBorderStrokeFill = border;
		t.quadrantTitleFill = ink;
		t.xyChart = {
			backgroundColor: paper, titleColor: ink, dataLabelColor: ink, legendTextColor: ink,
			xAxisTitleColor: ink, xAxisLabelColor: ink, xAxisTickColor: border, xAxisLineColor: border,
			yAxisTitleColor: ink, yAxisLabelColor: ink, yAxisTickColor: border, yAxisLineColor: border,
			plotColorPalette: Array.from({length: 12}, (_, i) => series(i + 1)).join(',')
		};
		t.radar = {
			axisColor: ink, axisStrokeWidth: 2, axisLabelFontSize: 12,
			graticuleColor: grid, graticuleStrokeWidth: 1, graticuleOpacity: 0,
			curveOpacity: 0.16, curveStrokeWidth: 2, legendBoxSize: 12, legendFontSize: 12
		};
		t.cynefin = {
			boundaryColor: border, cliffColor: series(5), arrowColor: ink,
			complexBg: tint(4), complicatedBg: tint(1), chaoticBg: tint(5), clearBg: tint(6), confusionBg: tint(3),
			textColor: ink, labelColor: ink
		};
		t.wardleyEvolutionColor = series(2);
		t.wardley = {
			backgroundColor: paper, axisColor: border, axisTextColor: ink, gridColor: border,
			componentFill: surface, componentStroke: border, componentLabelColor: ink,
			linkStroke: ink, evolutionStroke: series(2), annotationStroke: border,
			annotationTextColor: ink, annotationFill: paper
		};
		t.packet = {
			startByteColor: ink, endByteColor: ink, labelColor: ink, titleColor: ink,
			blockStrokeColor: border, blockFillColor: surface
		};
		t.treemap = {
			sectionStrokeColor: border, sectionFillColor: surface,
			leafStrokeColor: border, leafFillColor: surface,
			titleColor: ink, labelColor: ink, valueColor: ink
		};
		t.treeView = {
			labelColor: ink, lineColor: border, iconColor: muted, descriptionColor: muted,
			highlightBg: tint(6), highlightStroke: series(6)
		};
		t.emProcessorFill = tint(3); t.emProcessorStroke = series(3);
		t.emReadModelFill = tint(4); t.emReadModelStroke = series(4);
		t.emCommandFill = tint(7); t.emCommandStroke = series(7);
		t.emEventFill = tint(2); t.emEventStroke = series(2);
		t.emSwimlaneBackgroundOdd = p('color-surface');
		return t;
	}

	function _rapierMermaidPresentation() {
		const tokens = ['--md-color-text', '--md-color-bg', '--md-color-surface',
			'--md-mermaid-surface', '--md-mermaid-border', '--md-mermaid-grid', '--md-mermaid-muted', '--md-mermaid-on-series'];
		for (let i = 1; i <= 12; i++) tokens.push('--md-mermaid-series-' + i, '--md-mermaid-tint-' + i);
		const reference = getComputedStyle(document.documentElement), sampler = document.createElement('span');
		sampler.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;contain:layout style paint';
		sampler.style.setProperty('color-scheme', 'light', 'important');
		// Copy the reference declarations themselves: app aliases on .md-render and an
		// active dark theme must not change the light colors supplied to native layout.
		for (const token of tokens) sampler.style.setProperty(token, reference.getPropertyValue(token));
		document.body.appendChild(sampler);
		const values = new Map(), roles = new Map();
		try {
			for (const token of tokens) {
				sampler.style.color = 'var(' + token + ')';
				const value = getComputedStyle(sampler).color;
				const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
				if (!rgb) throw new Error('The diagram reference palette is unavailable');
				const hex = '#' + rgb.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join('');
				values.set(token, hex); roles.set(hex, token);
			}
		} finally { sampler.remove(); }
		return {
			themeVariables: _rapierMermaidPalette(token => values.get(token)),
			paint: function (hex, alpha, context) {
				const color = String(hex).toLowerCase();
				let token;
				if (context && context.family === 'zenuml') {
					if (context.inline) return null;
					token = {
						'#ffffff': '--md-color-bg', '#666666': '--md-mermaid-border',
						'#222222': '--md-color-text', '#000000': '--md-color-text', '#333333': '--md-color-text',
						'#dedede': '--md-mermaid-tint-1', '#e5e7eb': '--md-mermaid-grid',
						'#6b7280': '--md-mermaid-muted', '#aaaa33': '--md-mermaid-series-6', '#fff5ad': '--md-mermaid-tint-6'
					}[color];
				}
				if (context && context.family === 'wardley' && !context.inline && color === '#000000') token = '--md-color-text';
				if (!token) token = roles.get(color);
				// Timeline shares its label inverse with the baseline; admit that structural stroke as a border.
				if (context && context.family === 'timeline' && !context.inline && context.property === 'stroke' &&
					token === '--md-mermaid-on-series') token = '--md-mermaid-border';
				if (!token) return null;
				const value = 'var(' + token + ')';
				return alpha === 1 ? value : 'color-mix(in srgb, ' + value + ' ' + (alpha * 100) + '%, transparent)';
			}
		};
	}

	var _mermaidRealm = null, _mermaidStarting = null, _mermaidGeneration = 0;
	var _mermaidPresentation = null, _mermaidFontFaces = [], _mermaidScriptCancels = new Set();
	function _disposeMermaid() {
		_mermaidGeneration++;
		_mermaidScriptCancels.forEach(function (cancel) { cancel(); });
		if (_mermaidRealm) _mermaidRealm.remove();
		_mermaidRealm = null; _mermaidStarting = null; _mermaidPresentation = null;
		_mermaidFontFaces.forEach(function (face) { document.fonts.delete(face); });
		_mermaidFontFaces = [];
	}
	function _executeDiagramBundle(owner, bytes, name) {
		var runtime = owner.defaultView, script = owner.createElement('script'), thrown = null;
		function caught(event) { thrown = event.error || new Error(event.message); event.preventDefault(); }
		runtime.addEventListener('error', caught);
		if (globalThis.RAPIER_APPS_HOST === true) {
			try {
				script.textContent = new TextDecoder('utf-8', {fatal: true}).decode(bytes) + '\n//# sourceURL=' + name;
				owner.head.appendChild(script);
				if (thrown) throw thrown;
				return Promise.resolve();
			} catch (error) { return Promise.reject(error); }
			finally { runtime.removeEventListener('error', caught); script.remove(); }
		}
		return new Promise(function (resolve, reject) {
			var url = null, finished = false;
			function cancel() { finish(new Error('The diagram renderer was released')); }
			function finish(error) {
				if (finished) return;
				finished = true; _mermaidScriptCancels.delete(cancel);
				runtime.removeEventListener('error', caught); script.onload = null; script.onerror = null; script.remove();
				if (url) URL.revokeObjectURL(url);
				if (error) reject(error); else resolve();
			}
			_mermaidScriptCancels.add(cancel);
			try {
				url = URL.createObjectURL(new Blob([bytes], {type: 'text/javascript'}));
				script.src = url; script.async = false;
				script.onload = function () { finish(thrown); };
				script.onerror = function () { finish(new Error('The verified diagram bundle was blocked by this browser policy')); };
				owner.head.appendChild(script);
			} catch (error) { finish(error); }
		});
	}
	function _prepareMermaid(files) {
		if (_mermaidStarting) return _mermaidStarting;
		var generation = _mermaidGeneration;
		_mermaidStarting = Promise.resolve().then(function () {
			var frame = document.createElement('iframe');
			frame.setAttribute('aria-hidden', 'true'); frame.inert = true; frame.tabIndex = -1;
			frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;opacity:0;visibility:hidden;pointer-events:none;border:0;contain:layout style paint';
			document.body.appendChild(frame); _mermaidRealm = frame;
			var owner = frame.contentDocument, runtime = frame.contentWindow;
			var policy = owner.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
			policy.content = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
			owner.head.appendChild(policy);
			return _executeDiagramBundle(owner, files.core, 'mermaid.min.js').then(function () {
				return _executeDiagramBundle(owner, files.zenuml, 'rapier-zenuml-4.5.0-1.js');
			}).then(function () {
				if (!runtime.mermaid || typeof runtime.mermaid.render !== 'function' || !runtime.RapierZenUML ||
					typeof runtime.RapierZenUML.register !== 'function' || typeof runtime.RapierZenUML.allowSvgStyleAttribute !== 'function')
					throw new Error('The verified diagram renderer is incomplete');
				return runtime.RapierZenUML.register(runtime.mermaid);
			}).then(function () {
				if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
				runtime.document.fonts.forEach(function (face) {
					if (face.status === 'loaded' && !document.fonts.has(face)) { document.fonts.add(face); _mermaidFontFaces.push(face); }
				});
				return runtime;
			});
		}).catch(function (error) { if (generation === _mermaidGeneration) _disposeMermaid(); throw error; });
		return _mermaidStarting;
	}
	function _configureMermaid(runtime) {
		if (_mermaidPresentation) return;
		var presentation = _rapierMermaidPresentation();
		// C4 owns separate font slots; set every supported slot before it measures labels.
		var c4 = Object.fromEntries(('person external_person system external_system system_db external_system_db ' +
			'system_queue external_system_queue boundary message container external_container container_db external_container_db ' +
			'container_queue external_container_queue component external_component component_db external_component_db ' +
			'component_queue external_component_queue').split(' ').map(function (kind) { return [kind + 'FontFamily', MERMAID_FONT_FAMILY]; }));
			runtime.mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				suppressErrorRendering: true,
				htmlLabels: true,
				legacyMathML: false,
				forceLegacyMathML: false,
				maxTextSize: MAX_SOURCE_LENGTH,
				maxEdges: MAX_EDGE_COUNT,
				// Source configuration cannot weaken the host's markup, error or resource boundaries.
				secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
					'suppressErrorRendering', 'htmlLabels', 'dompurifyConfig', 'legacyMathML',
					'forceLegacyMathML', 'themeCSS', 'fontFamily', 'fontSize'],
				// Labels are measured in a network-closed renderer realm. Only static SVG primitive
				// styling is admitted there; HTML label styling remains excluded. Final SVG sanitation
				// still owns every result returned to the document.
				dompurifyConfig: {
					ALLOWED_TAGS: ['div', 'span', 'p', 'br', 'strong', 'em', 'b', 'i', 's', 'u', 'del', 'code', 'sub', 'sup', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
						'math', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'ms', 'msub', 'msup', 'msubsup', 'mfrac', 'msqrt',
						'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'munder', 'mover', 'munderover',
						'mtable', 'mtr', 'mtd', 'mlabeledtr', 'mmultiscripts', 'mprescripts', 'none', 'semantics'],
					ALLOWED_ATTR: ['xmlns', 'viewBox', 'd', 'fill', 'fill-rule', 'clip-rule',
						'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform',
						'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'display', 'mathvariant', 'mathsize', 'mathcolor', 'mathbackground', 'dir', 'accent',
						'accentunder', 'columnalign', 'columnlines', 'columnspacing', 'columnspan', 'columnwidth', 'depth',
						'displaystyle', 'equalcolumns', 'equalrows', 'fence', 'frame', 'framespacing', 'height', 'largeop',
						'linebreak', 'linethickness', 'lspace', 'maxsize', 'minsize', 'movablelimits', 'notation', 'rowalign',
						'rowlines', 'rowspacing', 'rowspan', 'rspace', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier',
						'separator', 'stretchy', 'subscriptshift', 'superscriptshift', 'valign', 'voffset', 'width'],
					ADD_ATTR: runtime.RapierZenUML.allowSvgStyleAttribute,
					ALLOW_DATA_ATTR: false,
					ALLOW_ARIA_ATTR: false,
				},
				fontFamily: MERMAID_FONT_FAMILY,
				fontSize: MERMAID_FONT_SIZE,
				theme: 'base', look: 'classic',
				themeVariables: Object.assign({}, presentation.themeVariables, { fontSize: MERMAID_FONT_SIZE + 'px' }),
				radar: { marginLeft: 80, marginRight: 120 },
				c4: c4,
				flowchart: { useMaxWidth: true },
				sequence: { useMaxWidth: true },
				gantt: { useMaxWidth: true, useWidth: 1200, fontSize: MERMAID_FONT_SIZE, sectionFontSize: MERMAID_FONT_SIZE, barHeight: 24, barGap: 6 },
				er: { useMaxWidth: true },
			});
		_mermaidPresentation = presentation;
	}

	// The resource object is spliced in at build. A source-only shell (the math witness) has none,
	// and must still load this file: math does not depend on the diagram set.
	if (MERMAID_RESOURCES) _rapierVerifiedFiles({
		key: 'mermaid', noun: 'diagram', dash: ' -- ',
		version: MERMAID_RESOURCES.version, files: MERMAID_RESOURCES.files,
		prepare: _prepareMermaid, discard: _disposeMermaid,
		presentationPaint: function (hex, alpha, context) { return _mermaidPresentation ? _mermaidPresentation.paint(hex, alpha, context) : null; },
		exportFontCss: function () { return _mermaidRealm && _mermaidRealm.contentWindow.RapierZenUML ? _mermaidRealm.contentWindow.RapierZenUML.fontCss : ''; },
		render: function (src, opts, ready) {
			var hit = _boundHit(src); if (hit) return Promise.reject(new Error(hit));
			var resourceHit = _diagramResourceHit(src); if (resourceHit) return Promise.reject(new Error(resourceHit));
			if (!ready || !_mermaidStarting) return Promise.reject(new Error('diagram plug-in is unavailable'));
			var id = 'rapier-d' + (++_renderSeq), generation = _mermaidGeneration;
			return _mermaidStarting.then(function (runtime) {
				return document.fonts.load(MERMAID_FONT_SIZE + 'px ' + MERMAID_FONT_FAMILY).then(function () { return document.fonts.ready; }).then(function () {
					if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
					document.fonts.forEach(function (face) { if (face.status === 'loaded' && !runtime.document.fonts.has(face)) runtime.document.fonts.add(face); });
					_configureMermaid(runtime);
					var container = runtime.document.createElement('div'); runtime.document.body.appendChild(container);
					return Promise.resolve().then(function () { return runtime.mermaid.render(id, String(src == null ? '' : src), container); })
						.then(function (out) { if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released'); return out.svg; })
						.finally(function () { container.remove(); });
				});
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
		/* RAPIER_BUILTIN_FILES_REUSE */
		var KEY = m.version;
		var total = m.files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
		var Cache = m.store || RapierBundleIO.store(RapierStorage.optional[m.key + 'Db'], 'bundle');
		var pack = m.pack || function (bytes) { return bytes; };
		var unpack = m.unpack || function (value) { return value; };
		var listeners = [], pending = null, checking = null, removing = null;
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
			isNeeded: function () { return Plugin.status !== 'ready'; },
			renderToString: m.render ? function (src, opts) { return m.render(src, opts, Plugin.status === 'ready'); } : undefined,
			presentationPaint: m.presentationPaint,
			exportFontCss: m.exportFontCss,
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
		function prepared() {
			if (!m.prepare) { set('ready'); return Promise.resolve(Plugin); }
			set('installing');
			return bytes().then(m.prepare).then(function () { set('ready'); return Plugin; });
		}
		function check() {
			if (pending || removing) return (removing || pending).then(function () { return Plugin.status; }, function () { return Plugin.status; });
			if (checking) return checking;
			checking = keeper().then(function (host) {
				if (host) return Promise.all(m.files.map(function (file) { return Promise.resolve(host.status(id(file))).catch(function () { return null; }); }))
					.then(function (states) { return states.every(function (s) { return s && s.status === 'ready'; }); });
				return Cache.get(KEY).then(complete, function () { return false; });
			}).then(function (available) {
				if (available) return prepared();
				if (m.discard) m.discard();
				set('absent');
			}).then(function () { return Plugin.status; }, function (err) { set('error', _friendly(m, err)); return Plugin.status; });
			checking.then(function () { checking = null; });
			return checking;
		}
		// From the host: every file asked for (the first asks the host to bring what it keeps), each verified as it comes;
		// nothing is written to the page's store.
		function hostInstall(host) {
			Plugin.progress = 0; set('downloading');
			return m.files.reduce(function (chain, file) {
				return chain.then(function () { return host.ensure(id(file)); })
					.then(function (value) { return RapierBundleIO.resourceBytes(value, file.name); })
					.then(function (value) { return verified(file, value); });
			}, Promise.resolve()).then(prepared);
		}
		function install(force) {
			if (removing) return removing.then(function () { return install(force); });
			if (pending) return pending;
			// A cache check may prepare a renderer. Finish that same ownership operation
			// before replacing it, so a late check cannot revive a removed instance.
			pending = (checking || Promise.resolve()).then(function () {
				if (force && m.discard) m.discard();
				return keeper();
			}).then(function (host) { return host ? hostInstall(host) : fetchInstall(force); }).catch(function (err) {
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
				var localUrl = file.file && RapierBundleIO.sameOriginUrl(file.file);
				var urls = localUrl ? [localUrl, file.url] : [file.url];
				function attempt(index) {
					return RapierBundleIO.fetchBytes(urls[index], m.timeoutMs || 180000, { length: file.bytes, cache: 'no-store', onBytes: function (n) { tick(file, n); } })
						.then(function (value) { return verified(file, value); }).catch(function (error) {
							if (index + 1 < urls.length) return attempt(index + 1);
							throw error;
						});
				}
				return attempt(0)
					.then(function (value) { held[file.name] = value; tick(file, file.bytes); }, function (err) { failure = failure || err; })
					.then(lane);
			}
			return (force ? Promise.resolve(null) : Cache.get(KEY).catch(function () { return null; })).then(function (record) {
				if (complete(record)) return prepared();
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
				}).then(prepared);
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
			if (removing) return removing;
			removing = (pending || checking || Promise.resolve()).catch(function () {}).then(keeper).then(function (host) {
				if (host && typeof host.remove !== 'function') return false;
				return (host ? host.remove(id(m.files[0])) : Cache.remove(KEY)).then(function () { if (m.discard) m.discard(); Plugin.progress = 0; set('absent'); return true; });
			});
			removing.then(function () { removing = null; }, function () { removing = null; });
			return removing;
		}
		// The host's copy on its way (its progress is this row's, even while this row's own ask waits), failed on the way,
		// arrived or gone. The host may answer only after this loader was made (the app's state arrives after the page's
		// scripts run), so each word is asked again of the host, never of what was known when the loader was made.
		_onHostChange(function (detail) {
			if (!_host()) return;
			if (detail.status === 'downloading') {
				if (Plugin.status === 'ready' || Plugin.status === 'installing') return;
				Plugin.progress = Math.max(0, Math.min(100, Math.floor(Number(detail.progress) || 0))); set('downloading');
			} else if (pending || removing) return;
			else if (detail.status === 'error') { if (Plugin.status === 'downloading') { Plugin.progress = 0; set('error', detail.error || _friendly(m, detail.error)); } }
			else { Plugin.progress = 0; check(); }
		});
		check();
		return Plugin;
	}
	window.RapierPluginLoader = Object.freeze({ files: _rapierVerifiedFiles });
})();
