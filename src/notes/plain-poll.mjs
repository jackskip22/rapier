// SPDX-License-Identifier: AGPL-3.0-only
export function plainPoll(refresh) {
	let held = 0, pending = null;
	const run = () => pending ?? (pending = Promise.resolve().then(refresh).finally(() => { pending = null; }));
	return Object.freeze({
		async begin() { await run(); held++; },
		end() { if (held) held--; },
		async read() { if (!held) await run(); },
	});
}
