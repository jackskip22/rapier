// RAPIER_LEXER_MODULE */` slot; globalThis.RapierLexer is the only global it sets.
globalThis.RapierLexer = (() => {

const BACKOFF_MS = Object.freeze([5000, 30000, 120000, 300000]);
const CACHE_ENTRIES = 512;
const CACHE_UNITS = 8 * 1024 * 1024;

function softwareAdapter(adapter) {
	const info = adapter.info || {};
	return info.isFallbackAdapter === true || adapter.isFallbackAdapter === true ||
		/swiftshader|llvmpipe|softpipe|basic render/i.test([info.vendor, info.architecture, info.device, info.description].join(' '));
}

function create(now = () => Date.now()) {
	const state = Object.seal({ spans: null, failed: false, stale: false, executed: null, refusedAt: 0, refusals: 0, episode: 0, asks: 0, answers: 0,
		adapter: '', admission: null, cache: new Map(), cacheUnits: 0, hits: 0, warmed: false });

	function store(spans) {
		if (!Array.isArray(spans) || !spans.length || !spans.every(span => span && typeof span.name === 'string' && typeof span.source === 'string')) throw new Error('gpu-lexer');
		if (!state.spans) state.spans = Object.freeze(spans.map(({ name, source }) => Object.freeze({ name, source })));
	}
	const stored = () => !!state.spans;
	const failed = () => state.failed;
	const refusal = () => ({ at: state.refusedAt, count: state.refusals });
	const counts = () => ({ asks: state.asks, answers: state.answers, hits: state.hits });
	const adapter = () => state.adapter;

	function available(navigatorLike) {
		if (state.failed || state.adapter === 'software' || !navigatorLike || !navigatorLike.gpu) return false;
		if (!state.refusedAt) return true;
		return now() >= state.refusedAt + BACKOFF_MS[Math.min(state.refusals, BACKOFF_MS.length) - 1];
	}

	function ensure(globalLike, execute) {
		const current = globalLike.RapierGpuLexer;
		const answering = !!current && typeof current.highlight === 'function';
		if (answering && (!state.stale || current !== state.executed)) { state.stale = false; return true; }
		if (state.failed || !state.spans) return false;
		try {
			for (const { name, source } of state.spans) execute(name, '(function () {\n' + source + '\n})();');
			const next = globalLike.RapierGpuLexer;
			if (!next || typeof next.highlight !== 'function') throw new Error('gpu-lexer');
			state.executed = next; state.stale = false;
			return true;
		} catch (error) {
			state.failed = true;
			throw error;
		}
	}

	function admission(navigatorLike) {
		return state.admission ||= (async () => {
			const gpu = navigatorLike && navigatorLike.gpu;
			let found = null;
			try { found = gpu && typeof gpu.requestAdapter === 'function' ? await gpu.requestAdapter() : null; } catch (_) {}
			if (found) state.adapter = softwareAdapter(found) ? 'software' : 'hardware';
			return state.adapter !== 'software';
		})();
	}

	function cached(source) {
		const spans = state.cache.get(source);
		if (!spans) return null;
		state.cache.delete(source); state.cache.set(source, spans);
		return spans;
	}
	function keep(source, spans) {
		if (!Array.isArray(spans) || source.length > CACHE_UNITS / 4 || state.cache.has(source)) return;
		state.cache.set(source, spans); state.cacheUnits += source.length;
		for (const [text] of state.cache) {
			if (state.cache.size <= CACHE_ENTRIES && state.cacheUnits <= CACHE_UNITS) break;
			state.cache.delete(text); state.cacheUnits -= text.length;
		}
	}

	async function ask(globalLike, source, refused = null) {
		const kept = cached(source);
		if (kept) { state.hits++; return { spans: kept, recovered: false }; }
		const lexer = globalLike.RapierGpuLexer;
		if (!state.adapter && lexer === state.executed && !await admission(globalLike.navigator)) {
			throw Object.assign(new Error('software WebGPU adapter'), { software: true });
		}
		if (state.adapter === 'software' && lexer === state.executed) throw Object.assign(new Error('software WebGPU adapter'), { software: true });
		const episode = state.episode;
		state.asks++;
		try {
			const spans = await lexer.highlight(source);
			state.answers++;
			keep(source, spans);
			if (episode !== state.episode) return { spans, recovered: false };
			const recovered = state.refusals > 0;
			state.refusedAt = 0; state.refusals = 0;
			return { spans, recovered };
		} catch (error) {
			if (episode === state.episode) {
				state.episode++;
				state.refusedAt = now(); state.refusals++; state.stale = true;
				if (typeof refused === 'function') { try { refused(error); } catch (_) {} }
			}
			throw error;
		}
	}

	function warm(globalLike, ready, refused = null) {
		if (state.warmed || !ready()) return;
		state.warmed = true;
		ask(globalLike, 'x', refused).catch(() => {});
	}

	function retry() { state.refusedAt = 0; }

	return Object.freeze({ store, stored, failed, refusal, counts, adapter, available, retry, ensure, ask, cached, warm });
}

function codeHoldsSelection(code, documentLike) {
	const selection = documentLike && documentLike.getSelection ? documentLike.getSelection() : null;
	if (!selection || !selection.rangeCount) return false;
	if (code.contains(selection.anchorNode) || code.contains(selection.focusNode)) return true;
	for (let i = 0; i < selection.rangeCount; i++) if (selection.getRangeAt(i).intersectsNode(code)) return true;
	return false;
}


return Object.freeze({ ...create(), create, BACKOFF_MS, codeHoldsSelection });
})();
