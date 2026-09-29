const finite = value => typeof value === 'number' && Number.isFinite(value);
const epoch = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const copy = state => ({...state, action: state.action ? {...state.action} : null});

// Search owns which decisions are settled and which hits have exact-source proof. This owner
// supplies the notice's words and lifetime; a model event is not evidence of on-screen exposure.
export function searchNotice({id, stage, done, total, confirmed, unread = 0}) {
	if (!text(id) || !['searching', 'first-hit', 'complete', 'incomplete'].includes(stage) ||
		![done, total, confirmed, unread].every(epoch) || done > total || confirmed > done || unread > total - done ||
		stage === 'first-hit' && !confirmed || stage === 'complete' && (done !== total || unread) ||
		stage === 'incomplete' && (!unread || done + unread !== total)) throw new TypeError('invalid search notice facts');
	const progress = 'Searching ' + done + ' of ' + total + ' notes.';
	const message = stage === 'first-hit' ? 'First match found. ' + progress : stage === 'complete' ? 'Search complete: ' + confirmed + (confirmed === 1 ? ' match.' : ' matches.') :
		stage === 'incomplete' ? 'Searched ' + done + ' of ' + total + ' notes; ' + unread + ' could not be searched.' : progress;
	return {id, stage, message, action: null, durationMs: stage === 'complete' ? 4500 : null};
}

export function createTransient({id, action = null, durationMs = 4500}) {
	if (!text(id) || durationMs !== null && (!finite(durationMs) || durationMs <= 0)) throw new TypeError('invalid transient identity or duration');
	if (action && (!text(action.label) || !text(action.operationId))) throw new TypeError('an action needs its retained operation id');
	return {id, action: action ? {label: action.label, operationId: action.operationId} : null,
		remainingMs: action ? null : durationMs, visibility: 'waiting', phase: 'pending',
		lastTimeMs: null, measuredEpoch: null, paused: false, ticket: 0, error: null};
}

export function stepTransient(previous, event) {
	const state = copy(previous);
	const result = (effect = null, error = null) => ({state, effect, error});
	try {
		if (!event || !finite(event.nowMs) || event.nowMs < 0 || state.lastTimeMs !== null && event.nowMs < state.lastTimeMs) throw new TypeError('monotonic time required');
		if (!['measure','invalidate','pause','tick','activate','settle','dismiss'].includes(event.type)) throw new TypeError('unknown transient event');
		if (state.phase === 'closed') return result();
		if (event.type === 'measure' && (!epoch(event.epoch) || !epoch(event.measuredEpoch) || !['placed','wait'].includes(event.status) || typeof event.reachable !== 'boolean')) throw new TypeError('invalid placement observation');
		if (event.type === 'pause' && typeof event.paused !== 'boolean') throw new TypeError('invalid pause');
		if (event.type === 'settle' && (!epoch(event.ticket) || typeof event.ok !== 'boolean')) throw new TypeError('invalid action receipt');
		if (state.lastTimeMs !== null && state.visibility === 'visible' && !state.paused && state.remainingMs !== null) state.remainingMs = Math.max(0, state.remainingMs - (event.nowMs - state.lastTimeMs));
		state.lastTimeMs = event.nowMs;
		if (state.remainingMs === 0) { state.phase = 'closed'; state.visibility = 'waiting'; return result(); }
		if (event.type === 'measure') {
			state.visibility = event.status === 'placed' && event.epoch === event.measuredEpoch && event.reachable ? 'visible' : 'waiting';
			state.measuredEpoch = state.visibility === 'visible' ? event.epoch : null;
		} else if (event.type === 'invalidate') { state.visibility = 'waiting'; state.measuredEpoch = null; }
		else if (event.type === 'pause') state.paused = event.paused;
		else if (event.type === 'dismiss') {
			if (state.phase === 'running') return result(null, 'action-in-flight');
			state.phase = 'closed'; state.visibility = 'waiting';
		} else if (event.type === 'activate') {
			// An old hit-test is not permission to run the action after the viewport changed.
			if (!state.action || state.phase !== 'pending' || state.visibility !== 'visible') return result(null, 'action-not-reachable');
			if (!epoch(event.epoch) || event.epoch !== state.measuredEpoch || event.reachable !== true) { state.visibility = 'waiting'; state.measuredEpoch = null; return result(null, 'action-not-reachable'); }
			if (!epoch(state.ticket + 1)) throw new RangeError('action ticket exhausted');
			state.ticket++; state.phase = 'running'; state.error = null;
			return result({type: 'invoke', operationId: state.action.operationId, ticket: state.ticket});
		} else if (event.type === 'settle' && state.phase === 'running' && event.ticket === state.ticket) {
			if (event.ok) { state.phase = 'closed'; state.visibility = 'waiting'; }
			else { state.phase = 'pending'; state.error = typeof event.error === 'string' ? event.error : 'action failed'; }
		}
		return result();
	} catch (error) {
		// Invalid observations withdraw the hit target, never the retained operation.
		return {state: {...copy(previous), visibility: 'waiting', measuredEpoch: null}, effect: null, error: String(error.message)};
	}
}
