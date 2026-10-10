// SPDX-License-Identifier: MIT
// Paired source placement, shared by live editing and canonical-history proof.
import {_rapierTransformSplices, _rapierValidAuthored, _rapierHistoryEffects} from './journal-records.mjs';
import {sha256} from './hash.mjs';
import {canonicalJSON} from './data.mjs';

const whole = text => typeof text === 'string' && !/[\uD800-\uDFFF]/u.test(text);
function admitted(rows) {
  if (!Array.isArray(rows)) throw new RangeError('source_edits_invalid');
  let end = 0;
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.at) || row.at < end || Object.is(row.at, -0) ||
        !Number.isSafeInteger(row.remove) || row.remove < 0 || Object.is(row.remove, -0) ||
        !Number.isSafeInteger(row.at + row.remove) || !whole(row.insert)) throw new RangeError('source_edits_invalid');
    end = row.at + row.remove;
  }
}
function emit(rows, at, remove, insert = '') {
  if (!remove && !insert) return;
  const prior = rows.at(-1);
  if (prior && prior.at + prior.remove === at && (!insert || !prior.remove)) {
    prior.remove += remove; prior.insert += insert;
  } else rows.push({at, remove, insert});
}

// Sweep original-source boundaries. Each counter names a coordinate in one input's
// resulting document; concurrent insertions never enter the other input's removals.
export function transformPair(left, right, leftFirst) {
  admitted(left); admitted(right);
  const points = [...new Set([0, ...left.flatMap(row => [row.at, row.at + row.remove]),
    ...right.flatMap(row => [row.at, row.at + row.remove])])].sort((a, b) => a - b);
  const out = [[], []], rows = [left, right], index = [0, 0], position = [0, 0], deletingUntil = [0, 0];
  for (let point = 0; point < points.length; point++) {
    const at = points[point], insertions = ['', ''];
    for (let side = 0; side < 2; side++) while (rows[side][index[side]]?.at === at) {
      const row = rows[side][index[side]++];
      insertions[side] += row.insert;
      deletingUntil[side] = Math.max(deletingUntil[side], row.at + row.remove);
    }
    for (const side of leftFirst ? [0, 1] : [1, 0]) if (insertions[side]) {
      emit(out[side], position[1 - side], 0, insertions[side]);
      position[side] += insertions[side].length;
    }
    const length = (points[point + 1] ?? at) - at;
    for (let side = 0; side < 2; side++) {
      if (deletingUntil[side] > at && deletingUntil[1 - side] <= at)
        emit(out[side], position[1 - side], length);
    }
    for (let side = 0; side < 2; side++) if (deletingUntil[side] <= at) position[side] += length;
  }
  return {left: out[0], right: out[1]};
}

function applyBatch(text, rows) {
  const exact = rows.slice().reverse().map(row => ({pos: row.at,
    removed: text.slice(row.at, row.at + row.remove), inserted: row.insert}));
  if (rows.some(row => row.at + row.remove > text.length)) throw new RangeError('source_edits_invalid');
  const after = _rapierTransformSplices(text, exact);
  if (after === null) throw new RangeError('source_edits_invalid');
  return {text: after, splices: exact};
}

