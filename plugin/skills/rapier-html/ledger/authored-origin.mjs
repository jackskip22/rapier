// SPDX-License-Identifier: MIT
import {_rapierTransformSplices, _rapierValidAuthored} from "./journal-records.mjs";
import {sha256} from "./hash.mjs";

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

export function authoredPlacement(source, splices, basis) {
  const origin = {basis: basis.slice().sort(), source: sha256(source), splices: splices.map(row => ({...row}))};
  if (!_rapierValidAuthored(origin) || _rapierTransformSplices(source, splices) === null)
    throw new RangeError('canonical_origin_invalid');
  return origin;
}

