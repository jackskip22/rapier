// Visual observations carry no source handles or edit authority. SPDX-License-Identifier: AGPL-3.0-only.
export const VISUAL_LIMITS = Object.freeze({pixels: 4 * 1024 * 1024, edge: 4096, imageBytes: 2 * 1024 * 1024});
export const DRAWING_PREVIEW_EDGE = 512;
export const DRAWING_PREVIEW_CHARS = 24 * 1024;
export const DRAWING_PREVIEW_TOTAL_CHARS = 96 * 1024;

const scopes = new Set(['viewport', 'page', 'focus', 'selection']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const range = value => object(value) && integer(value.start) && integer(value.end) && value.end > value.start;
const sameRange = (a, b) => range(a) && range(b) && a.start === b.start && a.end === b.end;
const refused = reason => ({outcome: 'refused', reason, representation: 'visual'});
const reasons = new Set(['cancelled', 'document_changed', 'document_not_settled', 'human_edit_in_progress',
  'visual_target_changed', 'visual_target_missing', 'visual_target_unavailable', 'visual_too_large',
  'visual_resources_unavailable', 'visual_render_unavailable', 'visual_capture_busy', 'visual_capture_expired',
  'editor_not_present', 'notes_library_open', 'draw_session_open', 'host_not_connected']);

export function visualDrawingIdentity(value) {
  if (!object(value) || typeof value.session !== 'string' || !value.session || value.session.length > 256 ||
      !integer(value.surfaceGeneration)) return null;
  if (value.occurrence === null && value.assetGeneration === null)
    return {session: value.session, surfaceGeneration: value.surfaceGeneration, assetGeneration: null, occurrence: null};
  if (typeof value.assetGeneration !== 'string' || !/^[a-f0-9]{64}$/.test(value.assetGeneration) ||
      !range(value.occurrence) || typeof value.occurrence.reference !== 'string' ||
      !value.occurrence.reference || value.occurrence.reference.length > 256) return null;
  const source = value.occurrence;
  if (source.position != null && !integer(source.position) || source.imageIndex != null && !integer(source.imageIndex) ||
      source.blockId != null && (typeof source.blockId !== 'string' || !source.blockId || source.blockId.length > 256)) return null;
  return {session: value.session, surfaceGeneration: value.surfaceGeneration, assetGeneration: value.assetGeneration,
    occurrence: {reference: source.reference, position: source.position ?? source.start,
      ...(source.blockId != null ? {blockId: source.blockId} : {}),
      ...(source.imageIndex != null ? {imageIndex: source.imageIndex} : {}), start: source.start, end: source.end}};
}

export function sameVisualDrawing(a, b) {
  if (a == null || b == null) return a == null && b == null;
  const left = visualDrawingIdentity(a), right = visualDrawingIdentity(b);
  return !!left && !!right && JSON.stringify(left) === JSON.stringify(right);
}

export function visualRequest(state, args = {}) {
  if (!object(state) || typeof state.documentId !== 'string' || !state.documentId || !integer(state.revision))
    return refused('document_changed');
  if (args.expectedRevision !== state.revision) return refused('document_changed');
  const scope = args.scope || 'viewport';
  if (!scopes.has(scope)) return refused('visual_target_unavailable');
  const request = {kind: 'visual', documentId: state.documentId, revision: state.revision, scope};
  const detail = args.detail === true && scope === 'focus' && range(args.sourceRange) &&
    typeof args.block === 'string' && args.block.length > 0 && args.block.length <= 256;
  if (state.drawing != null) {
    const drawing = visualDrawingIdentity(state.drawing);
    if (!drawing) return refused('visual_target_unavailable');
    const named = scope === 'focus' && range(args.sourceRange) ? args.sourceRange : null, at = drawing.occurrence;
    const elsewhere = named && !(at && at.start < named.end && at.end > named.start);
    if (elsewhere && !detail) return refused('draw_session_open');
    if (!elsewhere) request.drawing = drawing;
  }
  if ((!request.drawing || range(args.sourceRange)) && (scope === 'focus' || scope === 'selection')) {
    const named = scope === 'focus' && args.sourceRange !== undefined, target = named ? args.sourceRange : state[scope];
    if (!range(target) || typeof state.text !== 'string' || target.end > state.text.length) return refused('visual_target_missing');
    request.sourceRange = {start: target.start, end: target.end};
    if (named) request.named = true;
  }
  if (detail && args.preview === true && Number.isSafeInteger(args.previewChars) && args.previewChars <= 0)
    return refused('visual_too_large');
  if (detail) Object.assign(request, {block: args.block, detail: true, ...(args.preview === true ? {preview: true,
    previewChars: Number.isSafeInteger(args.previewChars) && args.previewChars > 0
      ? Math.min(args.previewChars, DRAWING_PREVIEW_CHARS) : DRAWING_PREVIEW_CHARS} : {})});
  return {outcome: 'ok', request};
}

export function visualDimensions(width, height) {
  return Number.isSafeInteger(width) && width > 0 && width <= VISUAL_LIMITS.edge &&
    Number.isSafeInteger(height) && height > 0 && height <= VISUAL_LIMITS.edge && width * height <= VISUAL_LIMITS.pixels;
}

export function visualAcknowledgement(args) {
  const input = args.fact || {}, image = input.image;
  const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
  return {arguments: {...args, fact: {...pick(input, ['documentId', 'revision', 'scope', 'drawing', 'outcome', 'reason', 'sourceRange']),
    ...(image ? {image: pick(image, ['mimeType', 'data', 'width', 'height'])} : {})}},
    metadata: {visualId: args.visualId, documentId: input.documentId, revision: input.revision,
      ...pick(input, ['state', 'projection']), ...pick(image, ['nativeWidth', 'nativeHeight', 'reduced'])}};
}

function pngBytes(image) {
  if (!object(image) || image.mimeType !== 'image/png' || !visualDimensions(image.width, image.height) ||
      typeof image.data !== 'string' || !image.data || image.data.length > Math.ceil(VISUAL_LIMITS.imageBytes / 3) * 4 ||
      image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) return null;
  let binary;
  try { binary = atob(image.data); } catch { return null; }
  if (binary.length > VISUAL_LIMITS.imageBytes || btoa(binary) !== image.data ||
      binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return null;
  const byte = offset => binary.charCodeAt(offset);
  const uint = offset => byte(offset) * 0x1000000 + (byte(offset + 1) << 16) + (byte(offset + 2) << 8) + byte(offset + 3);
  let offset = 8, header = false, data = false, ended = false;
  while (offset + 12 <= binary.length) {
    const length = uint(offset), type = binary.slice(offset + 4, offset + 8), next = offset + length + 12;
    if (next > binary.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    let crc = 0xffffffff;
    for (let i = offset + 4; i < next - 4; i++) {
      crc ^= byte(i);
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== uint(next - 4)) return null;
    if (!header) {
      if (type !== 'IHDR' || length !== 13 || uint(offset + 8) !== image.width || uint(offset + 12) !== image.height ||
          byte(offset + 18) !== 0 || byte(offset + 19) !== 0 || byte(offset + 20) > 1) return null;
      const depths = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
      if (!depths[byte(offset + 17)]?.includes(byte(offset + 16))) return null;
      header = true;
    } else if (type === 'IHDR') return null;
    if (type === 'IDAT') data = true;
    if (type === 'IEND') { if (length || !data || next !== binary.length) return null; ended = true; }
    offset = next;
  }
  return ended && offset === binary.length ? binary.length : null;
}

export function visualResult(request, fact) {
  if (!object(request) || request.kind !== 'visual' || !scopes.has(request.scope) || !object(fact) ||
      fact.documentId !== request.documentId || fact.revision !== request.revision || fact.scope !== request.scope)
    return refused('document_changed');
  if (fact.outcome !== 'ok') return refused(reasons.has(fact.reason) ? fact.reason : 'visual_render_unavailable');
  if (!sameVisualDrawing(request.drawing, fact.drawing)) return refused('visual_target_changed');
  if (request.sourceRange && !sameRange(request.sourceRange, fact.sourceRange)) return refused('visual_target_changed');
  const size = pngBytes(fact.image);
  if (size === null) return refused('visual_image_invalid');
  if (request.preview && Math.max(fact.image.width, fact.image.height) > DRAWING_PREVIEW_EDGE) return refused('visual_image_invalid');
  if (request.preview && fact.image.data.length > (request.previewChars || DRAWING_PREVIEW_CHARS)) return refused('visual_image_invalid');
  if (request.detail && !['wet', 'settled', 'stored'].includes(fact.state)) return refused('visual_image_invalid');
  const native = fact.image.nativeWidth !== undefined || fact.image.nativeHeight !== undefined;
  if (native && (!integer(fact.image.nativeWidth) || !integer(fact.image.nativeHeight) ||
      fact.image.nativeWidth < fact.image.width || fact.image.nativeHeight < fact.image.height ||
      fact.image.reduced !== (fact.image.width < fact.image.nativeWidth || fact.image.height < fact.image.nativeHeight)))
    return refused('visual_image_invalid');
  if (fact.projection !== undefined && !['stored', 'settled'].includes(fact.projection)) return refused('visual_image_invalid');
  return {outcome: 'ok', representation: 'visual', observation: {documentId: request.documentId, revision: request.revision,
    scope: request.scope, mimeType: 'image/png', width: fact.image.width, height: fact.image.height, bytes: size,
    ...(request.drawing ? {drawing: visualDrawingIdentity(request.drawing)} : {}),
    ...(request.sourceRange ? {sourceRange: {...request.sourceRange}, ...(request.named ? {named: true} : {})} : {}),
    ...(request.detail ? {block: request.block, detail: true, state: fact.state, ...(request.preview ? {preview: true} : {})} : {}),
    ...(fact.projection ? {projection: fact.projection} : {}),
    ...(native ? {nativeWidth: fact.image.nativeWidth, nativeHeight: fact.image.nativeHeight, reduced: fact.image.reduced} : {})}};
}
