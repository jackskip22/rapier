// SPDX-License-Identifier: MIT
const failure = (message, code = 'JXL_INTERNAL') => Object.assign(new Error(message), {code});
const dimensions = (width, height) => {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw failure('Invalid protection dimensions.');
};
const pictureDescription = picture => {
  const source = picture.description ?? picture, {width, height} = picture;
  dimensions(width, height);
  return Object.freeze({width, height, colorSpace: source.colorSpace ?? 'srgb', bitDepth: source.bitDepth ?? 8,
    sampleFormat: source.sampleFormat ?? 'uint', transferFunction: source.transferFunction ?? 'srgb',
    alphaPremultiplied: source.alphaPremultiplied ?? false, orientation: source.orientation ?? 1,
    intensityTarget: source.intensityTarget ?? 255});
};
const rectangle = r => {
  const out = {x: r.x, y: r.y, width: r.width ?? r.w, height: r.height ?? r.h};
  if (![out.x, out.y, out.width, out.height].every(Number.isSafeInteger) || out.width < 1 || out.height < 1)
    throw failure('Invalid protection rectangle.');
  return out;
};

export function createCaptureProtection() {
  const job = Object.freeze({}), ownedPlans = new WeakSet();
  let records = new WeakMap(), open = true, description = null, reference = null, source = null, bands = [];
  const check = () => { if (!open) throw failure('The protection job is closed.'); };
  const plan = (kind, width, height, detail = {}) => {
    check(); dimensions(width, height);
    const value = Object.freeze({kind, width, height, ...detail}); ownedPlans.add(value); return value;
  };
  const maskCopies = () => {
    const copies = new WeakMap();
    return (mask, count) => {
      if (!ArrayBuffer.isView(mask) || mask instanceof DataView || mask.length !== count)
        throw failure('The protection mask does not match its selected rectangle.');
      let copy = copies.get(mask);
      if (!copy) { copy = Uint8Array.from(mask); copies.set(mask, copy); }
      return copy;
    };
  };
  const record = (bytes, value) => {
    check();
    if (!(bytes instanceof Uint8Array) || !ownedPlans.has(value)) throw failure('Protection belongs to this job and its actual byte object.');
    records.set(bytes, {plan: value, reference, bands: reference ? null : bands}); return bytes;
  };
  const readRows = (pieces, width, y, count) => {
    const out = new Uint8Array(width * count * 4); let copied = 0;
    for (const band of pieces) {
      const from = Math.max(y, band.y), to = Math.min(y + count, band.y + band.height);
      if (to <= from) continue;
      out.set(band.data.subarray((from - band.y) * width * 4, (to - band.y) * width * 4), (from - y) * width * 4);
      copied += to - from;
    }
    if (copied !== count) throw failure('The admitted row reference is incomplete.');
    return out;
  };
  return {
    bind(picture, original = picture) {
      check();
      const next = pictureDescription(picture);
      if (description && Object.keys(description).some(key => description[key] !== next[key]))
        throw failure('A protection job changed its admitted picture description.');
      if (description) return;
      description = next; source = original;
      if (ArrayBuffer.isView(picture.data)) reference = Object.freeze({...next, data: picture.data});
      else if (typeof picture.rows !== 'function') throw failure('Protection requires the admitted comparison raster.');
    },
    referenceRows(y, picture) {
      check();
      if (reference || !description) return;
      const {width, height, data} = picture;
      if (width !== description.width || !Number.isSafeInteger(y) || y < 0 || y + height > description.height || data.length !== width * height * 4)
        throw failure('Admitted reference rows do not match this protection job.');
      const kept = [];
      for (const band of bands) {
        if (band.y + band.height <= y || band.y >= y + height) { kept.push(band); continue; }
        if (band.y < y) kept.push({y: band.y, height: y - band.y, data: band.data.subarray(0, (y - band.y) * width * 4)});
        if (band.y + band.height > y + height) kept.push({y: y + height, height: band.y + band.height - y - height,
          data: band.data.subarray((y + height - band.y) * width * 4)});
      }
      kept.push({y, height, data}); kept.sort((a, b) => a.y - b.y); bands = kept;
    },
    full(bytes, width, height) { return record(bytes, plan('full', width, height)); },
    empty(bytes, width, height) { return record(bytes, plan('empty', width, height)); },
    patches(width, height, pieces) {
      const copy = maskCopies(), placed = [];
      for (const piece of pieces) {
        const own = rectangle(piece.positions ? {...piece, x: piece.positions[0], y: piece.positions[1]} : piece);
        const mask = piece.mask && copy(piece.mask, own.width * own.height);
        const add = (x, y) => placed.push(Object.freeze({...own, x, y, ...(mask && {mask})}));
        if (piece.positions) {
          if (piece.positions.length % 2) throw failure('Invalid selected patch placements.');
          for (let i = 0; i < piece.positions.length; i += 2) {
            const x = piece.positions[i], y = piece.positions[i + 1];
            if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw failure('Invalid selected patch placement.');
            add(x, y);
          }
        } else add(own.x, own.y);
      }
      return plan('patches', width, height, {pieces: Object.freeze(placed)});
    },
    mixed(width, height, frames) {
      const copy = maskCopies();
      return plan('mixed', width, height, {frames: Object.freeze(frames.map(frame => {
        const r = rectangle(frame.r);
        return Object.freeze({...r, ...(frame.masked && {mask: copy(frame.exact, r.width * r.height)})});
      }))});
    },
    record,
    join(bytes, width, height, parts, rows) {
      const selected = []; let y = 0;
      for (const part of parts) {
        const count = Math.min(rows, height - y), child = records.get(part)?.plan;
        if (!child || child.width !== width || child.height !== count) return;
        selected.push(Object.freeze({y, height: count, plan: child})); y += count;
      }
      if (y !== height) throw failure('The selected capture bands do not cover the image.');
      record(bytes, plan('bands', width, height, {parts: Object.freeze(selected)}));
    },
    select(bytes) {
      check();
      const recorded = records.get(bytes), selected = recorded?.plan;
      if (!description || !selected || selected.width !== description.width || selected.height !== description.height)
        throw failure('The selected capture producer did not report its exact domain.', 'JXL_UNSUPPORTED');
      let selectedReference = recorded.reference;
      if (!selectedReference) {
        const pieces = recorded.bands, desc = description; let through = 0;
        for (const band of pieces) { if (band.y !== through) throw failure('The admitted row reference is incomplete.'); through += band.height; }
        if (through !== desc.height) throw failure('The admitted row reference is incomplete.');
        selectedReference = Object.freeze({...desc, rows(y, count) {
          if (!Number.isSafeInteger(y) || !Number.isSafeInteger(count) || y < 0 || count < 1 || y + count > desc.height)
            throw failure('Invalid selected reference rows.');
          return {data: readRows(pieces, desc.width, y, count)};
        }});
      }
      const result = Object.freeze({job, description, reference: selectedReference, source, plan: selected});
      open = false; records = new WeakMap(); reference = null; source = null; bands = [];
      return result;
    },
    close() { open = false; records = new WeakMap(); reference = null; source = null; bands = []; },
  };
}

