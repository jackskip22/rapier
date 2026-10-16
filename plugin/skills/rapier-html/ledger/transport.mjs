// SPDX-License-Identifier: MIT
// Paired source placement, shared by live editing and canonical-history proof.
import {_rapierTransformSplices, _rapierValidAuthored, _rapierHistoryEffects} from './journal-records.mjs';
import {projectInverseSource} from './inverse-source.mjs';
import {authoredBasis, authoredPlacement, authoredPlacements} from './authored-origin.mjs';
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
  // A concurrent act that already removed these same authored units and wrote the
  // same replacement is one physical edit. This act stays in history with no second
  // deletion. Pure insertions are never collapsed: each one is its own unit. An
  // inverse of that act means the replacement is not still in force.
  const sameRows = (left, right) => left.length === right.length && left.every((row, index) =>
    row.pos === right[index].pos && row.removed === right[index].removed && row.inserted === right[index].inserted);
  const matched = crossed.filter(record => sameRows(record.splices, splices));
  const targetsOf = record => record.transaction.sourceTransactionIds || (record.transaction.sourceTransactionId ? [record.transaction.sourceTransactionId] : []);
  const withdrawn = matched.some(record => crossed.some(other => targetsOf(other).includes(record.transaction.id) ||
    other.transaction.reverts === record.transaction.id || other.transaction.reapplies === record.transaction.id));
  if (splices.some(row => row.removed.length) && matched.length && !withdrawn)
    return {splices: [], sourceIndices: [], against: crossed, text: current};
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

export {authoredBasis, authoredPlacement, authoredPlacements};