// Transport one sequential canonical act and every crossed record together. The
// reciprocal path is checked against exact source, rather than only equal end text.
// Canonical transport refuses deleting any authored unit already removed elsewhere.
export function transposeRecord(base, splices, id, records) {
  if (typeof base !== 'string' || !Array.isArray(splices) || typeof id !== 'string' || !Array.isArray(records))
    throw new RangeError('canonical_transport_invalid');
  let source = base, current = base;
  let crossed = records.map(record => ({...record, splices: record.splices.map(row => ({...row}))}));
  for (const record of crossed) {
    const next = _rapierTransformSplices(current, record.splices);
    if (next === null) throw new RangeError('canonical_transport_invalid');
    current = next;
  }
  const moved = [], sourceIndices = [];
  for (const [sourceIndex, row] of splices.entries()) {
    const submitted = _rapierTransformSplices(source, [row]);
    if (submitted === null) throw new RangeError('canonical_transport_invalid');
    let left = [{at: row.pos, remove: row.removed.length, insert: row.inserted}];
    const reciprocal = [];
    for (const record of crossed) {
      const steps = [];
      for (const other of record.splices) {
        const pair = transformPair(left, [{at: other.pos, remove: other.removed.length, insert: other.inserted}], id < record.transaction.id);
        left = pair.left; steps.push(pair.right);
      }
      reciprocal.push({record, steps});
    }
    if (left.reduce((sum, part) => sum + part.remove, 0) !== row.removed.length ||
        left.map(part => part.insert).join('') !== row.inserted) throw new RangeError('canonical_act_rebase_conflict');
    const applied = applyBatch(current, left);
    let replay = submitted;
    crossed = reciprocal.map(({record, steps}) => {
      const transported = [];
      for (const step of steps) {
        const value = applyBatch(replay, step); replay = value.text; transported.push(...value.splices);
      }
      const before = record.splices.reduce((sum, part) => sum + part.removed.length, 0);
      if (transported.reduce((sum, part) => sum + part.removed.length, 0) !== before ||
          transported.map(part => part.inserted).join('') !== record.splices.map(part => part.inserted).join(''))
        throw new RangeError('canonical_act_rebase_conflict');
      return {...record, splices: transported};
    });
    if (replay !== applied.text) throw new RangeError('canonical_transport_invalid');
    moved.push(...applied.splices); sourceIndices.push(...applied.splices.map(() => sourceIndex)); current = applied.text; source = submitted;
  }
  return {splices: moved, sourceIndices, against: crossed, text: current};
}

// Hosted and editor callers already own a reciprocal transport log. Convert only
// its admitted exact source to records, then prove canonical-unit preservation.
export function transposeSource(base, splices, client, log) {
  let source = base;
  const records = log.map(entry => {
    const applied = applyBatch(source, entry.splices); source = applied.text;
    return {transaction: {id: entry.client}, splices: applied.splices};
  });
  return transposeRecord(base, splices, client, records);
}

// The frontier names only causal maxima. Linear history needs one predecessor,
// and concurrent predecessors remain separate until an act observes both.
function authoredFrontier(records, visit = null) {
  const dependencies = new Map(), frontier = new Set();
  for (const record of records) {
    const id = record.transaction.id, basis = record.authored?.basis;
    if (visit) visit(record, basis ?? [...frontier].sort());
    if (!basis) { dependencies.set(id, [...frontier]); frontier.clear(); }
    else {
      const pending = [...basis], seen = new Set();
      while (pending.length) {
        const prior = pending.pop();
        if (seen.has(prior)) continue;
        if (!dependencies.has(prior)) throw new RangeError('canonical_origin_invalid');
        seen.add(prior); frontier.delete(prior); pending.push(...dependencies.get(prior));
      }
      dependencies.set(id, basis);
    }
    frontier.add(id);
  }
  return [...frontier].sort();
}

export function authoredBasis(records) { return authoredFrontier(records); }

export function authoredPlacements(base, records) {
  const origins = new Map(); let source = base;
  authoredFrontier(records, (record, basis) => {
    origins.set(record.transaction.id, record.authored ?? authoredPlacement(source, record.splices, basis));
    source = _rapierTransformSplices(source, record.splices);
    if (source === null) throw new RangeError('canonical_origin_invalid');
  });
  return origins;
}

// Immutable authored placement stays on its own act. Basis IDs refer only to this
// canonical history; no source snapshot or duplicate history is stored.
export function authoredPlacement(source, splices, basis) {
  const origin = {basis: basis.slice().sort(), source: sha256(source), splices: splices.map(row => ({...row}))};
  if (!_rapierValidAuthored(origin) || _rapierTransformSplices(source, splices) === null)
    throw new RangeError('canonical_origin_invalid');
  return origin;
}

