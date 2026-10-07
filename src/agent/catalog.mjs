import { validateInput, agentInputSchema } from './validate-input.mjs';
import { VERSION } from '../version.mjs';
import { VISUAL_LIMITS } from './visual.mjs';
import { FIND_KINDS } from './structure-request.mjs';

export const MAX_TEXT_BYTES = 25 * 1024 * 1024;
// Exported files remain bounded while the door builds and retains their exact bytes.
export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
export const MAX_FILENAME_CHARS = 256;
// The MCP UI resource's address: names a release, not a deployment. mcp/worker.mjs re-exports it; tools/build.mjs's manifest check reads it.
export const UI_RESOURCE = `ui://rapier/editor-${VERSION}.html`;
const string = (maxLength = 256, description) => ({type: 'string', maxLength, ...(description ? {description} : {})});
const described = (schema, description) => ({...schema, description});
const text = string(MAX_TEXT_BYTES);
const editText = string(262144);
const ref = string(128);
const operationId = {...string(128, 'Optional retry identity scoped to this principal, connection and document. An unchanged call at the same returned revision replays for 24 hours. Reusing it with changed arguments or revision refuses; an expired mutation identity never executes again. Inspect before starting another operation. Calls without it never replay.'), minLength: 1};
const integer = (minimum, maximum, description) => ({type: 'integer', minimum, maximum, ...(description ? {description} : {})});
const pageSize = (minimum, maximum, description) => integer(minimum, Number.MAX_SAFE_INTEGER, description + ' Clamped to ' + maximum + '.');
const object = (properties = {}, required = []) => ({type: 'object', properties, required, additionalProperties: false});
const authoredObject = (properties, required = []) => ({...object(properties, required), 'x-rapier-strict': true});
const kinds = {type: 'string', enum: ['markdown', 'text', 'code'], description: 'markdown, text or code; the filename decides when absent.'};
const ids = {type: 'array', items: ref, minItems: 1, maxItems: 128, uniqueItems: true};
// Every argument says what it takes: a shape guessed from a name is a wasted call.
const cursor = string(128, 'Continues the previous page.');
const within = string(128, 'An outline ref to stay inside.');
const editBatch = object({edits: {type: 'array', minItems: 1, maxItems: 16, description: 'Up to 16 edits, settled together.', items: object({
  context_handle: string(128, 'The handle for exactly the text this edit touches, from read_context or find.'),
  text: string(262144, 'Replacement or insertion source. Markdown is literal, without an outer display fence; Mermaid ends at its closing fence.'),
  placement: {type: 'string', enum: ['replace', 'before', 'after'], description: 'replace (default) swaps the disclosed text; before or after inserts beside it.'}}, ['context_handle', 'text'])},
  label: string(120, 'A short name the person sees for this change.'), note: string(240, 'A sentence for the person about this change.')}, ['edits']);
