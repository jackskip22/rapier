// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Enter disposition, not an IME/keyboard detector. The shell passes a plain event
 * snapshot and an opaque editing-surface identity in `scope`; `block` is Rapier's
 * composition flag. No DOM, clock, text replay or second composition-state owner.
 *
 * `cancel` must be honoured before applying `apply` through the existing Enter
 * owner. Only cancelled, explicit break inputs enter `pending`. An ambiguous key
 * stays with the IME; a later beforeinput can independently establish a break.
 * Non-cancellable breaks are unarmed `defer`: the existing projection reconciler,
 * not a second insertion at compositionend, must own their native DOM change.
 */
function _rapierEnterIntent(previous, event) {
	const { type, scope } = event;
	const state = previous && previous.scope === scope ? previous :
		{ scope, pending: [], afterComposition: false };
	const idle = { state, intent: null, cancel: false, apply: [] };
	if (event.defaultPrevented) return idle;
	if (type === 'compositionstart') {
		return { ...idle, state: { scope, pending: [], afterComposition: false } };
	}
	if (type === 'compositionend') {
		return {
			state: { scope, pending: [], afterComposition: true },
			intent: state.pending[0] || 'ime-commit', cancel: false, apply: state.pending,
		};
	}
	if (type === 'keydown') {
		if (event.key !== 'Enter') return idle;
		// 229 means IME processing, not Enter. End-before-keydown can also make
		// isComposing false on a candidate confirmation: wait for break evidence.
		if (event.block || event.isComposing || event.keyCode === 229 || state.afterComposition) {
			return { ...idle, intent: 'ime-commit' };
		}
		if (!event.cancelable || state.pending.length) return { ...idle, intent: 'defer' };
		const intent = event.shiftKey ? 'soft-break' : 'split';
		return { ...idle, intent, cancel: true, apply: [intent] };
	}
	if (type !== 'beforeinput') return idle;
	if (event.inputType === 'insertCompositionText') {
		// data replaces the entire composition, even when it contains a newline.
		// Cancelling it, stripping it or replaying it can lose/duplicate the word.
		return { ...idle, intent: 'ime-commit' };
	}
	const intent = event.inputType === 'insertLineBreak' ? 'soft-break' :
		event.inputType === 'insertParagraph' || (event.inputType === 'insertText' &&
			(event.data === '\n' || event.data === '\r' || event.data === '\r\n')) ? 'split' : null;
	if (!intent) return idle;
	if (!event.cancelable) return { ...idle, intent: 'defer' };
	// afterComposition prevents a stale event.isComposing from awaiting an end
	// which has already arrived. Rapier's live block flag still takes precedence.
	if (event.block || (event.isComposing && !state.afterComposition) || state.pending.length) {
		return { ...idle, intent: 'defer', cancel: true,
			state: { ...state, pending: [...state.pending, intent] } };
	}
	return { ...idle, intent, cancel: true, apply: [intent] };
}

export { _rapierEnterIntent };