// Reconstruct an authored view from the same records, then prove its exact physical
// placement. Equality of resulting text alone cannot prove a repeated-text anchor.
function authoredReplay(base, records, append = null) {
  const origins = new Map(), byId = new Map(), originalOrder = [], cache = new Map(), frontier = new Set();
  const effects = _rapierHistoryEffects(append ? [...records, append] : records);
  if (!effects.ok) throw new RangeError('canonical_origin_invalid');
  const referenced = new Set();
  let sharedInverses = false;
  for (const refs of effects.references.values()) for (const id of refs) {
    if (referenced.has(id)) sharedInverses = true;
    referenced.add(id);
  }
  const projectInverse = (text, placed, id) => {
    const refs = effects.references.get(id), before = _rapierHistoryEffects(placed);
    const after = _rapierHistoryEffects([...placed, {transaction: {id, sourceTransactionIds: refs}}]);
    if (!before.ok || !after.ok) throw new RangeError('canonical_origin_invalid');
    const result = projectInverseSource({source: text, initialSource: base,
      rows: placed.map(record => ({record, splices: record.splices})), effects: before}, new Set(refs), after);
    if (!result.ok) throw new RangeError('canonical_origin_invalid');
    return result;
  };
  // Only immutable text digests are reused, within this one replay. Every
  // authored-source comparison and physical placement proof still runs.
  const textHashes = new Map();
  const hashText = text => {
    if (typeof text !== 'string') return sha256(text);
    let digest = textHashes.get(text);
    if (digest === undefined) { digest = sha256(text); textHashes.set(text, digest); }
    return digest;
  };
  const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
  // Only owner-created ordered views of already admitted string IDs use this.
  const sameIds = (a, b) => {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
    return true;
  };
  let source = base, linearPrefix = 0;
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
    // An explicit origin can prove the same linear placement as an implicit one.
    // Preserve the origin, but do not reconstruct every growing prefix to prove it again.
    if (linearPrefix === originalOrder.length && same(origin.basis, [...frontier].sort()) &&
        same(origin.splices, record.splices) && (!Object.hasOwn(record, 'authored') || origin.source === sha256(source)))
      linearPrefix++;
    for (const prior of seen) frontier.delete(prior); frontier.add(id);
    origins.set(id, origin); byId.set(id, record); originalOrder.push(id);
    if (record !== append) {
      source = _rapierTransformSplices(source, record.splices);
      if (source === null) throw new RangeError('canonical_origin_invalid');
    }
  }
  const coverKey = origin => origin?.splices.some(row => row.removed.length)
    ? canonicalJSON({basis: origin.basis, splices: origin.splices}) : null;
  const coverCounts = new Map();
  for (const [id, origin] of origins) {
    if (effects.references.get(id)?.length) continue;
    const key = coverKey(origin);
    if (key) coverCounts.set(key, (coverCounts.get(key) || 0) + 1);
  }
  // Two inverses can name different acts and still withdraw one physical replacement.
  const sharesCover = id => (effects.references.get(id) || []).some(ref => {
    const key = coverKey(origins.get(ref));
    return !!key && coverCounts.get(key) > 1;
  });
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
  const canonicalOrder = ordered(originalOrder);
  // Only the three immediate fresh-spread call sites use this entry. Nothing
  // retains allocation trust after an array has crossed an observable method.
  const literalKey = order => {
    // An input iterator can supply arbitrary values. Preserve the whole-array
    // depth/refusal path before any per-string encoding in that case.
    for (let index = 0; index < order.length; index++)
      if (typeof order[index] !== 'string') return canonicalJSON(order);
    // Keep each canonical primitive encoder call and its serializer behavior.
    return '[' + Array.from({length: order.length}, (_, index) => canonicalJSON(order[index])).join(',') + ']';
  };
  const materialize = (order, rawSubmitted = false) => materializeKey(order, canonicalJSON(order), rawSubmitted);
  const materializeLiteral = order => materializeKey(order, literalKey(order), false);
  const materializeKey = (order, key, rawSubmitted) => {
    if (cache.has(key)) return cache.get(key);
    let prefixEnds = null;
    const prefixKey = length => {
      // The original submitted array keeps its existing slice/species/data gate.
      // Only this module's own order allocations use the validated key string.
      if (rawSubmitted) return canonicalJSON(order.slice(0, length));
      if (!prefixEnds) {
        prefixEnds = [1];
        let quoted = false, depth = 0;
        // Scan canonical JSON only: an escaped code unit cannot end a string,
        // and commas inside strings or nested values cannot split this array.
        for (let at = 1; at < key.length - 1; at++) {
          const code = key.charCodeAt(at);
          if (quoted) {
            if (code === 92) at++;
            else if (code === 34) quoted = false;
          } else if (code === 34) quoted = true;
          else if (code === 91 || code === 123) depth++;
          else if (code === 93 || code === 125) depth--;
          else if (code === 44 && depth === 0) prefixEnds.push(at);
        }
        if (key.length > 2) prefixEnds.push(key.length - 1);
      }
      return length === prefixEnds.length - 1 ? key : key.slice(0, prefixEnds[length]) + ']';
    };
    let placed = [], ids = new Set(), sourceIndices = new Map(), text = base;
    if (!order.length) { const empty = {text, records: [], sourceIndices}; cache.set(key, empty); return empty; }
    // A proved linear prefix already is its authored view. Replay it once;
    // reconstructing every growing prefix adds no evidence.
    let prefix = 0;
    // Resume only an exact ordered prefix already proved in this replay. Copy its
    // mutable containers before extending it; transported rows retain their placement.
    for (let length = order.length - 1; length > 0; length--) {
      const prior = cache.get(prefixKey(length));
      if (!prior) continue;
      placed = prior.records.slice(); ids = new Set(order.slice(0, length));
      sourceIndices = new Map(prior.sourceIndices); text = prior.text; prefix = length;
      break;
    }
    while (prefix < order.length && prefix < linearPrefix && order[prefix] === originalOrder[prefix]) {
      const record = byId.get(order[prefix]); text = _rapierTransformSplices(text, record.splices);
      if (text === null) throw new RangeError('canonical_origin_invalid');
      placed.push(record); ids.add(order[prefix++]);
      if (record.derivedCommentIndex != null) sourceIndices.set(record.transaction.id, record.splices.map((_, index) => index));
    }
    for (const id of order.slice(prefix)) {
      const original = byId.get(id), origin = origins.get(id);
      if (!original || ids.has(id) || origin.basis.some(prior => !ids.has(prior)))
        throw new RangeError('canonical_origin_invalid');
      const closure = closureOf(origin.basis);
      if (closure.size === ids.size && [...closure].every(prior => ids.has(prior))) {
        // The current view already is the complete authored context. There are no
        // independent rows to cross, even when earlier acts were concurrent.
        if (hashText(text) !== origin.source) throw new RangeError('canonical_origin_invalid');
        const next = _rapierTransformSplices(text, origin.splices);
        if (next === null) throw new RangeError('canonical_origin_invalid');
        placed.push({...original, splices: origin.splices}); text = next; ids.add(id);
        if (original.derivedCommentIndex != null) sourceIndices.set(id, origin.splices.map((_, index) => index));
        cache.set(prefixKey(placed.length), {text, records: placed.slice(), sourceIndices: new Map(sourceIndices)});
        continue;
      }
      const basisOrder = canonicalOrder.filter(prior => closure.has(prior)), basis = materialize(basisOrder);
      if (hashText(basis.text) !== origin.source) throw new RangeError('canonical_origin_invalid');
      // Reconstruct causal context before crossing it. Physical gaps may already
      // have collapsed under a deletion; they cannot choose concurrent ordering.
      const contextOrder = canonicalOrder.filter(prior => ids.has(prior)), context = sameIds(contextOrder, [...ids]) ? {text, records: placed} : materialize(contextOrder);
      if (context.text !== text) throw new RangeError('canonical_origin_invalid');
      const alignedOrder = [...basisOrder, ...contextOrder.filter(prior => !closure.has(prior))];
      const aligned = sameIds(alignedOrder, [...ids]) ? {text, records: placed} : materializeLiteral(alignedOrder);
      if (aligned.text !== text) throw new RangeError('canonical_origin_invalid');
      const crossed = aligned.records.slice(basisOrder.length);
      let moved;
      if (effects.references.get(id)?.length && (sharedInverses || sharesCover(id))) {
        // Each inverse retains its own targets. First prove the exact intention
        // in its causal source, then place that choice in the accepted effect
        // graph. Another inverse may already suppress the same original bytes,
        // including when the two inverses name different authors of one replacement.
        const authored = projectInverse(basis.text, basis.records, id);
        if (!same(origin.splices, authored.splices) ||
            _rapierTransformSplices(basis.text, origin.splices) !== authored.after)
          throw new RangeError('canonical_origin_invalid');
        const accepted = projectInverse(text, aligned.records, id);
        moved = {text: accepted.after, splices: accepted.splices};
      } else moved = transposeRecord(basis.text, origin.splices, id, crossed);
      if (_rapierTransformSplices(text, moved.splices) !== moved.text) throw new RangeError('canonical_origin_invalid');
      placed.push({...original, splices: moved.splices}); text = moved.text; ids.add(id);
      if (original.derivedCommentIndex != null) sourceIndices.set(id, moved.sourceIndices);
      cache.set(prefixKey(placed.length), {text, records: placed.slice(), sourceIndices: new Map(sourceIndices)});
    }
    const value = {text, records: placed, sourceIndices}; cache.set(key, value); return value;
  };
  const physicalOrder = append ? originalOrder.slice(0, -1) : originalOrder, physical = materialize(physicalOrder);
  if (physical.text !== source || physical.records.some((row, index) => !same(row.splices, records[index].splices)))
    throw new RangeError('canonical_origin_invalid');
  // Raw submission is selected here by a private call site, never an input flag.
  return {source, origins, originalOrder, materialize, materializeLiteral,
    materializeSubmitted: order => materialize(order, true), ordered};
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
  const authored = replay.materializeLiteral([...submitted, id]);
  if (canonicalJSON(authored.records.at(-1).splices) !== canonicalJSON(incoming.splices))
    throw new RangeError('canonical_origin_invalid');
  const accepted = replay.materialize(replay.originalOrder), known = new Set([...submitted, id]);
  const reciprocal = replay.materializeLiteral([...submitted, id, ...replay.ordered(replay.originalOrder).filter(prior => !known.has(prior))]);
  if (reciprocal.text !== accepted.text) throw new RangeError('canonical_origin_invalid');
  return {text: accepted.text, splices: accepted.records.at(-1).splices,
    submittedBefore: replay.materializeSubmitted(submitted).text, submitted: authored.text,
    against: reciprocal.records.slice(submitted.length + 1)};
}