const reviewCause = {enum: ['will', 'ask', 'check', 'proposal']};
const document = string(64, "The document value rapier.open returned. With a connected host it names the workspace and the connection is the authority; without one it is the workspace's whole authority, so keep it private.");
export const RESULT_SCHEMA = {type: 'object', properties: {outcome: {type: 'string'}, reason: {type: 'string'}, cause: reviewCause, reviewId: ref, document, documentId: {type: 'string'}, documentRevision: {type: 'integer'}, representation: {const: 'source'}}, required: ['outcome'], additionalProperties: true};
const count = {type: 'integer', minimum: 0};
const flag = {type: 'boolean'};
const nullableRef = {type: ['string', 'null'], maxLength: 128};
const rows = item => ({type: 'array', items: item});
const drawingId = {...string(64), minLength: 1, pattern: '^[A-Za-z0-9_-]+$'};
const shapeIds = described({...ids, items: drawingId}, 'The ids of the shapes it acts on.');
const drawingNumber = (minimum, maximum, description) => ({type: ['number', 'null'], minimum, maximum, ...(description ? {description} : {})});
const drawingChoice = (values, description) => ({type: ['string', 'null'], enum: [...values, null], ...(description ? {description} : {})});
const drawingFlag = {type: ['boolean', 'null']};
const drawingLook = {
  brush: {...string(24, 'The brush supported by this object, or null for its default.'), type: ['string', 'null']},
  style: {...string(16, 'The fill or line style supported by this object, or null for its default.'), type: ['string', 'null']},
  ink: {type: ['string', 'null'], maxLength: 16, description: 'The ink; a palette name or #RRGGBB. null removes the override.'},
  border: {type: ['string', 'null'], maxLength: 16, description: 'The border ink of a solid shape; null removes it.'},
  dash: drawingChoice(['dashed', 'dotted'], 'The dash; null selects a solid line.'),
  nib: {type: ['integer', 'null'], minimum: 2, maximum: 24, description: 'The Width control, in native nib units.'},
  smooth: {type: ['integer', 'null'], minimum: 0, maximum: 100, description: 'The smoothing control.'},
  textFont: {type: ['string', 'null'], maxLength: 64, description: 'sans, serif, mono, an inspected f-prefixed font id, or letters:<set>.'},
  textSize: drawingNumber(6, 512, 'Text size.'), textBold: drawingFlag, textItalic: drawingFlag, textUnderline: drawingFlag,
  lineHeight: drawingNumber(1, 2.5), letterSpacing: drawingNumber(-.2, .6), wordSpacing: drawingNumber(-.2, 1),
  textCase: drawingChoice(['upper', 'lower', 'small']), textKern: drawingFlag,
  textFigures: drawingChoice(['oldstyle', 'lining', 'tabular']), textWrap: drawingChoice(['balance'], 'Balanced label wrapping, or null.'),
  labelWidth: drawingNumber(6, 65536), labelIn: drawingFlag, labelPos: drawingNumber(0, 1), labelBeside: drawingFlag,
  labelAlign: drawingChoice(['start', 'middle', 'end']), labelVAlign: drawingChoice(['top', 'middle', 'bottom']),
  step: {type: ['integer', 'null'], minimum: 1, maximum: 99, description: 'The step number above the label inside a box; null removes it.'},
  opacity: drawingNumber(.05, 1), textEffect: drawingChoice(['pressed', 'garden']),
  textEffectSeed: {type: ['integer', 'null'], minimum: 0, maximum: 2147483647},
  effectFlower: {type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$'}, effectStem: {type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$'},
};
const drawingPoint = {type: 'array', minItems: 2, maxItems: 2, items: {type: 'number', minimum: -65536, maximum: 65536}};
const drawingGeometry = authoredObject({
  ...Object.fromEntries(['cx', 'cy', 'w', 'h', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2'].map(key => [key, drawingNumber(-65536, 65536)])),
  rot: drawingNumber(-65536, 65536), a0: drawingNumber(-65536, 65536), a1: drawingNumber(-65536, 65536),
  inner: drawingNumber(.15, .75), points: {type: ['integer', 'null'], enum: [5, 6, null]},
  p: {type: ['array', 'null'], maxItems: 2048, items: drawingPoint},
});
const drawingProperties = authoredObject({...drawingLook,
  label: {type: ['string', 'null'], maxLength: 4096},
  headStart: drawingChoice(['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar']), headEnd: drawingChoice(['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar']),
  route: drawingChoice(['straight', 'curved', 'elbow', 'auto']), bend: drawingNumber(-65536, 65536),
  curveT: drawingNumber(-65536, 65536), elbow: drawingNumber(0, 1), angle: drawingFlag, len: drawingFlag,
  inner: drawingNumber(.15, .75), corner: {...drawingNumber(0, .5), exclusiveMinimum: 0}, flat: drawingFlag, geom: drawingGeometry,
});
const drawingAnchor = {...authoredObject({to: drawingId, ax: {type: 'number', minimum: 0, maximum: 1}, ay: {type: 'number', minimum: 0, maximum: 1}}, ['to', 'ax', 'ay']), type: ['object', 'null']};
const drawingOperations = {type: 'array', maxItems: 64, description: 'Edits on inspected object ids, applied in order through the same Draw owner as the person. Shapes and operations can be edited while Draw is open. Omitted properties are retained; null removes an optional override.', items: authoredObject({
  type: {type: 'string', enum: ['create', 'move', 'resize', 'rotate', 'set_look', 'set_label', 'set_step', 'connect', 'properties', 'group', 'ungroup', 'lock', 'unlock', 'unlockAll', 'delete', 'front', 'back', 'forward', 'backward', 'duplicate', 'align', 'distribute', 'flip', 'clean', 'unclean'], description: 'The operation.'},
  ...drawingLook, label: {type: 'string', maxLength: 4096, description: 'set_label: the words, or empty to remove them.'},
  ids: {...shapeIds, minItems: 0}, group: described(drawingId, 'group: the new group id.'),
  figures: {type: 'array', minItems: 1, maxItems: 128, items: {type: 'object', additionalProperties: true}, description: 'create: native figures to add, using the same grammar as figures on document.draw.'},
  direction: {type: 'string', enum: ['down', 'across', 'up', 'back'], description: 'create: the automatic layout direction.'},
  dx: {type: 'number', minimum: -65536, maximum: 65536, description: 'move or duplicate: horizontal offset.'}, dy: {type: 'number', minimum: -65536, maximum: 65536, description: 'move or duplicate: vertical offset.'},
  width: {type: 'number', exclusiveMinimum: 0, maximum: 65536, description: 'resize: the selected frame width.'}, height: {type: 'number', exclusiveMinimum: 0, maximum: 65536, description: 'resize: the selected frame height.'},
  anchor: authoredObject({x: {type: 'number', enum: [0, .5, 1]}, y: {type: 'number', enum: [0, .5, 1]}}, ['x', 'y']), local: {type: 'boolean', description: 'resize: use the object frame (default true).'},
  angle: {type: 'number', minimum: -65536, maximum: 65536, description: 'rotate: radians.'}, pivot: described(drawingPoint, 'rotate: [x,y], or omit for the selected frame centre.'),
  start: described(drawingAnchor, 'connect: start anchor; null detaches.'), end: described(drawingAnchor, 'connect: end anchor; null detaches.'),
  properties: described(drawingProperties, 'properties: authored object properties, including its native geometry.'),
  newIds: described({...ids, items: drawingId}, 'duplicate: the ids the copies take; omit for deterministic fresh ids.'),
  alignment: {type: 'string', enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'], description: 'align: the edge or centre.'}, axis: {type: 'string', enum: ['x', 'y'], description: 'distribute or flip: the axis.'},
}, ['type'])};
// Deep figure/shape checks live in draw/core.mjs (_rapierDrawLowerFigures, _rapierDrawApplyShapesPatch, _rapierDrawAdmitRecipe): a bounded container here.
const record = {type: 'object', additionalProperties: true};
const drawFigures = {type: 'array', maxItems: 128, items: record, description: 'Figures use kind, not type. Example: [{"kind":"rect","id":"start","label":"Start"},{"kind":"rect","id":"end","label":"Finish"},{"kind":"arrow","from":"start","to":"end"}]. Omit x, y, w and h for automatic layout. Figures create a new drawing; on an existing or open drawing, send the same figures in shapes.add or shapes.replace. Paint with real brushes: {"kind":"paint","seed":1,"strokes":[{"brush":"rapier/oil","colour":"#2255cc","size":50,"points":[[x,y,pressure],...]}]}. get_context.paint lists every brush and control, including smudge, smear and blend. Size is 0-100; load and water 0-1; angle 0-179 degrees; follow and erase are booleans. Point samples use x and y in drawing units, with optional pressure 0-1. In shapes.replace, a paint figure names the inspected paint layer id and paints into its existing material.'};
const dial = (type, description, extra = {}) => ({type, description, ...extra});
const drawDials = described(object({background: dial(['object', 'null'], 'The canvas background as a recipe carries it, {kind, ...}; send the kind alone to take the person\'s starting values for every number you leave out. null removes it.', {additionalProperties: true}),
  paper: dial(['string', 'null'], 'The canvas colour; null returns it to automatic.', {enum: ['white', 'black', null]}),
  effect: dial(['object', 'null'], 'The copy machine on the whole drawing, {preset} alone is a whole effect. null removes it.', {additionalProperties: true}),
  canvas: described(object({w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['w', 'h']), 'The canvas size in drawing units.'),
  frame: {...object({x: {type: 'number', minimum: -65536, maximum: 65536}, y: {type: 'number', minimum: -65536, maximum: 65536}, w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['x', 'y', 'w', 'h']), type: ['object', 'null'], description: 'The rectangle the picture is saved as; null follows the ink.'},
  light: {type: 'number', description: 'The light direction in radians.'}, smooth: integer(0, 100, 'The pen smoothing.'), nib: integer(2, 24, 'The pen width.')}),
  'The drawing\'s own settings, each replacing the one it names and landing on an open drawing as one Undo step: background, paper, effect, canvas, frame, light, smooth and nib.');
const drawShapesPatch = described(object({set: drawDials, add: {type: 'array', maxItems: 128, items: record, description: 'Figures or shapes to add.'}, replace: {type: 'array', maxItems: 128, items: record, description: 'Complete replacement shapes, each by its id. Copy the inspected shape and change only the intended fields; id and label alone are not a shape. A kind:paint figure with id and strokes paints into that existing paint layer, preserving its material and transform.'}, remove: described({...ids, items: drawingId}, 'The ids to remove.')}), 'A patch to an existing drawing. On a drawing the person has open it lands at once, or the moment their hand leaves the canvas; their own work is kept.');

const svgValueMap = (names, numeric = false) => ({type: 'object', minProperties: 1, maxProperties: 64,
  propertyNames: names ? {enum: names} : {pattern: '^[A-Za-z_][A-Za-z0-9_.:-]*$'},
  additionalProperties: {type: numeric ? ['string', 'number', 'null'] : ['string', 'null'], maxLength: 16384}});
const svgNodeEdits = {type: 'array', minItems: 1, maxItems: 128, description: 'Value edits on the imported SVG nodes disclosed by read_context. Definitions, gradients, clips, transforms, references and untouched source bytes are retained. Unsafe content is refused by field. null removes an optional attribute or style property.', items: authoredObject({
  nodeId: {type: 'string', maxLength: 1024, pattern: '^svg:0(?:\\.[0-9]+)*$', description: 'The inspected structural node id.'},
  text: string(16384, 'Character data of a leaf text, tspan, textPath, title or desc. Markup remains text.'),
  attributes: described(svgValueMap(null), 'SVG attributes by exact name. Use style for CSS; namespaces, event handlers, scripts and external references are refused.'),
  style: described(svgValueMap(['alignment-baseline', 'baseline-shift', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'direction', 'display', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'image-rendering', 'letter-spacing', 'lighting-color', 'marker-start', 'marker-mid', 'marker-end', 'mask', 'opacity', 'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration', 'text-rendering', 'transform', 'transform-box', 'transform-origin', 'unicode-bidi', 'vector-effect', 'visibility', 'white-space', 'word-spacing', 'writing-mode']), 'Inline CSS properties. Fragment URLs refer to definitions in this SVG.'),
  geometry: described(svgValueMap(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height', 'dx', 'dy', 'd', 'points', 'pathLength', 'transform', 'viewBox', 'preserveAspectRatio', 'rotate', 'textLength', 'lengthAdjust', 'startOffset', 'offset', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'gradientTransform', 'patternTransform'], true), 'Geometry supported by the inspected element. Numbers or SVG value strings; paths, point lists and transforms retain SVG syntax.'),
}, ['nodeId'])};
const drawAlt = {...string(240, 'The caption, as the person reads it (required on create). With recipe_handle it can be edited alone.'), minLength: 1};
const page = {next_cursor: nullableRef, complete: flag, remaining: count, omitted: count};
const change = {changeId: nullableRef, editCount: count, transaction: record, structure: record, drawingPatch: record, drawingReceipt: record, receipt: record};
// open is the comparison's remaining-undecided count, distinct from the typed `pending` envelope field: an integer and an object never share a name.
const comparison = {compareId: ref, name: string(512), changes: count, open: count, accepted: count, rejected: count, items: rows(record), remaining: count};
const comparisonVisible = {...flag, description: 'Present only when a local editor confirmed the comparison. Omitted for asynchronous hosted rendering; this is not editor presence. get_context reports presence.'};
// pending: {kind:'surface-fact', requestId, requirements} or {kind:'human-review', proposalId, requirements}.
const pending = {type: ['object', 'null'], properties: {kind: {enum: ['surface-fact', 'human-review']}, requestId: ref, proposalId: ref, requirements: record}, additionalProperties: true};
const posture = {enum: ['free', 'check', 'ask']};
const laws = {enum: ['edit', 'append', 'keep']};
const review = {type: ['object', 'null'], properties: {id: ref, kind: {enum: ['proposal', 'inline', 'check']},
  status: {enum: ['pending', 'approved', 'declined', 'invalidated']}, cause: reviewCause, law: laws, region: count,
  revision: count, expiresAt: count, label: string(120), editCount: count, changeIds: rows(ref),
  changes: rows(object({id: ref, status: string(32), reason: string(128), excerpt: string(80)}, ['id', 'status'])),
  reason: string(128), complete: flag}, additionalProperties: true};
const sourceChanges = object({sinceRevision: {type: ['integer', 'null'], minimum: 0}, throughRevision: count, complete: flag,
  retainedChanges: count, omitted: count, reason: {enum: ['first_observation', 'retained_history_limited']},
  changes: rows(object({changeId: ref, revision: count, actor: {enum: ['agent', 'human']}, agent: string(64), yours: flag,
    operation: string(64), label: string(96), insertedChars: count, removedChars: count,
    targets: rows(object({ref, chars: count}, ['ref', 'chars']))}, ['changeId', 'revision', 'actor', 'yours', 'targets']))},
  ['sinceRevision', 'throughRevision', 'complete', 'changes']);
const returnedPage = object({return_id: ref, name: string(256), receivedAt: string(64), bytes: count, chars: count},
  ['return_id', 'receivedAt', 'bytes', 'chars']);
const exportedFile = {filename: string(MAX_FILENAME_CHARS), mimeType: string(64), bytes: count, limitBytes: count, exportId: ref, exportExpiresAt: string(64)};
const noteReminder = {...object({at: integer(1, 8640000000000000, 'The first occurrence, in Unix milliseconds.'),
  repeat: {type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom']},
  every: integer(1, 2147483647, 'custom: the interval.'), unit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']},
  snoozeMinutes: integer(1, 2147483647, 'The snooze interval in minutes.')}, ['at']), type: ['object', 'null'],
  description: 'An app reminder, or null to remove it. The receipt names the app; the device manages delivery.'};
const noteFields = {pinned: flag, colour: {type: 'string', enum: ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown']},
  section: string(48, 'A custom section name, created if needed; empty clears the assignment. Skills stays the person\'s choice.'),
  tags: {type: 'array', items: string(128), maxItems: 64, description: 'Replaces the note\'s front-matter tags; an empty list clears them.'},
  archived: flag, trashed: flag, reminder: noteReminder};
const reviewDecision = object({reviewId: ref, changeId: ref, decision: {enum: ['kept', 'dropped']},
  kind: {enum: ['proposal', 'inline', 'check']}, revision: count, at: count, operation: string(64),
  removed: string(160), inserted: string(160), removedChars: count, insertedChars: count},
  ['reviewId', 'changeId', 'decision', 'kind', 'revision', 'at', 'operation', 'removed', 'inserted', 'removedChars', 'insertedChars']);
const continuation = object({
  person: object({kept: rows(reviewDecision), dropped: rows(reviewDecision), decisionsComplete: flag, omittedDecisions: count,
    intents: rows(object({region: count, law: laws, start: count, end: count, text: string(512)}, ['region', 'law', 'start', 'end', 'text'])),
    intentsComplete: flag, omittedIntents: count}, ['kept', 'dropped', 'decisionsComplete', 'omittedDecisions', 'intents', 'intentsComplete', 'omittedIntents']),
  agent: object({reviewId: nullableRef, kind: {enum: ['proposal', 'inline', 'check']}, cause: reviewCause,
    pendingChangeIds: rows(ref), inDocument: flag, complete: flag, omitted: count}, ['reviewId', 'pendingChangeIds', 'inDocument', 'complete', 'omitted']),
}, ['person', 'agent']);
const resultProperties = {
  'rapier.guide': {instructions: {type: 'string'}},
  'rapier.open': {created: flag, replayed: flag, message: string(256), editor_url: string(256)},
  'document.pair_browser': {paired: flag},
  'document.pair_status': {pairingCode: string(8), paired: flag, codeExpiresAt: string(64)},
  'document.get_context': {surface: object({kind: {enum: ['editor', 'headless']}, next: {enum: ['continue', 'deliver_page']}}, ['kind', 'next']),
    editing: object({mode: {enum: ['read_only', 'review_pending', 'review_required', 'blocked', 'inspect']},
      reason: {enum: ['document_read_only', 'will', 'ask', 'check', 'proposal', 'document_law', 'review_history_unavailable', 'inspect_target']}}, ['mode', 'reason']),
    returns: rows(returnedPage), returnWaiting: flag, filename: string(MAX_FILENAME_CHARS), docKind: kinds, chars: count, readOnly: flag, posture, notes: record, history: record,
    law: object({default: laws, regions: count, laws: rows(laws), faults: rows(object({mode: string(64), line: count, start: count, end: count})), faultCount: count}, ['default', 'regions', 'laws']),
    compare: {type: 'object', properties: comparison, additionalProperties: true},
    collaboration: object({posture, readOnly: flag, presence: {type: ['object', 'null'], additionalProperties: true}, review}, ['posture', 'readOnly', 'presence', 'review']),
    sourceChanges, continuation, brief: object({source: {const: 'document'}, authority: {const: false}, text: string(2048), start: count, end: count, sectionEnd: count, complete: flag,
      remaining: count, reason: string(64), omissions: rows(record)}, ['source', 'authority', 'text', 'start', 'end', 'sectionEnd', 'complete', 'remaining']),
    layout: record, images: record, paint: record, drawing: record, comments: object({total: count, open: count, stale: count, reason: string(64)}, ['total', 'open', 'stale'])},
  'document.get_outline': {...page, engine: {type: ['string', 'null']}, total: count, items: rows({type: 'object', properties: {ref: nullableRef, kind: string(64), depth: count, label: string(192), chars: count, layout: record}, additionalProperties: true}), pending},
  'document.read_context': {...page, sha256: string(64), return_id: ref, name: string(256), receivedAt: string(64), text: string(12288), start: count, end: count, handle: nullableRef, recipe_handle: nullableRef, drawing: record, complete_handle: ref, comment_handle: ref, coverage: record, expires_in_ms: count, omissions: rows(record), layout: record, images: record, change_id: ref, status: string(32), removed: string(4096), inserted: string(4096), removed_chars: count, inserted_chars: count},
  'document.find': {...page, matches: rows({type: 'object', properties: {matched: string(12288), handle: nullableRef, snippet: string(192), section_ref: ref, section: string(192), start: count, end: count, handle_scope: {type: 'string', enum: ['matched', 'change']}}, additionalProperties: true}), pending},
  'document.inspect_visual': {representation: {type: 'string', enum: ['source', 'visual']}, observation: record, drawing: record, pending},
  'document.visual_ack': {representation: {type: 'string', enum: ['source', 'visual']}},
  'document.list_comments': {...page, threads: rows(record), thread: record, messages: rows(record), total: count},
  'document.comment': {...change, threadId: ref, messageId: ref, pending},
  'document.apply_edits': {...change, pending},
  'document.propose': {page: string(8192), sha256: string(64), baseRevision: string(256), reviewId: ref, ...exportedFile},
  'document.propose_edits': {...change, review: record, pending},
  'document.undo_agent_change': {...change, replaced: ref, asset: record},
  'document.open_text': {...change, filename: string(MAX_FILENAME_CHARS), docKind: kinds},
  'document.show_changes': {...comparison, changeId: ref, visible: comparisonVisible, review_only: flag},
  'document.compare': {...comparison, visible: comparisonVisible, ...change, decided: count, closed: flag},
  'document.reveal': {revealed: flag},
  'document.wait_for_user': {text: string(1500), selection: record, truncated: flag, returned: record},
  'document.create_return': {return_url: string(512), return_id: ref, return_expires_at: string(64), max_bytes: count},
  'document.export': {format: {enum: ['markdown', 'html']}, ...exportedFile},
  'document.save': {saved: flag, verified: flag, filename: string(MAX_FILENAME_CHARS)},
  'document.draw': {...change, asset: record, width: count, height: count, removed: flag, recipe_handle: nullableRef, svg_handle: nullableRef},
  'document.rotate_capability': {rotated: flag, rotations: count, rotatedAt: string(64), sealed: string(512)},
  'notes.list': {...page, availability: {enum: ['available', 'locked', 'unavailable']}, notes: rows({type: 'object', properties: {file: string(256), title: string(192), section: string(64), modified: count}, additionalProperties: true})},
  'notes.propose': {availability: {enum: ['available', 'locked', 'unavailable']}, file: {...string(256), type: ['string', 'null']}, applied: flag},
  'notes.read': {...page, availability: {enum: ['available', 'locked', 'unavailable']}, found: flag, file: string(256), version: count, text: {...string(12288), type: ['string', 'null']}, start: count, end: count},
  'notes.set': {availability: {enum: ['available', 'locked', 'unavailable']}, file: string(256), changed: record, previous: record, reminder: object({device: {const: 'app'}, saved: flag, delivery: {const: 'device_managed'}})},
  'notes.history': {...page, availability: {enum: ['available', 'locked', 'unavailable']}, file: string(256), found: flag,
    versions: rows(object({version: count, time: count, reason: string(64), size: count, current: flag})), tidied: count, tidiedAt: {type: ['integer', 'null'], minimum: 0}},
  'notes.sync': {availability: {enum: ['available', 'locked', 'unavailable']}, action: {const: 'now'}, synced: flag, complete: flag, unchanged: flag, skipped: count, missing: count, backedUpAt: {type: ['integer', 'null'], minimum: 0}},
};
// Shared admission and durable acknowledgement paths precede each tool's own result paths.
const hostFailures = ['refused', 'uncertain'];
const kernelFailures = ['invalid', ...hostFailures];
const invocationFailures = [...kernelFailures, 'replayed'];
const outcomes = {
  'rapier.guide': ['ok'],
  'rapier.open': ['created', 'current', ...hostFailures],
  'document.inspect_visual': ['ok', 'pending', ...kernelFailures],
  'document.list_comments': ['ok', 'target_gone', 'conflict', ...kernelFailures],
  'document.comment': ['applied', 'unchanged', 'target_gone', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.get_context': ['ok', 'conflict', ...kernelFailures],
  'document.get_outline': ['ok', 'pending', 'target_gone', 'conflict', 'yielded', ...kernelFailures],
  'document.read_context': ['ok', 'target_gone', 'conflict', 'yielded', ...kernelFailures],
  'document.find': ['ok', 'pending', 'target_gone', 'conflict', 'yielded', ...kernelFailures],
  'document.apply_edits': ['applied', 'rebased', 'unchanged', 'target_gone', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.propose': ['ok', 'target_gone', 'conflict', 'pending', ...invocationFailures],
  'document.propose_edits': ['unchanged', 'target_gone', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.undo_agent_change': ['applied', 'unchanged', 'target_gone', 'conflict', 'yielded', ...invocationFailures],
  'document.show_changes': ['ok', 'target_gone', 'conflict', ...invocationFailures],
  'document.compare': ['ok', 'applied', 'unchanged', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.open_text': ['applied', 'unchanged', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.reveal': ['ok', 'target_gone', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'document.create_return': ['ok', ...invocationFailures],
  'document.wait_for_user': ['ok', 'message', 'selection', 'timeout', 'document_replaced', ...invocationFailures],
  'document.save': ['ok', 'saved', 'unchanged', 'conflict', 'cancelled', 'unacknowledged', 'failed', ...invocationFailures],
  'document.export': ['ok', 'pending', ...invocationFailures],
  'document.draw': ['applied', 'rebased', 'unchanged', 'target_gone', 'conflict', 'yielded', 'pending', ...invocationFailures],
  'notes.list': ['ok', 'target_gone', 'conflict', ...kernelFailures],
  'notes.read': ['ok', 'target_gone', 'conflict', ...kernelFailures],
  'notes.propose': ['ok', ...invocationFailures],
  'notes.set': ['ok', 'conflict', ...invocationFailures],
  'notes.history': ['ok', 'target_gone', 'conflict', ...kernelFailures],
  'notes.sync': ['ok', ...invocationFailures],
  'document.sync': ['current', ...hostFailures],
  'document.commit': ['committed', ...hostFailures],
  'document.compare_decide': ['ok', 'applied', 'unchanged', 'conflict', 'yielded', ...invocationFailures],
  'document.human_context': ['ok', 'invalid', 'conflict', ...hostFailures],
  'document.set_policy': ['ok', 'invalid', ...hostFailures],
  'document.review_decide': ['ok', 'applied', 'rebased', 'unchanged', 'target_gone', 'conflict', 'pending', ...invocationFailures],
  'document.visual_ack': ['ok', ...hostFailures],
  'document.view_ack': ['ok', ...hostFailures],
  'document.rotate_capability': ['rotated', ...hostFailures],
  'document.pair_browser': ['paired', ...hostFailures],
  'document.pair_status': ['waiting', 'paired', ...hostFailures],
  'document.delete': ['deleted', ...hostFailures],
};
// Classes describe maximum effects; they do not grant authority or replace protocol permission hints.
const EFFECT_CLASSES = Object.freeze({read: 'read', view: 'write', write: 'write', create: 'write', durable: 'sensitive-write', destructive: 'sensitive-write'});
const tool = (name, title, description, effect, inputSchema = object()) => {
  if (!Object.hasOwn(EFFECT_CLASSES, effect)) throw new Error('Undeclared tool effect');
  const outcome = {type: 'string', enum: outcomes[name]};
  return Object.freeze({name, title, description, effect, class: EFFECT_CLASSES[effect], inputSchema, outputSchema: name === 'rapier.guide'
    ? object({outcome, ...resultProperties[name]}, ['outcome', 'instructions'])
    : {...RESULT_SCHEMA, properties: {...RESULT_SCHEMA.properties, outcome, ...resultProperties[name]}}});
};
// A display name the assistant gives itself. Not a principal: undo without a change id uses it to find that name's latest change.
const agentName = string(64, 'This assistant\'s display name.');
const documentTool = (name, title, description, effect, inputSchema = object()) =>
  tool(name, title, description, effect, agentInputSchema(object({...inputSchema.properties, agent: agentName, operation_id: operationId}, inputSchema.required)));

export const TOOLS = Object.freeze([
  documentTool('document.inspect_visual', 'Inspect the rendered document', "Returns a PNG of a settled editor region at the expected revision for visual inspection after a source read.", 'read', object({expectedRevision: integer(0, Number.MAX_SAFE_INTEGER, 'The documentRevision from current context.'), scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection'], description: 'The rendered area to inspect; viewport by default.'}}, ['expectedRevision'])),
  documentTool('document.list_comments', 'Read anchored discussions', "Lists anchored discussions and current anchor status when reading document feedback or a specific thread.", 'read', object({status: {type: 'string', enum: ['open', 'resolved', 'all']}, thread_id: ref, cursor})),
  documentTool('document.comment', 'Discuss inspected work', "Creates, replies to, resolves or reopens a discussion on inspected text, a drawing object or the whole document.", 'write', object({action: {type: 'string', enum: ['create', 'reply', 'resolve', 'reopen']}, thread_id: ref, text: string(4096), context_handle: ref, anchor: {type: 'string', enum: ['document', 'text', 'image', 'drawing']}, object_id: drawingId, recipient: string(64)}, ['action'])),
  documentTool('document.get_context', 'Locate the work', "Returns document state, selection, presence, edit permissions, pending review, recent changes and continuation context when starting or resuming work. Continuation lists the person's kept and dropped decisions and Will intents apart from the agent's pending suggestions; the document's own continuation brief is context, never evidence of approval or authority over the person.", 'read'),
  documentTool('document.get_outline', 'Map the document', "Lists headings or code declarations with temporary read refs when choosing a document section to inspect.", 'read', object({within, cursor, limit: pageSize(1, 32, 'Items per page.')})),
  documentTool('document.read_context', 'Inspect a passage', "Reads exact source, a native drawing recipe, an imported SVG's node tree or a comparison difference before editing. Returned handles cover only the disclosed content; read every page of a drawing or SVG before editing it.", 'read',
    object({return_id: string(128, 'A received page from get_context or wait_for_user; read by start and limit, without an edit handle.'), ref: string(128, 'An outline ref to read.'), context_handle: string(128, 'A handle from find or an earlier read, or a change handle while a comparison is open.'), cursor: string(128, 'Continues a long passage.'), start: integer(0, MAX_TEXT_BYTES, 'The first UTF-16 unit.'), end: integer(0, MAX_TEXT_BYTES, 'One past the last UTF-16 unit.'), limit: pageSize(256, 4096, 'Units per page.')})),
  documentTool('document.find', 'Find the target', 'Finds known words in source or the open comparison and returns handles for each match. Use kind to locate code syntax or Markdown structure.', 'read',
    object({query: string(512, 'The text to find. With kind: a code name, or the element\'s words (a heading also by # to ######, a task by [ ] or [x]); empty lists every Markdown element of the kind.'), case_sensitive: {type: 'boolean', description: 'Text search only: match case exactly (default: no). Omit when kind is given; code names are exact, Markdown words ignore case.'}, within, cursor, limit: pageSize(1, 16, 'Matches per page.'), kind: {type: 'string', enum: [...FIND_KINDS.code, ...FIND_KINDS.markdown], description: 'Code syntax or Markdown structure to match instead of text; fence matches a language, link a href, image an alt or label.'}}, ['query'])),
  documentTool('document.apply_edits', 'Edit inspected text', "Applies a batch of changes to inspected passages when revising text. A pending outcome leaves the batch unapplied. A Mermaid flowchart is a mermaid fence written into the Markdown source here; Rapier renders it and keeps it as text.", 'write', editBatch),
  documentTool('document.propose', 'Propose a document', "Stages a complete document alternative against an inspected base and creates an offline page for reviewing it. Workspace source changes only after approval.", 'create',
    object({context_handle: ref, revision: integer(0, Number.MAX_SAFE_INTEGER), sha256: {...string(64), pattern: '^[a-f0-9]{64}$'}, text,
      by: {...string(96, 'The proposal author\'s display name.'), minLength: 1}}, ['text', 'by'])),
  documentTool('document.propose_edits', 'Propose inspected edits', "Stages changes to inspected passages for the person to approve or decline before application.", 'view', editBatch),
  documentTool('document.undo_agent_change', 'Undo your change', "Reverses a selected agent change, or the latest change under the supplied agent name, while preserving later human work.", 'write', object({change_id: string(128, 'The changeId to reverse; absent selects the latest change under this call\'s agent name.')})),
  documentTool('document.show_changes', 'Inspect your changes', "Replaces the open comparison with an applied agent revision's diff for inspection, without changing document text or review decisions.", 'view', object({change_id: string(128, 'The changeId to show (default: your latest).')})),
  documentTool('document.compare', 'Compare a complete alternative', "Opens a full-document comparison, accepts or rejects inspected differences, or closes the comparison when reviewing an alternative. Accepted differences change source.", 'view',
    object({action: {type: 'string', enum: ['open', 'accept', 'reject', 'close'], description: 'open (default), accept, reject or close.'}, text: string(MAX_TEXT_BYTES, 'open: the whole alternative document.'), name: string(256, 'open: a name for the comparison.'), change_ids: described(ids, 'accept or reject: the differences; none means every remaining one.')})),
  documentTool('document.open_text', 'Replace the working document', "Replaces the working document with supplied text when starting a different document here. Existing handles and comparisons are retired.", 'destructive', object({text: string(MAX_TEXT_BYTES, 'The whole new document.'), filename: string(MAX_FILENAME_CHARS, 'Its name; the extension sets the kind.'), docKind: kinds}, ['text'])),
  documentTool('document.reveal', 'Show an inspected passage', "Requests presentation of an inspected passage or difference in the connected editor when the person needs to see it.", 'view', object({context_handle: string(128, 'The handle of the passage or difference to show.')}, ['context_handle'])),
  documentTool('document.create_return', 'Create a page return', "Creates a return receipt and address for an edited offline page. With a connected host the person confirms the upload in their connected browser; without one the address is its own one-use grant. It accepts one submission within 24 hours and before workspace expiry.", 'create'),
  documentTool('document.wait_for_user', 'Receive the person’s reply', "Waits for the person's next selection, message or returned page when their response is needed, up to timeout_ms.", 'view', object({mode: {type: 'string', enum: ['selection', 'message'], description: 'What to wait for: a selection or a message.'}, after_return_id: string(128, 'Message mode: wait after this received return; absent, the latest retained return answers immediately.'), timeout_ms: integer(1000, 120000, 'How long to wait, in milliseconds.')})),
  documentTool('document.save', 'Save the document', "Saves to the person's chosen local destination, or confirms durable hosted storage, when keeping work. The receipt reports verification.", 'durable'),
  documentTool('document.export', 'Export the document', "Creates a file link for exact Markdown or an offline Rapier page, up to 8 MiB. With a connected host the link needs its connection; without one the link is its own grant. The stored file lasts up to 24 hours within the workspace lifetime.", 'create',
    object({format: {type: 'string', enum: ['markdown', 'html'], description: 'markdown or html.'}, review_id: string(128, 'A pending review to show in an html review page beside the original source; it is not applied or approved.')}, ['format'])),
  // The short contract an agent reads each call (one registry). The exhaustive recipe/shape contract is the admitting code (draw/core.mjs
  // _rapierDrawAdmitRecipe, _rapierDrawLowerFigures); never copy it into prose here. A refused figure names its field.
  documentTool('document.draw', 'Draw a picture', "Creates or edits a native SVG drawing in the active document: movable, editable figures, a spatial sketch or a brush painting. Separate from Mermaid: a Mermaid flowchart is a fence in the Markdown source, inserted with document.apply_edits and rendered in the document. A drawing's recipe also carries its paper, background with every number its kind has, copier effect, light, letters and embedded fonts: read the drawing and send the whole recipe back with recipe_handle to change them; while the person has that drawing open, shapes patches and operations are admitted. An imported SVG without a Rapier recipe is edited node by node: read it for its node tree, then send svg_handle with svgNodeEdits.",
    'write', object({recipe: described(record, 'A complete inspected drawing recipe. With recipe_handle it replaces canvas, paper, strokes and fonts. Redacted paint raster markers retain their original ids. Exclusive with shapes and figures.'), figures: drawFigures, direction: {type: 'string', enum: ['down', 'across', 'up', 'back'], description: 'The direction of automatic figure layout on create or shapes.add; down by default.'}, shapes: drawShapesPatch, operations: drawingOperations, recipe_handle: string(128, 'Edit: the handle from reading the drawing.'), svg_handle: string(128, 'Edit an imported SVG: the handle from its completed node-tree read. Use with svgNodeEdits, without recipe, figures, shapes or operations.'), svgNodeEdits, context_handle: string(128, 'Create: the block preceding the new drawing.'), alt: drawAlt, label: string(120, 'A short name the person sees for this change.')})),
  documentTool('notes.list', 'List notes', 'Lists or searches Notes with Skills first. query uses the library search: words, quoted phrases, tag:, in:, is:, has:, colour:, before: and after:. Trash appears only when requested by the query. A changed catalogue refuses a continuation with notes_changed. An absent store returns notes_not_configured; a locked encrypted store returns notes_locked.', 'read', object({query: string(2048, 'The library search. A continuation keeps its original query; omit it or send the same value.'), cursor, limit: pageSize(1, 64, 'Notes per page.')})),
  documentTool('notes.read', 'Read a note', 'Reads one note\'s exact text by file, including a note in Trash. version selects a retained event from notes.history; omit it for the current text. A changed note refuses a continuation with notes_changed. Reading a past version does not authorize replacing the current note.', 'read', object({file: string(256, 'The note\'s file from notes.list.'), version: integer(1, Number.MAX_SAFE_INTEGER, 'A version from notes.history.'), cursor, start: integer(0, MAX_TEXT_BYTES, 'The first UTF-16 unit.'), limit: pageSize(256, 12288, 'Units per page.')}, ['file'])),
  documentTool('notes.set', 'Set note controls', 'Changes only the supplied note controls. Returns changed values and their exact previous values. Archive and Trash are reversible through the same tool; no permanent deletion. Tags stay in the Markdown front matter; a tag change is refused with notes_open while the person has the note open. Reminders are app-only and named in the receipt. Skills stays the person\'s choice.', 'write', object({file: string(256, 'The note\'s file from notes.list.'), ...noteFields}, ['file'])),
  documentTool('notes.history', 'Read note history', 'Lists the note\'s retained versions, newest first, without changing the note. Read a version with notes.read. A changed history refuses the continuation with notes_changed.', 'read', object({file: string(256, 'The note\'s current file.'), cursor, limit: pageSize(1, 64, 'Versions per page.')}, ['file'])),
  documentTool('notes.sync', 'Sync notes now', 'Runs the Notes sync the person has already configured and returns its outcome. A locked vault, missing connection or required sign-in is reported without opening setup or asking for credentials.', 'write', object({action: {type: 'string', enum: ['now']}}, ['action'])),
  documentTool('notes.propose', 'Propose a note', "Creates a note or replaces a fully inspected, unchanged note, retaining its previous text in History. Unread, changed or open notes receive proposals for review.", 'write', object({text: string(MAX_TEXT_BYTES, 'The note\'s Markdown.'), title: string(200, 'A title for a new note.'), of: string(256, 'The listed note this changes.')}, ['text'])),
]);

// The editor key: minted into the editor page, never a tool result; the host keeps it out of model context. Editor-only operations require it.
const editorKey = string(512, 'The editor key from the Apps UI resource, held by the host and editor alone.');
const revision = integer(0, Number.MAX_SAFE_INTEGER);
const sourceRange = {...object({start: integer(0, MAX_TEXT_BYTES), end: integer(0, MAX_TEXT_BYTES)}, ['start', 'end']), type: ['object', 'null']};
const hostFile = object({name: {...string(256, 'The opened filename, without a path.'), minLength: 1}, resourceUri: {...string(8192, 'Opaque host resource URI. Only the editor reads it through the host bridge.'), minLength: 1}}, ['name', 'resourceUri']);
const visualFact = object({documentId: string(256), revision, scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection']}, drawing: record, outcome: {type: 'string', enum: ['ok', 'refused']}, reason: string(128), sourceRange,
  image: object({mimeType: {const: 'image/png', type: 'string'}, data: string(Math.ceil(VISUAL_LIMITS.imageBytes / 3) * 4), width: integer(1, VISUAL_LIMITS.edge), height: integer(1, VISUAL_LIMITS.edge)}, ['mimeType', 'data', 'width', 'height'])}, ['documentId', 'revision', 'scope', 'outcome']);
export const HOST_TOOLS = Object.freeze([
  tool('rapier.guide', 'How to use Rapier', "Returns Rapier's usage guide and workflows when host instructions are unavailable.", 'read', agentInputSchema(object())),
  tool('rapier.open', 'Rapier editor', "Creates an editable workspace from text or a host file, or resumes one by its document value. Returns editor_url, the live workspace in a browser. It makes two kinds of diagram: native SVG drawings (document.draw) and Mermaid flowcharts as fences in the source (document.apply_edits). Workspaces expire after 30 idle days.", 'create', agentInputSchema(object({document, file: hostFile, text: string(MAX_TEXT_BYTES, 'Create: the document\'s text.'), filename: string(MAX_FILENAME_CHARS, 'Its name; the extension sets the kind.'), docKind: kinds, createToken: {...string(128, 'An optional retry name for this creation: an unchanged retry reopens the same workspace. With a connected host it is scoped to the connection; without one it is a secret of 22 or more random URL-safe characters.'), minLength: 1, pattern: '^[A-Za-z0-9_-]+$'}}))),
  {...tool('document.sync', 'Refresh the editor', "Returns the editor's workspace snapshot when refreshing state, or unchanged while afterRevision and afterVersion still hold.", 'read', object({document, editorKey, afterRevision: integer(0, Number.MAX_SAFE_INTEGER), afterVersion: integer(0, Number.MAX_SAFE_INTEGER)}, ['document', 'editorKey'])), visibility: ['app']},
  {...tool('document.commit', 'Save the person’s edits', "Commits the editor's source edits from its acknowledged revision, rebasing over concurrent changes while preserving both authors' insertions.", 'write', object({document, editorKey, expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), text,
    splices: described({...rows(object({pos: integer(0, MAX_TEXT_BYTES), removed: text, inserted: text}, ['pos', 'removed', 'inserted'])), maxItems: 32000}, 'Exact sequential local journal from the acknowledged source to text; at most the retained 500 records of 64 splices.'),
    filename: string(MAX_FILENAME_CHARS), docKind: kinds, commitId: string(128)}, ['document', 'editorKey', 'expectedRevision', 'text', 'commitId'])), visibility: ['app']},
  {...tool('document.compare_decide', 'Decide a comparison', "Applies the person's comparison decision when its comparison, document revision and workspace version still match.", 'destructive', object({document, editorKey, expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), expectedVersion: integer(0, Number.MAX_SAFE_INTEGER), compareId: ref, action: {type: 'string', enum: ['accept', 'reject', 'close']}, changeIds: ids, decisionId: string(128)}, ['document', 'editorKey', 'expectedRevision', 'expectedVersion', 'compareId', 'action', 'decisionId'])), visibility: ['app']},
  {...tool('document.human_context', 'Update the person’s context', "Updates the editor's selection, focus, settled drawing and editing lease for one document revision.", 'view', object({document, editorKey, expectedRevision: revision, contextId: ref, sequence: revision, visible: flag, editing: flag, selection: sourceRange, focus: sourceRange, drawing: {type: ['object', 'null'], additionalProperties: true}}, ['document', 'editorKey', 'expectedRevision', 'contextId', 'sequence', 'visible', 'editing'])), visibility: ['app']},
  {...tool('document.set_policy', 'Set collaboration controls', "Changes the workspace's collaboration permissions to the person's selected posture (FREE, CHECK or ASK) or read-only setting, or shares a connected workspace with agents again after Disconnect agents.", 'destructive', object({document, editorKey, expectedRevision: revision, expectedVersion: revision, posture: {type: 'string', enum: ['free', 'check', 'ask']}, readOnly: flag, agentAccess: {type: 'boolean', description: 'true shares a disconnected connected workspace with agents again.'}, decisionId: ref}, ['document', 'editorKey', 'expectedRevision', 'expectedVersion', 'decisionId'])), visibility: ['app']},
  {...tool('document.review_decide', 'Decide the exact review', "Records the person's decision on an exact pending review. Approve applies remaining selected edits or acknowledges the work CHECK showed; apply and drop decide selected changes while keeping the review open.", 'destructive', object({document, editorKey, expectedRevision: revision, expectedVersion: revision, reviewId: ref, action: {type: 'string', enum: ['approve', 'decline', 'apply', 'drop']}, changeIds: {...ids, description: 'Pending change ids: apply and drop act on them; approve keeps them and drops the rest; decline takes none.'}, decisionId: ref}, ['document', 'editorKey', 'expectedRevision', 'expectedVersion', 'reviewId', 'action', 'decisionId'])), visibility: ['app']},
  {...tool('document.visual_ack', 'Return a visual observation', "Supplies the editor's rendered observation for an exact pending visual request.", 'view', object({document, editorKey, expectedRevision: revision, visualId: ref, fact: visualFact}, ['document', 'editorKey', 'expectedRevision', 'visualId', 'fact'])), visibility: ['app']},
  {...tool('document.view_ack', 'Acknowledge editor presentation', "Records whether the editor presented or refused a requested passage or difference.", 'view', object({document, editorKey, expectedRevision: revision, viewId: ref, status: {type: 'string', enum: ['presented', 'refused']}, reason: string(160)}, ['document', 'editorKey', 'expectedRevision', 'viewId', 'status'])), visibility: ['app']},
  {...tool('document.rotate_capability', 'Disconnect agents', "Revokes existing agent access to the workspace when the person disconnects agents, preserving its content, history and collaboration controls. The replacement document value returns sealed to the editor, which shares it again when the person chooses; every paired browser but the one asking is unpaired.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
  tool('document.pair_browser', 'Pair a browser', "Connects the browser showing this four-letter code to this one workspace for a day, when the person gives you the code from the page at editor_url. One use; a code lasts one minute.", 'destructive', object({document, code: {...string(4, 'The four letters the page shows.'), pattern: '^[A-Za-z]{4}$'}}, ['document', 'code'])),
  {...tool('document.pair_status', 'Show the pairing code', "Returns the pairing code the paired editor page shows, and whether an agent confirmed it.", 'view', object({document}, ['document'])), visibility: ['app']},
  {...tool('document.delete', 'Delete this workspace', "Permanently deletes the workspace and its history when the person chooses Delete in the editor.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
]);

export const getTool = name => TOOLS.find(entry => entry.name === name) || HOST_TOOLS.find(entry => entry.name === name);
// Page and embed adapters expose the public guide beside the document kernel's tools.
// The page's own Share and Export make the files document.export hands over, so the page does not register it.
export const PAGE_TOOLS = Object.freeze([...TOOLS.filter(entry => entry.name !== 'document.export'), getTool('rapier.guide')]);

export function annotations(effect, host = 'mcp', name = '') {
  if (!Object.hasOwn(EFFECT_CLASSES, effect)) throw new Error('Undeclared tool effect');
  if (host === 'webmcp') return {readOnlyHint: effect === 'read', untrustedContentHint: true, consequentialHint: ['durable', 'destructive'].includes(effect)};
  return {readOnlyHint: effect === 'read', destructiveHint: ['write', 'durable', 'destructive'].includes(effect) || ['document.compare', 'document.show_changes'].includes(name), idempotentHint: effect === 'read', openWorldHint: false};
}

// The mark a host shows beside Rapier (the ChatGPT extensions' icon guidelines: an SVG, monochrome in currentColor, 20 px, 1.33 px strokes):
// the typewriter r of icon-192.png. The same list serves as the server's icons and rapier.open's.
export const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 6h3v8M5.5 14h6M8.5 9.5C8.5 7.3 10 6 12.3 6h2.2v1.5"/></svg>';
export const ICONS = Object.freeze([{src: 'data:image/svg+xml;base64,' + btoa(MARK), mimeType: 'image/svg+xml', sizes: ['any']}]);

// The one MCP descriptor projection. Without `uiResource`, rapier.open carries no _meta.ui resourceUri/visibility; with it, both, and the host's two
// static entrypoints (openai/mcp-extensions, "MCP App Entrypoints"): Rapier in the sidebar and as a tab in every thread, each opening the editor on a
// blank workspace. Host files use an opaque resource bridge; the server never fetches the URI. tools/build.mjs calls this for the public manifest and
// proves agreement with the worker. Every document tool takes its owner-scoped handle and optional retry name.
export function mcpDescriptors({ uiResource, auth = 'anonymous' } = {}) {
  if (!['anonymous', 'oauth', 'server-bearer'].includes(auth)) throw new TypeError('Unknown MCP authentication profile');
  return [...TOOLS.map(entry => ({...entry, inputSchema: agentInputSchema(object({document, operation_id: operationId, ...(['document.comment', 'document.read_context'].includes(entry.name) ? {editorKey} : {}), ...entry.inputSchema.properties}, ['document', ...entry.inputSchema.required]))})), ...HOST_TOOLS].map(entry => {
    const {effect, class: toolClass, visibility, ...descriptor} = entry;
    // The local server verifies its transport bearer before dispatch; it has no connector OAuth flow. /mcp is called
    // without one by the hosts that list it; /muse requires the connection.
    const security = auth === 'server-bearer' ? {} : auth === 'anonymous' ? {securitySchemes: [{type: 'noauth'}]} : {securitySchemes: entry.name === 'rapier.guide' ? [{type: 'noauth'}]
      : [{type: 'oauth2', scopes: effect === 'read' ? ['rapier:read'] : ['rapier:read', 'rapier:write']}]};
    // UI access matches the standard visibility (model + app by default). The editor still proves its authority with its key.
    // Completion says a reply arrived, never that a refused edit was applied or an unverified save succeeded.
    const base = {...descriptor, ...(entry.name === 'rapier.open' ? {icons: ICONS} : {}), annotations: {title: entry.title, ...annotations(effect, 'mcp', entry.name)}, ...security, _meta: {
      ...security,
      'website.rapier/tool-class': toolClass,
      ...(visibility ? {ui: {visibility}} : {}), 'openai/widgetAccessible': (visibility || ['model', 'app']).includes('app'),
      'openai/toolInvocation/invoking': entry.name === 'rapier.open' ? 'Opening Rapier.' : 'Working in Rapier.',
      'openai/toolInvocation/invoked': 'Rapier has replied.',
    }};
    if (entry.name !== 'rapier.open' || !uiResource) return base;
    return {...base, _meta: {...base._meta, ui: {...base._meta?.ui, resourceUri: uiResource, visibility: ['model', 'app']}, 'openai/outputTemplate': uiResource,
      'openai/ui': {entrypoints: [{type: 'global'}, {type: 'thread'}, {type: 'file', extensions: ['.md', '.markdown', '.txt']}]}}};
  });
}

export { validateInput };