// Reconstruct an authored view from the same records, then prove its exact physical
// placement. Equality of resulting text alone cannot prove a repeated-text anchor.
function authoredReplay(base, records, append = null) {
  const origins = new Map(), byId = new Map(), originalOrder = [], cache = new Map(), frontier = new Set();
  const effects = _rapierHistoryEffects(append ? [...records, append] : records);
  if (!effects.ok) throw new RangeError('canonical_origin_invalid');
  let source = base;
  for (const record of append ? [...records, append] : records) {
    const id = record.transaction.id;
    if (byId.has(id)) throw new RangeError('canonical_origin_invalid');
    const origin = Object.hasOwn(record, 'authored') ? record.authored : authoredPlacement(source, record.splices, [...frontier]);
    if (!_rapierValidAuthored(origin) || origin.basis.some(prior => !byId.has(prior)))
      throw new RangeError('canonical_origin_invalid');
    const seen = new Set(), pending = [...origin.basis];
    while (pending.length) {
      const prior = pending.pop(); if (seen.has(prior)) continue;
      seen.add(prior); pending.push(...origins.get(prior).basis);
    }
    if (origin.basis.some(id => origin.basis.some(other => other !== id && (() => {
      const pending = [...origins.get(other).basis], visited = new Set();
      while (pending.length) { const next = pending.pop(); if (next === id) return true;
        if (!visited.has(next)) { visited.add(next); pending.push(...origins.get(next).basis); } }
      return false;
    })()))) throw new RangeError('canonical_origin_invalid');
    const refs = effects.references.get(id) || [];
    if (refs.some(id => !seen.has(id))) throw new RangeError('canonical_origin_invalid');
    for (const prior of seen) frontier.delete(prior); frontier.add(id);
    origins.set(id, origin); byId.set(id, record); originalOrder.push(id);
    if (record !== append) {
      source = _rapierTransformSplices(source, record.splices);
      if (source === null) throw new RangeError('canonical_origin_invalid');
    }
  }
  const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
  const ordered = (ids, selected = null) => {
    const order = [], known = new Set(ids), waiting = new Map(), dependents = new Map(), ready = [];
    const rank = id => selected ? Number(selected.has(id)) : Number(origins.get(id).splices.some(row => row.removed.length));
    const compare = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
    const push = id => { let at = ready.length; ready.push(id);
      while (at) { const parent = (at - 1) >> 1; if (compare(ready[parent], id) <= 0) break;
        ready[at] = ready[parent]; at = parent; } ready[at] = id; };
    const pop = () => { const first = ready[0], last = ready.pop(); if (ready.length) {
      let at = 0; while (at * 2 + 1 < ready.length) { let child = at * 2 + 1;
        if (child + 1 < ready.length && compare(ready[child + 1], ready[child]) < 0) child++;
        if (compare(last, ready[child]) <= 0) break; ready[at] = ready[child]; at = child;
      } ready[at] = last; } return first; };
    for (const id of ids) {
      const basis = origins.get(id)?.basis;
      if (!basis || basis.some(prior => !known.has(prior))) throw new RangeError('canonical_origin_invalid');
      waiting.set(id, basis.length);
      for (const prior of basis) { if (!dependents.has(prior)) dependents.set(prior, []); dependents.get(prior).push(id); }
      if (!basis.length) push(id);
    }
    while (ready.length) {
      const id = pop(); order.push(id);
      for (const next of dependents.get(id) || []) { waiting.set(next, waiting.get(next) - 1); if (!waiting.get(next)) push(next); }
    }
    if (order.length !== ids.length) throw new RangeError('canonical_origin_invalid');
    return order;
  };
  const closureOf = basis => {
    const closure = new Set(), pending = [...basis];
    while (pending.length) { const prior = pending.pop(); if (closure.has(prior)) continue;
      closure.add(prior); pending.push(...origins.get(prior).basis); }
    return closure;
  };
  const canonicalOrder = ordered(originalOrder), firstExplicit = (append ? [...records, append] : records).findIndex(record => Object.hasOwn(record, 'authored'));
  const implicitPrefix = firstExplicit < 0 ? records.length : firstExplicit;
  const materialize = order => {
    const key = canonicalJSON(order);
    if (cache.has(key)) return cache.get(key);
    const placed = [], ids = new Set(), sourceIndices = new Map(); let text = base;
    if (!order.length) { const empty = {text, records: [], sourceIndices}; cache.set(key, empty); return empty; }
    // An implicit linear prefix already is its authored view. Replay it once;
    // reconstructing every growing prefix adds no evidence.
    let prefix = 0;
    while (prefix < order.length && prefix < implicitPrefix && order[prefix] === originalOrder[prefix]) {
      const record = byId.get(order[prefix]); text = _rapierTransformSplices(text, record.splices);
      if (text === null) throw new RangeError('canonical_origin_invalid');
      placed.push(record); ids.add(order[prefix++]);
      if (record.derivedCommentIndex != null) sourceIndices.set(record.transaction.id, record.splices.map((_, index) => index));
    }
    for (const id of order.slice(prefix)) {
      const original = byId.get(id), origin = origins.get(id);
      if (!original || ids.has(id) || origin.basis.some(prior => !ids.has(prior)))
        throw new RangeError('canonical_origin_invalid');
      const closure = closureOf(origin.basis), basisOrder = canonicalOrder.filter(prior => closure.has(prior)), basis = materialize(basisOrder);
      if (sha256(basis.text) !== origin.source) throw new RangeError('canonical_origin_invalid');
      // Reconstruct causal context before crossing it. Physical gaps may already
      // have collapsed under a deletion; they cannot choose concurrent ordering.
      const contextOrder = canonicalOrder.filter(prior => ids.has(prior)), context = same(contextOrder, [...ids]) ? {text, records: placed} : materialize(contextOrder);
      if (context.text !== text) throw new RangeError('canonical_origin_invalid');
      const alignedOrder = [...basisOrder, ...contextOrder.filter(prior => !closure.has(prior))];
      const aligned = same(alignedOrder, [...ids]) ? {text, records: placed} : materialize(alignedOrder);
      if (aligned.text !== text) throw new RangeError('canonical_origin_invalid');
      const crossed = aligned.records.slice(basisOrder.length);
      const moved = transposeRecord(basis.text, origin.splices, id, crossed);
      if (_rapierTransformSplices(text, moved.splices) !== moved.text) throw new RangeError('canonical_origin_invalid');
      placed.push({...original, splices: moved.splices}); text = moved.text; ids.add(id);
      if (original.derivedCommentIndex != null) sourceIndices.set(id, moved.sourceIndices);
      cache.set(canonicalJSON(order.slice(0, placed.length)), {text, records: placed.slice(), sourceIndices: new Map(sourceIndices)});
    }
    const value = {text, records: placed, sourceIndices}; cache.set(key, value); return value;
  };
  const physicalOrder = append ? originalOrder.slice(0, -1) : originalOrder, physical = materialize(physicalOrder);
  if (physical.text !== source || physical.records.some((row, index) => !same(row.splices, records[index].splices)))
    throw new RangeError('canonical_origin_invalid');
  return {source, origins, originalOrder, materialize, ordered};
}

