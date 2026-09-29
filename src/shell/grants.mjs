// SPDX-License-Identifier: AGPL-3.0-only
// Approvals as grants, never state (docs/briefs/bridge-and-grants.md section 3): one effect, one target, once, short-lived, at its generation;
// consumed atomically and named in the receipt. No flag another path could read. Pure: the caller injects `now`.

const RAPIER_GRANT_EFFECTS = Object.freeze(['clipboard.write', 'share', 'download', 'open.url', 'file.save',
	'file.open', 'native.close', 'agent.intervention']);
const RAPIER_GRANT_TTL_MS = 30000, RAPIER_GRANT_TTL_MAX_MS = 5 * 60000, RAPIER_GRANT_TARGET_LIMIT = 512;

export function createGrants({now = () => Date.now(), mintId = () => 'g' + Math.random().toString(36).slice(2, 12), keep = 256} = {}) {
	const grants = new Map();
	const trim = () => { while (grants.size > keep) { const oldest = grants.keys().next().value; grants.delete(oldest); } };
	const refuse = reason => Object.freeze({ok: false, refused: reason});
	function mint(effect, target, {generation = null, ttlMs = RAPIER_GRANT_TTL_MS, by = 'person'} = {}) {
		if (!RAPIER_GRANT_EFFECTS.includes(effect)) throw new TypeError('unknown effect: ' + String(effect));
		if (typeof target !== 'string' || !target || target.length > RAPIER_GRANT_TARGET_LIMIT) throw new TypeError('a grant names one target');
		if (!['person', 'host', 'agent'].includes(by)) throw new TypeError('a grant is minted by the person, a host or an agent');
		const ttl = Math.min(Math.max(1, Number(ttlMs) || RAPIER_GRANT_TTL_MS), RAPIER_GRANT_TTL_MAX_MS);
		const at = now();
		const grant = {id: mintId(), effect, target, generation: generation == null ? null : String(generation),
			mintedAt: at, expiresAt: at + ttl, singleUse: true, by, consumedAt: null};
		grants.set(grant.id, grant);
		trim();
		return Object.freeze({...grant});
	}
	function consume(id, effect, target, generation = null) {
		const grant = grants.get(id);
		if (!grant) return refuse('unknown');
		if (grant.consumedAt !== null) return refuse('used');
		if (now() > grant.expiresAt) return refuse('expired');
		if (grant.effect !== effect) return refuse('effect');
		if (grant.target !== target) return refuse('target');
		if (grant.generation !== null && String(generation) !== grant.generation) return refuse('generation');
		grant.consumedAt = now();
		return Object.freeze({ok: true, id, effect, target, consumedAt: grant.consumedAt});
	}
	function receipt(id) {
		const grant = grants.get(id);
		return grant ? Object.freeze({...grant}) : null;
	}
	// The person's own tap on the effect's control: minted and consumed in one call.
	function direct(effect, target, options) {
		const grant = mint(effect, target, options);
		return consume(grant.id, effect, target, options?.generation ?? null);
	}
	return Object.freeze({mint, consume, receipt, direct, effects: RAPIER_GRANT_EFFECTS});
}
