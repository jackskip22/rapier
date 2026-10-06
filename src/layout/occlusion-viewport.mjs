import {placeTransient, validRect as rect, copyRect as cloneRect} from './occlusion.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const pixel = (value = 0) => { if (!finite(value) || value < 0) throw new TypeError('invalid inset'); return value; };

export function viewportSample(input) {
	if (!input || !rect(input.layout) || !rect(input.visual ?? input.layout) || !finite(input.visibleBottom)) throw new TypeError('invalid viewport sample');
	const safeArea = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key => [key, pixel(input.safeArea?.[key])]));
	return {layout: cloneRect(input.layout), visual: cloneRect(input.visual ?? input.layout), visibleBottom: input.visibleBottom,
		nativeBottomInset: pixel(input.nativeBottomInset), safeArea};
}

export function advanceViewport(previous, input, invalidate = false) {
	const sample = viewportSample(input);
	if (previous !== null && previous !== undefined && (!Number.isSafeInteger(previous.epoch) || previous.epoch < 0 || !previous.sample)) throw new TypeError('invalid viewport state');
	const changed = !previous || invalidate || JSON.stringify(previous.sample) !== JSON.stringify(sample);
	const epoch = previous ? previous.epoch + Number(changed) : 0;
	if (!Number.isSafeInteger(epoch)) throw new RangeError('viewport epoch exhausted');
	return {epoch, sample};
}

export function usableViewport(input) {
	const sample = viewportSample(input), {layout, visual, safeArea} = sample;
	// Native and CSS safe-area values describe the same edge, not two stacked bars.
	const cssBaseBottom = layout.bottom - Math.max(sample.nativeBottomInset, safeArea.bottom);
	const viewport = {
		left: Math.max(layout.left + safeArea.left, visual.left),
		top: Math.max(layout.top + safeArea.top, visual.top),
		right: Math.min(layout.right - safeArea.right, visual.right),
		bottom: Math.min(cssBaseBottom, visual.bottom, sample.visibleBottom),
	};
	return {viewport, cssBaseBottom, layoutBottom: layout.bottom};
}

export function placeViewportTransient(input) {
	try {
		if (!input || !Number.isSafeInteger(input.epoch) || input.epoch < 0 || !Number.isSafeInteger(input.measuredEpoch) || input.measuredEpoch < 0) throw new TypeError('viewport and measurement epochs required');
		if (input.epoch !== input.measuredEpoch || input.settled === false) return {status: 'wait', reason: 'stale-viewport', blocking: []};
		const {viewport, cssBaseBottom, layoutBottom} = usableViewport(input.sample);
		if (viewport.right <= viewport.left || viewport.bottom <= viewport.top) return {status: 'wait', reason: 'no-viewport-room', blocking: []};
		const result = placeTransient({viewport, surfaces: input.surfaces, transient: input.transient});
		if (result.status !== 'placed') return result;
		return {...result, epoch: input.epoch, viewport, lift: layoutBottom - result.rect.bottom,
			cssLift: cssBaseBottom - result.rect.bottom};
	} catch (error) { return {status: 'wait', reason: 'invalid-input', detail: String(error.message), blocking: []}; }
}