function rowReader(plan) {
  if (plan.kind === 'full') return (_y, row) => row.fill(1);
  if (plan.kind === 'empty') return (_y, row) => row.fill(0);
  if (plan.kind === 'bands') {
    const parts = plan.parts.map(part => ({...part, read: rowReader(part.plan)})); let at = 0;
    return (y, row) => {
      while (at + 1 < parts.length && y >= parts[at].y + parts[at].height) at++;
      const part = parts[at];
      if (!part || y < part.y || y >= part.y + part.height) throw failure('Invalid selected band protection.');
      part.read(y - part.y, row);
    };
  }
  if (plan.kind !== 'patches' && plan.kind !== 'mixed') throw failure('Unknown selected protection plan.');
  const mixed = plan.kind === 'mixed', pieces = [...(mixed ? plan.frames : plan.pieces)].sort((a, b) => a.y - b.y);
  let at = 0, active = [];
  return (y, row) => {
    row.fill(mixed ? 1 : 0);
    active = active.filter(r => y < r.y + r.height);
    while (at < pieces.length && pieces[at].y <= y) {
      const r = pieces[at++]; if (y < r.y + r.height) active.push(r);
    }
    for (const r of active) {
      const left = Math.max(0, Math.min(row.length, r.x)), right = Math.max(left, Math.min(row.length, r.x + r.width));
      if (!r.mask) row.fill(mixed ? 0 : 1, left, right);
      else for (let x = left, k = (y - r.y) * r.width + left - r.x; x < right; x++, k++) {
        if (mixed ? !r.mask[k] : r.mask[k]) row[x] = mixed ? 0 : 1;
      }
    }
  };
}

export function* selectedProtectionRows(selected) {
  const {plan} = selected, row = new Uint8Array(plan.width), read = rowReader(plan);
  for (let y = 0; y < plan.height; y++) { read(y, row); yield {y, data: row}; }
}
