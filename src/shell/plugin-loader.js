// SPDX-License-Identifier: AGPL-3.0-only
(function () {
	'use strict';
	var _portableReaders = Object.create(null);
	function _policy() { return window.RapierPlatform?.environment.native === true ? 'this app’s policy' : 'this browser policy'; }

	function _host() {
		var r = window.RapierPlatform && window.RapierPlatform.resources;
		return r && typeof r.ensure === 'function' ? r : null;
	}
	function _onHostChange(key, fn) {
		if (typeof window.addEventListener !== 'function') return;
		window.addEventListener('rapier:platform-resources', function (event) {
			var detail = (event && event.detail) || {};
			if (Array.isArray(detail.plugins) && detail.plugins.indexOf(String(key).split('-')[0]) < 0) return;
			fn(detail);
		});
	}

	function _friendly(m, err, host) {
		var s = String(err && err.message || err || 'unknown error'), d = m.dash;
		if (/^Google Play(?: |'s )/.test(s)) return s;
		if (/^The plug-in directory /.test(s)) return s;
		if (host) {
			if (/SHA-384 mismatch|unexpected size/.test(s)) return 'this app’s ' + m.noun + ' plug-in failed verification' + d + 'refusing to run it';
			if (/secure hash API unavailable/.test(s)) return 'this device cannot securely verify the plug-in';
			if (m.missing && s === m.missing) return 'this app’s ' + m.noun + ' plug-in could not run' + d + 'tap retry';
			return 'this app could not read its ' + m.noun + ' plug-in' + d + 'tap retry';
		}
		if (/AbortError|aborted|timeout/i.test(s))
			return 'connection timed out' + d + 'check your internet and tap retry';
		if (/Failed to fetch|NetworkError|ERR_INTERNET|Unable to resolve|UnknownHost|networkerror/i.test(s))
			return 'no internet' + d + 'connect to a network and tap retry';
		if (/HTTP 4\d\d/.test(s)) return 'the download request was rejected' + d + 'tap retry';
		if (/HTTP 5\d\d/.test(s)) return 'jsDelivr is temporarily unavailable' + d + 'tap retry';
		if (/SHA-384 mismatch|unexpected size/.test(s)) return 'downloaded file failed verification' + d + 'refusing to install';
		if (/secure hash API unavailable/.test(s)) return (window.RapierPlatform?.environment.native === true ? 'this device' : 'this browser') + ' cannot securely verify the plug-in';
		if (/QuotaExceeded|quota/i.test(s)) return 'this device has no room to keep the ' + m.noun + d + 'free some space and tap retry';
		if (m.missing && s === m.missing) return 'the saved plug-in could not run' + d + 'removed; tap retry';
		return m.noun + ' plug-in could not be installed' + d + 'tap retry';
	}

	function _runScript(bytes, name) {
		var script = document.createElement('script');
		if (globalThis.RAPIER_APPS_HOST === true) {
			script.textContent = new TextDecoder('utf-8', {fatal: true}).decode(bytes) + '\n//# sourceURL=' + name;
			try { document.head.appendChild(script); } finally { script.remove(); }
			return Promise.resolve();
		}
		return new Promise(function (resolve, reject) {
			var url = URL.createObjectURL(new Blob([bytes], {type: 'text/javascript'}));
			script.async = false; script.src = url;
			script.onload = function () { URL.revokeObjectURL(url); resolve(); };
			script.onerror = function () { URL.revokeObjectURL(url); reject(new Error((window.RapierPlatform?.environment.native === true ? 'this app' : 'this browser') + ' blocked the verified ' + name)); };
			document.head.appendChild(script);
		});
	}

	var MATH_VERSION = '2.7.0';
	var MATH_FILE = 'rapier-math-' + MATH_VERSION + '.js';
	_rapierVerifiedFiles({
		key: 'math', noun: 'math', dash: ' — ',
		version: MATH_VERSION,
		files: [{name: MATH_FILE, file: MATH_FILE, version: MATH_VERSION,
			bytes: 742684,
			sri: '1rjhOOw690Mr3aVXwRTPlwQO2atMrWHY8Rm3nZ+SZRrm5mB9HK5FkY6ZWCDYtgzv',
			url: 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.26/math/rapier-math-2.7.0.js'}],
		missing: 'Rapier math loaded but its SVG renderer is missing — cache purged',
		usable: function () { return !!(window.RapierMath && window.RapierMath.version === MATH_VERSION &&
			typeof window.RapierMath.renderToString === 'function' && typeof window.RapierMath.renderWithMathML === 'function'); },
		render: function (src, opts, ready) {
			if (!ready) throw new Error('math plug-in is unavailable');
			return window.RapierMath.renderToString(src, opts);
		},
		renderWithMathML: function (src, opts, ready) {
			if (!ready) throw new Error('Rapier math is not ready');
			return window.RapierMath.renderWithMathML(src, opts);
		},
	});

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
			.replace(/\[[^\]\n]*\]/g, '[]')
			.replace(/\([^)\n]*\)/g, '()')
			.replace(/\{[^}\n]*\}/g, '{}')
			.replace(/\|[^|\n]*\|/g, '||');
	}

	var KEYWORD = /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|subgraph|end|direction|classDef|class|click|style|linkStyle|accTitle|accDescr|title|section|%%)\b/i;

	function _countNodesAndEdges(src) {
		var body = _stripDiagramNoise(src);
		var lines = body.split('\n');
		var nodes = Object.create(null);
		var edges = 0;
		var i, j, k, p, line, statement, parts, side, sides, named, id;
		for (i = 0; i < lines.length; i++) {
			line = lines[i].replace(/^\s+|\s+$/g, '');
			if (!line) continue;
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
		var source = String(src == null ? '' : src), text = _diagramResourceText(source);
		if (/(?:^|[^\w-])(?:url|src|image|(?:-webkit-)?image-set)\s*\(|@import\b/i.test(text)) {
			return 'Diagram CSS cannot load resources';
		}
		var metadata = source.match(/@\{(?:[^"}]|"(?:[^"\\]|\\.)*")*\}/g) || [];
		if (metadata.some(function (body) { return /\bimg\b/i.test(_diagramResourceText(body)); })) {
			return 'Diagram image resources are unavailable';
		}
		return null;
	}


	var _mermaidRealm = null, _mermaidStarting = null, _mermaidGeneration = 0, _mermaidRendering = 0;
	var _zenumlStarting = null, _mermaidFontFaces = [], _mermaidScriptCancels = new Set();
	function _disposeMermaid() {
		_mermaidGeneration++;
		_mermaidScriptCancels.forEach(function (cancel) { cancel(); });
		if (_mermaidRealm) _mermaidRealm.remove();
		_mermaidRealm = null; _mermaidStarting = null; _zenumlStarting = null;
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
				script.onerror = function () { finish(new Error('The verified diagram bundle was blocked by ' + _policy())); };
				owner.head.appendChild(script);
			} catch (error) { finish(error); }
		});
	}
	function _zenumlPaint(hex, alpha, context) {
		if (!context || context.family !== 'zenuml' || context.inline) return null;
		var token = {'#ffffff': '--md-color-bg', '#666666': '--md-mermaid-border',
			'#222222': '--md-color-text', '#000000': '--md-color-text', '#333333': '--md-color-text',
			'#dedede': '--md-mermaid-tint-1', '#e5e7eb': '--md-mermaid-grid',
			'#6b7280': '--md-mermaid-muted', '#aaaa33': '--md-mermaid-series-6', '#fff5ad': '--md-mermaid-tint-6'}[String(hex).toLowerCase()];
		if (!token) return null;
		var value = 'var(' + token + ')';
		return alpha === 1 ? value : 'color-mix(in srgb, ' + value + ' ' + (alpha * 100) + '%, transparent)';
	}

	function _presentPele(svg, runtime) {
		const tree = new runtime.DOMParser().parseFromString(svg.toWellFormed(), 'image/svg+xml'), drawing = tree.documentElement;
		if (drawing.localName !== 'svg') throw new Error('The diagram renderer returned no SVG');
		for (const shape of drawing.querySelectorAll('.pele-node > rect, .pele-cluster > rect')) {
			if (shape.getAttribute('stroke') === 'var(--_b)') shape.setAttribute('stroke', 'none');
		}
		for (const rect of drawing.querySelectorAll('.pele-state > rect, .pele-edge-label > rect, .pele-legend-item > rect')) {
			rect.setAttribute('rx', '0'); rect.setAttribute('ry', '0');
		}
		for (const rect of drawing.querySelectorAll('.pele-edge-label > rect')) rect.setAttribute('fill', 'var(--md-color-bg)');
		for (const edges of drawing.querySelectorAll('.pele-edges')) edges.setAttribute('stroke-width', '2');
		for (const figure of drawing.querySelectorAll('.pele-actor-actor > circle, .pele-actor-actor > path')) {
			figure.setAttribute('stroke', 'var(--_l)'); figure.setAttribute('stroke-width', '2');
		}
		for (const label of drawing.querySelectorAll('text')) {
			if (label.closest('[fill]')?.getAttribute('fill') !== 'var(--_bg)') continue;
			let owner = label.parentElement, ground;
			while (owner && owner !== drawing && !ground) {
				ground = [...owner.children].find(shape => ['rect', 'polygon', 'circle', 'path'].includes(shape.localName) &&
					shape.hasAttribute('fill') && shape.getAttribute('fill') !== 'none' &&
					Number(shape.getAttribute('fill-opacity') ?? 1) === 1);
				owner = owner.parentElement;
			}
			label.setAttribute('fill', ground ? 'contrast-color(' + ground.getAttribute('fill') + ')' : 'var(--_fg)');
		}
		const paint = typeof runtime.Path2D === 'function' && runtime.document.createElement('canvas').getContext('2d');
		const slices = [...drawing.querySelectorAll('.pele-slice')];
		for (const labels of drawing.querySelectorAll('.pele-slice-labels')) {
			labels.setAttribute('fill', 'var(--_fg)');
			if (!paint) continue;
			for (const label of labels.querySelectorAll('text')) {
				const x = Number(label.getAttribute('x')), y = Number(label.getAttribute('y')) - Number(labels.getAttribute('font-size') || 14) * .35;
				const slice = slices.find(path => paint.isPointInPath(new runtime.Path2D(path.getAttribute('d')), x, y));
				if (slice) label.setAttribute('fill', 'contrast-color(' + slice.getAttribute('fill') + ')');
			}
		}
		return new runtime.XMLSerializer().serializeToString(drawing);
	}

	function _renderPele(runtime, source, id) {
		const options = {idPrefix: id, fontFamily: MERMAID_FONT_FAMILY, fontSize: MERMAID_FONT_SIZE,
			padding: 16, limit: MAX_SOURCE_LENGTH, maxEdges: MAX_EDGE_COUNT, images: false};
		if (runtime.pele.detectType(source) === 'pie') {
			const model = runtime.pele.parse(source, options);
			const literal = text => text?.replace(/</g, '&lt;').replace(/>/g, '&gt;');
			model.sections = new Map([...model.sections].map(([label, value]) => [literal(label), value]));
			source = model;
		}
		return _presentPele(runtime.pele.render(source, options).svg, runtime);
	}

	function zenumlSource(source) {
		let text = String(source ?? '').replace(/^\uFEFF/, '').trimStart();
		text = text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
		text = text.replace(/^(?:\s|%%\{[\s\S]*?\}%%|%%[^\n]*(?:\n|$))*/, '');
		return /^zenuml\b/.test(text) ? text : null;
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
			return _executeDiagramBundle(owner, files.core, 'pele-1.6.0.js').then(function () {
				if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
				if (typeof runtime.pele?.render !== 'function') throw new Error('The verified diagram renderer is incomplete');
				return runtime;
			});
		}).catch(function (error) { if (generation === _mermaidGeneration) _disposeMermaid(); throw error; });
		return _mermaidStarting;
	}

	function _prepareZenUML(runtime) {
		if (_zenumlStarting) return _zenumlStarting;
		var generation = _mermaidGeneration, provider = _rapierProviders['mermaid-zenuml'];
		_zenumlStarting = Promise.resolve().then(async function () {
			if (provider.status !== 'ready') {
				const end = typeof _rapierPluginProgress === 'function' ? _rapierPluginProgress('mermaid-zenuml', 'diagram') : function () {};
				try { await provider.install(); } finally { end(); }
			}
			var files = await provider.bytes();
			if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
			await _executeDiagramBundle(runtime.document, files.zenuml, 'rapier-zenuml-4.5.0-3.js');
			if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
			if (typeof runtime.RapierZenUML?.render !== 'function') throw new Error('The verified diagram renderer is incomplete');
			return runtime.RapierZenUML;
		}).catch(function (error) { if (generation === _mermaidGeneration) _zenumlStarting = null; throw error; });
		return _zenumlStarting;
	}

	if (MERMAID_RESOURCES) {
		const core = MERMAID_RESOURCES.files.find(file => file.name === 'core');
		const zenuml = MERMAID_RESOURCES.files.find(file => file.name === 'zenuml');
		_rapierVerifiedFiles({key: 'mermaid-zenuml', noun: 'diagram', dash: ' -- ', version: zenuml.version,
			files: [zenuml]});
		_rapierVerifiedFiles({
			key: 'mermaid', noun: 'diagram', dash: ' -- ',
			version: core.version, files: [{...core, id: 'rapier-mermaid-core'}],
			prepare: _prepareMermaid, discard: _disposeMermaid,
			release: function () { if (_mermaidRendering || !_mermaidRealm) return false; _disposeMermaid(); return true; },
			presentationPaint: _zenumlPaint,
			exportFontCss: function () { return _mermaidRealm?.contentWindow.RapierZenUML?.fontCss || ''; },
			render: function (src, opts, ready) {
				var hit = _boundHit(src); if (hit) return Promise.reject(new Error(hit));
				var resourceHit = _diagramResourceHit(src); if (resourceHit) return Promise.reject(new Error(resourceHit));
				if (!ready || !_mermaidStarting) return Promise.reject(new Error('diagram plug-in is unavailable'));
				var id = 'rapier-anchor-diagram-' + (++_renderSeq), generation = _mermaidGeneration;
				_mermaidRendering++;
				return _mermaidStarting.then(async function (runtime) {
					await document.fonts.load(MERMAID_FONT_SIZE + 'px ' + MERMAID_FONT_FAMILY);
					await document.fonts.ready;
					if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
					document.fonts.forEach(function (face) { if (face.status === 'loaded' && !runtime.document.fonts.has(face)) runtime.document.fonts.add(face); });
					var source = String(src == null ? '' : src), zen = zenumlSource(source), out;
					if (zen !== null) {
						out = await (await _prepareZenUML(runtime)).render(zen);
						runtime.document.fonts.forEach(function (face) {
							if (face.status === 'loaded' && !document.fonts.has(face)) { document.fonts.add(face); _mermaidFontFaces.push(face); }
						});
					} else out = {svg: _renderPele(runtime, source, id)};
					if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
					return out.svg;
				}).finally(function () { _mermaidRendering--; });
			},
		});
	}

	function _rapierVerifiedFiles(m) {
		/* RAPIER_BUILTIN_FILES_REUSE */
		if (!Object.prototype.hasOwnProperty.call(_rapierProviders, m.key)) throw new Error('This page has no place for the plug-in ' + m.key);
		var KEY = m.version;
		var FORMAT = m.format || 1, READS = m.reads || [FORMAT];
		var total = m.files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
		var Cache = m.store || RapierBundleIO.store(m.key);
		var pack = m.pack || function (bytes) { return bytes; };
		var unpack = m.unpack || function (value) { return value; };
		var prepare = m.prepare || m.usable && function (files) {
			var name = m.files[0].name;
			return Promise.resolve(m.usable() || _runScript(files[name], name)).then(function () { if (!m.usable()) throw new Error(m.missing); });
		};
		var pending = null, checking = null, removing = null, released = false, reviving = null;
		var holding = null, noted = false;
		if (m.release) window.addEventListener('rapier:memory-trimmed', function () {
			if (Plugin.status === 'ready' && !pending && !checking && !reviving && m.release()) released = true;
		});
		function render(src, opts) {
			noteUse();
			var ready = Plugin.status === 'ready';
			if (released && ready) {
				released = false;
				reviving = bytes().then(prepare).catch(function (err) { released = true; throw err; });
				reviving.then(function () { reviving = null; }, function () { reviving = null; });
			}
			return (reviving || Promise.resolve()).then(function () { return m.render(src, opts, ready); });
		}
		function id(file) { return file.id || 'rapier-' + m.key + (m.files.length > 1 ? '-' + file.name : ''); }
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
			update: null,
			updateError: null,
			downloadBytes: total,
			files: m.files,
			get deletable() { return !viaHost || typeof viaHost.remove === 'function'; },
			get installed() { return this.status === 'ready'; },
			install:   function () { return install(false); },
			request: function () {
				if (!RapierBundledPlugins.has(id(m.files[0])) || Plugin.status === 'error') return false;
				if (Plugin.status !== 'ready') install(false).catch(function () {});
				return true;
			},
			reinstall: function () { return install(true); },
			check:     check,
			bytes:     function () { noteUse(); return bytes(); },
			forget:    forget,
			isNeeded: function () { return Plugin.status !== 'ready'; },
			renderToString: !m.render ? undefined : m.release ? render : function (src, opts) { noteUse(); return m.render(src, opts, Plugin.status === 'ready'); },
			renderWithMathML: m.renderWithMathML ? function (src, opts) { return m.renderWithMathML(src, opts, Plugin.status === 'ready'); } : undefined,
			presentationPaint: m.presentationPaint,
			exportFontCss: m.exportFontCss,
		});
		_portableReaders[m.key] = function () {
			return bytes().then(function (values) {
				return m.files.map(function (file) {
					return {id: id(file), name: file.name, version: m.version, bytes: file.bytes, sri: file.sri, value: values[file.name]};
				});
			});
		};
		function set(s, err) {
			Plugin.status = s; Plugin.error = err || null;
			try { window.dispatchEvent(new CustomEvent('rapier:' + m.key + 'plugin', {detail: {status: s, installed: s === 'ready', error: Plugin.error, progress: Plugin.progress, update: Plugin.update}})); } catch (_) {}
		}
		function complete(record) {
			return !!record && record.version === KEY && !!record.files && m.files.every(function (file) {
				return !!RapierBundleIO.bytes(record.files[file.name]);
			});
		}
		function verified(file, value) {
			return RapierBundleIO.verifySha384(value, file.sri, { byteLength: file.bytes, sizeMessage: 'unexpected size of ' + file.name, source: file.name });
		}
		function prepared() {
			set('installing');
			return bytes().then(function (files) { return prepare && prepare(files); }).then(function () { set('ready'); return Plugin; });
		}
		function check() {
			if (pending || removing) return (removing || pending).then(function () { return Plugin.status; }, function () { return Plugin.status; });
			if (checking) return checking;
			checking = keeper().then(function (host) {
				if (host) return Promise.all(m.files.map(function (file) { return Promise.resolve(host.status(id(file))).catch(function () { return null; }); }))
					.then(function (states) { return states.every(function (s) { return s && s.status === 'ready'; }); });
				return Cache.get(KEY).then(function (record) {
					if (complete(record)) { holding = {key: KEY, old: false}; Plugin.update = null; return true; }
					return adopt();
				}, function () { return adopt(); });
			}).then(function (available) {
				if (available) return prepared();
				if (m.discard) m.discard();
				set('absent');
			}).then(function () { return Plugin.status; }, function (err) {
				if (Plugin.status !== 'absent') set('error', _friendly(m, err));
				return Plugin.status;
			});
			checking.then(function () { checking = null; });
			return checking;
		}
		function adopt() {
			holding = null; Plugin.update = null;
			if (typeof Cache.keys !== 'function') return Promise.resolve(false);
			return Cache.keys().then(function (keys) {
				return Promise.all(keys.filter(function (key) { return key !== KEY; }).map(function (key) {
					return Cache.get(key).then(function (record) { return record && {key: key, record: record}; }, function () { return null; });
				}));
			}).then(function (rows) {
				var best = null;
				rows.forEach(function (row) { if (row && row.record.pins && row.record.files && (!best || row.record.savedAt > best.record.savedAt)) best = row; });
				if (!best) return false;
				var oldNames = Object.keys(best.record.pins), names = {}, shared = m.files.filter(function (file) { return best.record.pins[file.name]; });
				if (shared.length) shared.forEach(function (file) { names[file.name] = file.name; });
				else if (oldNames.length === m.files.length) m.files.forEach(function (file, at) { names[file.name] = oldNames[at]; });
				else return false;
				for (var name in names) if (!best.record.files[names[name]]) return false;
				var changed = m.files.filter(function (file) { var pin = best.record.pins[names[file.name]]; return !names[file.name] || !pin || pin[0] !== file.sri || pin[1] !== file.bytes; });
				var readable = READS.indexOf(best.record.format || 1) >= 0;
				if (!changed.length && readable) {
					var record = Object.assign({}, best.record, {version: KEY, files: {}, pins: {}});
					m.files.forEach(function (file) { record.files[file.name] = best.record.files[names[file.name]]; record.pins[file.name] = [file.sri, file.bytes]; });
					return Cache.put(KEY, record).then(function () { return Cache.remove(best.key); }).then(function () { holding = {key: KEY, old: false}; return true; }, function () { return false; });
				}
				holding = {key: best.key, old: true, names: names, required: !readable};
				Plugin.update = {from: best.key, files: changed.length, bytes: changed.reduce(function (sum, file) { return sum + file.bytes; }, 0), required: !readable};
				return readable;
			}, function () { return false; });
		}
		function noteUse() {
			if (!Plugin.update || noted || m.quiet) return;
			noted = true;
			try { window.dispatchEvent(new CustomEvent('rapier:plugin-update', {detail: {key: m.key, noun: m.noun, plural: !!m.plural, version: KEY, bytes: Plugin.update.bytes}})); } catch (_) {}
		}
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
			var via = null;
			pending = (checking || Promise.resolve()).then(function () {
				if (force && m.discard) m.discard();
				return keeper();
			}).then(function (host) { via = host; return host ? hostInstall(host) : fetchInstall(force); }).catch(function (err) {
				try { console.error('[rapier] ' + m.noun + ' plug-in install failed:', err); } catch (_) {}
				if (holding && holding.old && !via) {
					Plugin.updateError = _friendly(m, err, via); Plugin.progress = 0;
					if (holding.required) { set('absent'); throw err; }
					return prepared().then(function () { throw err; }, function () { throw err; });
				}
				set('error', _friendly(m, err, via));
				throw err;
			});
			pending.then(function () { pending = null; }, function () { pending = null; });
			return pending;
		}
		function fetchInstall(force) {
			var held = Object.create(null), got = Object.create(null), reused = Object.create(null), next = 0, failure = null, span = total;
			function tick(file, n) {
				got[file.name] = n;
				var sum = 0; for (var name in got) sum += got[name];
				var percent = Math.floor(sum / span * 100);
				if (percent !== Plugin.progress) { Plugin.progress = percent; set('downloading'); }
			}
			function lane() {
				if (next >= m.files.length || failure) return Promise.resolve();
				var file = m.files[next++];
				if (reused[file.name]) { held[file.name] = reused[file.name]; return lane(); }
				var localUrl = file.file && RapierBundleIO.sameOriginUrl(file.file), urls;
				try {
					var hosted = RapierBundleIO.pluginUrl(file.flat || String(file.file || '').split('/').pop());
					urls = hosted ? [hosted] : localUrl ? [localUrl, file.url] : [file.url];
				} catch (error) { failure = failure || error; return Promise.resolve(); }
				function attempt(index) {
					return RapierBundleIO.fetchBytes(urls[index], m.timeoutMs || 180000, { length: file.bytes, cache: 'no-store', onBytes: !m.usable && function (n) { tick(file, n); } })
						.then(function (value) { return verified(file, value); }).catch(function (error) {
							if (index + 1 < urls.length) return attempt(index + 1);
							throw error;
						});
				}
				return attempt(0)
					.then(function (value) { held[file.name] = value; if (!m.usable) tick(file, file.bytes); }, function (err) { failure = failure || err; })
					.then(lane);
			}
			return (force ? Promise.resolve(null) : Cache.get(KEY).catch(function () { return null; })).then(function (record) {
				return complete(record) ? prepared().then(null, function () { return fetchInstall(true); }) : download();
			});
			function download() {
				return Cache.remove(KEY).catch(function () {}).then(function () {
					return (!force && holding && holding.old ? Cache.get(holding.key).catch(function () { return null; }) : Promise.resolve(null)).then(function (old) {
						if (!old || !old.files || !old.pins) return;
						return m.files.reduce(function (chain, file) {
							var from = holding.names[file.name], pin = old.pins[from];
							if (!pin || pin[0] !== file.sri || pin[1] !== file.bytes) return chain;
							return chain.then(function () { return unpack(old.files[from]); }).then(function (value) { return verified(file, value); })
								.then(function (value) { reused[file.name] = value; span -= file.bytes; }, function () {});
						}, Promise.resolve());
					});
				}).then(function () {
					Plugin.progress = 0; set('downloading');
					return Promise.all([lane(), lane(), lane()]);
				}).then(function () {
					if (failure) throw failure;
					set('installing');
					var record = { version: KEY, format: FORMAT, savedAt: Date.now(), files: {}, pins: {} };
					return m.files.reduce(function (chain, file) {
						record.pins[file.name] = [file.sri, file.bytes];
						return chain.then(function () { return pack(held[file.name]); }).then(function (value) { record.files[file.name] = value; });
					}, Promise.resolve()).then(function () { return Cache.put(KEY, record); }).then(function () {
						return typeof Cache.keys === 'function' ? Cache.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key !== KEY; }).map(function (key) { return Cache.remove(key); })); }) : null;
					}).then(function () { holding = {key: KEY, old: false}; Plugin.update = null; Plugin.updateError = null; });
				}).then(prepared);
			}
		}
		function bytes() {
			return keeper().then(function (host) { return host ? hostBytes(host) : heldBytes(); });
		}
		function hostBytes(host) {
			var out = {};
			return m.files.reduce(function (chain, file) {
				return chain.then(function () { return host.read(id(file)); }).then(function (value) {
					if (!value) throw new Error('The ' + m.noun + ' is not installed');
					return RapierBundleIO.resourceBytes(value, file.name);
				}).then(function (value) { return verified(file, value); }).then(function (value) { out[file.name] = value; });
			}, Promise.resolve()).then(function () { return out; }, function (err) {
				Plugin.progress = 0; set('error', _friendly(m, err, host)); throw err;
			});
		}
		function heldBytes() {
			if (holding && holding.required) return Promise.reject(new Error('The ' + m.noun + ' needs an update to work with this Rapier'));
			var key = holding ? holding.key : KEY, old = !!(holding && holding.old);
			return Cache.get(key).then(function (record) {
				if (old ? !record || !record.files || !record.pins : !complete(record)) throw new Error('The ' + m.noun + ' is not installed');
				var out = {};
				return m.files.reduce(function (chain, file) {
					if (old && !holding.names[file.name]) return chain;
					var from = old ? holding.names[file.name] : file.name, pin = old ? record.pins[from] : null;
					var against = old ? {name: file.name, sri: pin && pin[0], bytes: pin && pin[1]} : file;
					return chain.then(function () { return unpack(record.files[from]); })
						.then(function (value) { return verified(against, value); })
						.then(function (value) { out[file.name] = value; });
				}, Promise.resolve()).then(function () { return out; }, function (err) {
					return Cache.remove(key).catch(function () {}).then(function () { holding = null; Plugin.update = null; Plugin.progress = 0; set('absent', _friendly(m, err)); throw err; });
				});
			});
		}
		function forgetAll() {
			if (typeof Cache.keys !== 'function') return Cache.remove(KEY);
			return Cache.keys().then(function (keys) { return Promise.all(keys.concat(keys.indexOf(KEY) < 0 ? [KEY] : []).map(function (key) { return Cache.remove(key); })); });
		}
		function forget() {
			if (removing) return removing;
			removing = (pending || checking || Promise.resolve()).catch(function () {}).then(keeper).then(function (host) {
				if (host && typeof host.remove !== 'function') return false;
				return (host ? host.remove(id(m.files[0])) : forgetAll()).then(function () { if (m.discard) m.discard(); holding = null; Plugin.update = null; Plugin.updateError = null; Plugin.progress = 0; set('absent'); return true; });
			});
			removing.then(function () { removing = null; }, function () { removing = null; });
			return removing;
		}
		_onHostChange(m.key, function (detail) {
			if (!_host()) return;
			if (detail.status === 'downloading') {
				if (Plugin.status === 'ready' || Plugin.status === 'installing') return;
				Plugin.progress = Math.max(0, Math.min(100, Math.floor(Number(detail.progress) || 0))); set('downloading');
			} else if (pending || removing) return;
			else if (detail.status === 'error') { if (Plugin.status === 'downloading') { Plugin.progress = 0; set('error', detail.error || _friendly(m, detail.error, true)); } }
			else { Plugin.progress = 0; check(); }
		});
		check();
		return Plugin;
	}
	async function portable(requiredKeys) {
		var required = new Set(requiredKeys || []), groups = new Map();
		for (const entry of globalThis.RapierDrawLetters?.LETTER_SETS || []) {
			if (_portableReaders['letters-' + entry.id] || !Object.prototype.hasOwnProperty.call(_rapierProviders, 'letters-' + entry.id)) continue;
			_rapierVerifiedFiles({key: 'letters-' + entry.id, noun: entry.name + ' letter set', dash: ' — ',
				version: entry.id + ' ' + entry.sha384,
				files: [{name: entry.id, bytes: entry.bytes, sri: entry.sha384}]});
		}
		const keys = new Set([...Object.keys(_portableReaders).filter(key => /^(?:math|mermaid(?:-zenuml)?|letters-[a-z]+)$/.test(key)), ...required]);
		for (const key of [...keys].sort()) {
			let files;
			try { files = await _portableReaders[key]?.(); }
			catch (error) { if (required.has(key)) throw unavailable(key, error); }
			if (!files?.length) { if (required.has(key)) throw unavailable(key); continue; }
			const id = key.startsWith('letters-') ? 'letters' : key;
			if (!groups.has(id)) groups.set(id, {id, kind: id === 'math' ? 'script' : 'files', files: []});
			groups.get(id).files.push(...files);
		}
		return [...groups.values()];
		function unavailable(key, cause) {
			return Object.assign(new Error('Offline editor not written; install the ' + key + ' plug-in before exporting this document.', {cause}),
				{code: 'offline_plugin_unavailable', plugin: key});
		}
	}
	window.RapierPluginLoader = Object.freeze({files: _rapierVerifiedFiles, portable, zenumlSource});
})();
