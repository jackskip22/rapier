// RAPIER_LEXER_MODULE */` slot; globalThis.RapierLexer is the only global it sets.
globalThis.RapierLexer = (() => {

const BACKOFF_MS = Object.freeze([5000, 30000, 120000, 300000]);

function create(now = () => Date.now()) {
	const state = Object.seal({ spans: null, failed: false, stale: false, executed: null, refusedAt: 0, refusals: 0, episode: 0, asks: 0, answers: 0 });

	function store(spans) {
		if (!Array.isArray(spans) || !spans.length || !spans.every(span => span && typeof span.name === 'string' && typeof span.source === 'string')) throw new Error('gpu-lexer');
		if (!state.spans) state.spans = Object.freeze(spans.map(({ name, source }) => Object.freeze({ name, source })));
	}
	const stored = () => !!state.spans;
	const failed = () => state.failed;
	const refusal = () => ({ at: state.refusedAt, count: state.refusals });
	const counts = () => ({ asks: state.asks, answers: state.answers });

	function available(navigatorLike) {
		if (state.failed || !navigatorLike || !navigatorLike.gpu) return false;
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

	async function ask(globalLike, source, refused = null) {
		const episode = state.episode;
		state.asks++;
		try {
			const spans = await globalLike.RapierGpuLexer.highlight(source);
			state.answers++;
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

	function retry() { state.refusedAt = 0; }

	return Object.freeze({ store, stored, failed, refusal, counts, available, retry, ensure, ask });
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