export function authoredHistory(base, records, selected = null) {
  const replay = authoredReplay(base, records);
  if (!selected) return {text: replay.source, records, origins: replay.origins};
  // Targets follow independent work only in this transient Undo projection.
  const projected = replay.materialize(replay.ordered(replay.originalOrder, selected));
  if (projected.text !== replay.source) throw new RangeError('canonical_origin_invalid');
  return {...projected, origins: replay.origins};
}

// Semantic annotations use the original splice coordinates, even when an accepted
// physical placement split those rows. The same replay proves the causal basis first.
export function authoredSourceReader(base, records) {
  const replay = authoredReplay(base, records);
  return actId => {
    const origin = replay.origins.get(actId);
    if (!origin) throw new RangeError('canonical_origin_invalid');
    const ids = new Set(), pending = [...origin.basis];
    while (pending.length) {
      const id = pending.pop();
      if (ids.has(id)) continue;
      ids.add(id); pending.push(...replay.origins.get(id).basis);
    }
    const basis = replay.materialize(replay.ordered([...ids]));
    if (sha256(basis.text) !== origin.source) throw new RangeError('canonical_origin_invalid');
    return {source: basis.text, splices: origin.splices};
  };
}

// The original view and the accepted view are both reconstructed from the same
// immutable acts. The reciprocal rows are an exact ACK, not another history.
export function transposeAuthored(base, records, incoming, submitted) {
  if (!incoming.authored || !Array.isArray(submitted)) throw new RangeError('canonical_origin_invalid');
  const replay = authoredReplay(base, records, incoming), id = incoming.transaction.id;
  const authored = replay.materialize([...submitted, id]);
  if (canonicalJSON(authored.records.at(-1).splices) !== canonicalJSON(incoming.splices))
    throw new RangeError('canonical_origin_invalid');
  const accepted = replay.materialize(replay.originalOrder), known = new Set([...submitted, id]);
  const reciprocal = replay.materialize([...submitted, id, ...replay.ordered(replay.originalOrder).filter(prior => !known.has(prior))]);
  if (reciprocal.text !== accepted.text) throw new RangeError('canonical_origin_invalid');
  return {text: accepted.text, splices: accepted.records.at(-1).splices,
    submittedBefore: replay.materialize(submitted).text, submitted: authored.text,
    against: reciprocal.records.slice(submitted.length + 1)};
}
