// SPDX-License-Identifier: AGPL-3.0-only
(function () {
	'use strict';
	var _portableReaders = Object.create(null);
	function _policy() { return window.RapierPlatform?.environment.native === true ? 'this app’s policy' : 'this browser policy'; }

	function _host() {
		var r = window.RapierPlatform && window.RapierPlatform.resources;
		return r && typeof r.ensure === 'function' ? r : null;
	}
	function _onHostChange(fn) {
		if (typeof window.addEventListener !== 'function') return;
		window.addEventListener('rapier:platform-resources', function (event) { fn((event && event.detail) || {}); });
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

	var MATH_VERSION = '2.6.1';
	var MATH_FILE = 'rapier-math-' + MATH_VERSION + '.js';
	_rapierVerifiedFiles({
		key: 'math', noun: 'math', dash: ' — ',
		version: MATH_VERSION,
		files: [{name: MATH_FILE, file: MATH_FILE, version: MATH_VERSION,
			bytes: 733943,
			sri: 'c6Y4kudfuc16Hkmvfgr0MpdQcJs1jU4qbsKu2tUSduVuQdwLQ/38rR0GmQMatLsS',
			url: 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.10/math/rapier-math-2.6.1.js'}],
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
				if (context && context.family === 'timeline' && !context.inline && context.property === 'stroke' &&
					token === '--md-mermaid-on-series') token = '--md-mermaid-border';
				if (!token) return null;
				const value = 'var(' + token + ')';
				return alpha === 1 ? value : 'color-mix(in srgb, ' + value + ' ' + (alpha * 100) + '%, transparent)';
			}
		};
	}

	var _mermaidRealm = null, _mermaidStarting = null, _mermaidGeneration = 0, _mermaidRendering = 0;
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
				script.onerror = function () { finish(new Error('The verified diagram bundle was blocked by ' + _policy())); };
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
				return _executeDiagramBundle(owner, files.zenuml, 'rapier-zenuml-4.5.0-2.js');
			}).then(function () {
				if (!runtime.mermaid || typeof runtime.mermaid.render !== 'function' || !runtime.RapierZenUML ||
					typeof runtime.RapierZenUML.register !== 'function' || typeof runtime.RapierZenUML.allowSvgStyleAttribute !== 'function')
					throw new Error('The verified diagram renderer is incomplete');
				return runtime.RapierZenUML.register(runtime.mermaid);
			}).then(function () {
				if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
				return runtime;
			});
		}).catch(function (error) { if (generation === _mermaidGeneration) _disposeMermaid(); throw error; });
		return _mermaidStarting;
	}
	function _configureMermaid(runtime) {
		if (_mermaidPresentation) return;
		var presentation = _rapierMermaidPresentation();
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
				secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
					'suppressErrorRendering', 'htmlLabels', 'dompurifyConfig', 'legacyMathML',
					'forceLegacyMathML', 'themeCSS', 'fontFamily', 'fontSize'],
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

	if (MERMAID_RESOURCES) _rapierVerifiedFiles({
		key: 'mermaid', noun: 'diagram', dash: ' -- ',
		version: MERMAID_RESOURCES.version, files: MERMAID_RESOURCES.files,
		prepare: _prepareMermaid, discard: _disposeMermaid,
		release: function () { if (_mermaidRendering || !_mermaidRealm) return false; _disposeMermaid(); return true; },
		presentationPaint: function (hex, alpha, context) { return _mermaidPresentation ? _mermaidPresentation.paint(hex, alpha, context) : null; },
		exportFontCss: function () { return _mermaidRealm && _mermaidRealm.contentWindow.RapierZenUML ? _mermaidRealm.contentWindow.RapierZenUML.fontCss : ''; },
		render: function (src, opts, ready) {
			var hit = _boundHit(src); if (hit) return Promise.reject(new Error(hit));
			var resourceHit = _diagramResourceHit(src); if (resourceHit) return Promise.reject(new Error(resourceHit));
			if (!ready || !_mermaidStarting) return Promise.reject(new Error('diagram plug-in is unavailable'));
			var id = 'rapier-anchor-diagram-' + (++_renderSeq), generation = _mermaidGeneration;
			_mermaidRendering++;
			return _mermaidStarting.then(function (runtime) {
				return document.fonts.load(MERMAID_FONT_SIZE + 'px ' + MERMAID_FONT_FAMILY).then(function () { return document.fonts.ready; }).then(function () {
					if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
					document.fonts.forEach(function (face) { if (face.status === 'loaded' && !runtime.document.fonts.has(face)) runtime.document.fonts.add(face); });
					_configureMermaid(runtime);
					var container = runtime.document.createElement('div'); runtime.document.body.appendChild(container);
					return Promise.resolve().then(function () { return runtime.mermaid.render(id, String(src == null ? '' : src), container); })
						.then(function (out) {
							if (generation !== _mermaidGeneration) throw new Error('The diagram renderer was released');
							runtime.document.fonts.forEach(function (face) {
								if (face.status === 'loaded' && !document.fonts.has(face)) { document.fonts.add(face); _mermaidFontFaces.push(face); }
							});
							return out.svg;
						})
						.finally(function () { container.remove(); });
				});
			}).finally(function () { _mermaidRendering--; });
		},
	});
	function _rapierVerifiedFiles(m) {
		/* RAPIER_BUILTIN_FILES_REUSE */
		var KEY = m.version;
		var total = m.files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
		var Cache = m.store || RapierBundleIO.store(m.key);
		var pack = m.pack || function (bytes) { return bytes; };
		var unpack = m.unpack || function (value) { return value; };
		var prepare = m.prepare || m.usable && function (files) {
			var name = m.files[0].name;
			return Promise.resolve(m.usable() || _runScript(files[name], name)).then(function () { if (!m.usable()) throw new Error(m.missing); });
		};
		var pending = null, checking = null, removing = null, released = false, reviving = null;
		if (m.release) window.addEventListener('rapier:memory-trimmed', function () {
			if (Plugin.status === 'ready' && !pending && !checking && !reviving && m.release()) released = true;
		});
		function render(src, opts) {
			var ready = Plugin.status === 'ready';
			if (released && ready) {
				released = false;
				reviving = bytes().then(prepare).catch(function (err) { released = true; throw err; });
				reviving.then(function () { reviving = null; }, function () { reviving = null; });
			}
			return (reviving || Promise.resolve()).then(function () { return m.render(src, opts, ready); });
		}
		function id(file) { return 'rapier-' + m.key + (m.files.length > 1 ? '-' + file.name : ''); }
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
			install:   function () { return install(false); },
			request: function () {
				if (!RapierBundledPlugins.has(id(m.files[0])) || Plugin.status === 'error') return false;
				if (Plugin.status !== 'ready') install(false).catch(function () {});
				return true;
			},
			reinstall: function () { return install(true); },
			check:     check,
			bytes:     bytes,
			forget:    forget,
			isNeeded: function () { return Plugin.status !== 'ready'; },
			renderToString: !m.render ? undefined : m.release ? render : function (src, opts) { return m.render(src, opts, Plugin.status === 'ready'); },
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
			try { window.dispatchEvent(new CustomEvent('rapier:' + m.key + 'plugin', {detail: {status: s, installed: s === 'ready', error: Plugin.error, progress: Plugin.progress}})); } catch (_) {}
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
				return Cache.get(KEY).then(complete, function () { return false; });
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
				set('error', _friendly(m, err, via));
				throw err;
			});
			pending.then(function () { pending = null; }, function () { pending = null; });
			return pending;
		}
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
		function forget() {
			if (removing) return removing;
			removing = (pending || checking || Promise.resolve()).catch(function () {}).then(keeper).then(function (host) {
				if (host && typeof host.remove !== 'function') return false;
				return (host ? host.remove(id(m.files[0])) : Cache.remove(KEY)).then(function () { if (m.discard) m.discard(); Plugin.progress = 0; set('absent'); return true; });
			});
			removing.then(function () { removing = null; }, function () { removing = null; });
			return removing;
		}
		_onHostChange(function (detail) {
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
			if (_portableReaders['letters-' + entry.id]) continue;
			_rapierVerifiedFiles({key: 'letters-' + entry.id, noun: entry.name + ' letter set', dash: ' — ',
				version: entry.id + ' ' + entry.sha384,
				files: [{name: entry.id, bytes: entry.bytes, sri: entry.sha384}]});
		}
		const keys = new Set([...Object.keys(_portableReaders).filter(key => /^(?:math|mermaid|letters-[a-z]+)$/.test(key)), ...required]);
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
	window.RapierPluginLoader = Object.freeze({files: _rapierVerifiedFiles, portable});
})();
