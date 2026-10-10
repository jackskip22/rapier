// The GPU lexer's readiness and its asks: the lexer is the highlighter. The CPU reading
// (editor/code-tokens.mjs) paints every block first, on every browser, and stays where WebGPU is
// not; the lexer (shell/vendor/gpu-lexer-0.0.1.js, the `lib-gpu-lexer` slot) repaints wherever a
// device answers: rendered fences, the source view's slabs, and code prepared for export.
// Nothing here retires the lexer for a page:
//   - a device refusal ("WebGPU unavailable", a lost device, a shader that would not build) is
// remembered with a backoff -- 5 s, 30 s, 2 min, then 5 min -- and asked again after it on a fresh
// instance, because the vendor keeps its first device promise, rejected or not, so a retry re-runs
// its source;
//   - spans that came back unusable for one block (out of order, not covering the source) are that
// block's matter -- its caller keeps the CPU colouring -- and never the page's;
//   - only a vendor source that cannot run, or runs without `highlight`, is terminal: a shipping
// defect, which the boot check refuses.
// Every input is a parameter (the stored vendor spans, the executor, the global, the clock), so
// this file loads unmodified in Node for its own cells and in the engine at the `/*
// RAPIER_LEXER_MODULE */` slot; globalThis.RapierLexer is the only global it sets.
globalThis.RapierLexer = (() => {

const BACKOFF_MS = Object.freeze([5000, 30000, 120000, 300000]);

// One policy per page; create() gives a Node cell its own. `now` is the clock, in milliseconds.
function create(now = () => Date.now()) {
	const state = Object.seal({ spans: null, failed: false, stale: false, executed: null, refusedAt: 0, refusals: 0, episode: 0, asks: 0, answers: 0 });

	// The stored vendor: the `lib-gpu-lexer` spans (a name and a source each), inflated once by the
	// loader and kept for the life of the editor, so a retry can run them again.
	function store(spans) {
		if (!Array.isArray(spans) || !spans.length || !spans.every(span => span && typeof span.name === 'string' && typeof span.source === 'string')) throw new Error('gpu-lexer');
		if (!state.spans) state.spans = Object.freeze(spans.map(({ name, source }) => Object.freeze({ name, source })));
	}
	const stored = () => !!state.spans;
	const failed = () => state.failed;
	const refusal = () => ({ at: state.refusedAt, count: state.refusals });
	const counts = () => ({ asks: state.asks, answers: state.answers });

	// May the lexer be asked now: a WebGPU on this navigator, the vendor not terminal, and no
	// refusal whose backoff is still running.
	function available(navigatorLike) {
		if (state.failed || !navigatorLike || !navigatorLike.gpu) return false;
		if (!state.refusedAt) return true;
		return now() >= state.refusedAt + BACKOFF_MS[Math.min(state.refusals, BACKOFF_MS.length) - 1];
	}

	// The lexer executed and answering. `globalLike.RapierGpuLexer` is what the vendor publishes; a
	// lexer somebody else published there (a host's, a harness's) is used as it is and never replaced.
	// `execute(name, source)` runs one span as a classic script; the span is wrapped in a function so
	// a second run, after a refusal, is a fresh instance with a fresh device promise. A vendor that
	// cannot run is terminal, and the one throw here is that.
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

	// The ask: the lexer's spans for `source`, with `recovered` true when this answer ends a refusal
	// streak (the caller then repaints what was coloured without the lexer meanwhile). A throw is the
	// device's refusal, and its owner is the episode, not the block: every block waiting on the
	// device when it says no is rejected, and those rejections are one refusal, remembered once with
	// one backoff, told once to `refused` (from the rejection that counted), the instance marked
	// stale so the ask after the backoff runs a fresh one. An answer or a rejection from an episode a
	// refusal already closed says nothing about the streak (one refusal must not advance the backoff
	// once per waiting block). What the spans say about the source is the caller's to check
	// (editor/code-tokens.mjs _rapierTokensHtml), and that verdict never comes here.
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

	// Forget a refusal's backoff: the next block asks again now. A page coming back into view may
	// use it (a device can be there after a tab switch); a harness uses it to prove the retry
	// without waiting the backoff out. The streak's count stays, so the next backoff is the longer one.
	function retry() { state.refusedAt = 0; }

	return Object.freeze({ store, stored, failed, refusal, counts, available, retry, ensure, ask });
}

// A repaint never moves a person: a code element holding the caret or the selection keeps the
// colouring it already has. Either endpoint inside the element, or any range crossing it (a
// selection that starts outside and ends inside, or spans the whole block): each is a person using
// this element (the anchor alone would miss the other three). The editor's guard delegates here.
function codeHoldsSelection(code, documentLike) {
	const selection = documentLike && documentLike.getSelection ? documentLike.getSelection() : null;
	if (!selection || !selection.rangeCount) return false;
	if (code.contains(selection.anchorNode) || code.contains(selection.focusNode)) return true;
	for (let i = 0; i < selection.rangeCount; i++) if (selection.getRangeAt(i).intersectsNode(code)) return true;
	return false;
}


return Object.freeze({ ...create(), create, BACKOFF_MS, codeHoldsSelection });
})();
