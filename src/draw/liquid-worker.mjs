// SPDX-License-Identifier: AGPL-3.0-only
// The Liquid light still, rendered off the page's thread: the reference steps, then the pixels.
import { liquidStillSteps } from './liquid.mjs';

export function installLiquidWorker(scope = globalThis) {
	if (typeof scope.document !== 'undefined') throw new Error('Liquid light stills need a dedicated worker');
	scope.onmessage = ({ data }) => {
		const { id, effect, rgba, width, height } = data;
		try {
			const job = liquidStillSteps(effect, rgba, width, height);
			let next = job.next(), told = 0;
			while (!next.done) {
				if (next.value - told >= .1) { scope.postMessage({ id, progress: next.value }); told = next.value; }
				next = job.next();
			}
			scope.postMessage({ id, pixels: next.value }, [next.value.buffer]);
		} catch (error) { scope.postMessage({ id, error: String(error?.message || error) }); }
	};
}
