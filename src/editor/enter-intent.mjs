// SPDX-License-Identifier: AGPL-3.0-only

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
		if (event.block || event.isComposing || event.keyCode === 229 || state.afterComposition) {
			return { ...idle, intent: 'ime-commit' };
		}
		if (!event.cancelable || state.pending.length) return { ...idle, intent: 'defer' };
		const intent = event.shiftKey ? 'soft-break' : 'split';
		return { ...idle, intent, cancel: true, apply: [intent] };
	}
	if (type !== 'beforeinput') return idle;
	if (event.inputType === 'insertCompositionText') {
		return { ...idle, intent: 'ime-commit' };
	}
	const intent = event.inputType === 'insertLineBreak' ? 'soft-break' :
		event.inputType === 'insertParagraph' || (event.inputType === 'insertText' &&
			(event.data === '\n' || event.data === '\r' || event.data === '\r\n')) ? 'split' : null;
	if (!intent) return idle;
	if (!event.cancelable) return { ...idle, intent: 'defer' };
	if (event.block || (event.isComposing && !state.afterComposition) || state.pending.length) {
		return { ...idle, intent: 'defer', cancel: true,
			state: { ...state, pending: [...state.pending, intent] } };
	}
	return { ...idle, intent, cancel: true, apply: [intent] };
}

export { _rapierEnterIntent };
