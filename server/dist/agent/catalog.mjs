import { validateInput, agentInputSchema } from './validate-input.mjs';
import { VERSION } from '../version.mjs';
import { VISUAL_LIMITS } from './visual.mjs';
import { FIND_KINDS } from './structure-request.mjs';
import {PREFERENCE_DEFINITIONS} from '../shell/preferences.mjs';
import {EDITOR_LIMITS, EDITOR_ACTIONS, EDITOR_PLUGINS, EDITOR_COPY_FORMATS, PREFERENCE_SCHEMAS} from './editor.mjs';

export const GUIDE_TOPICS = Object.freeze(['overview', 'contracts', 'source', 'comparison', 'drawing', 'paint', 'svg', 'notes', 'device', 'delivery']);
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
const act_id = string(256);
const operationId = {...string(128, 'Stable retry identity; see guide topic contracts.'), minLength: 1};
const turn_id = {...string(160, 'Stable turn identity shared by related acts; separate from label.'), minLength: 1, pattern: '\\S'};
const integer = (minimum, maximum, description) => ({type: 'integer', minimum, maximum, ...(description ? {description} : {})});
const pageSize = (minimum, maximum, description) => integer(minimum, Number.MAX_SAFE_INTEGER, description + ' Clamped to ' + maximum + '.');
const object = (properties = {}, required = []) => ({type: 'object', properties, required, additionalProperties: false});
// A nested presence check declares its own field for strict JSON Schema readers.
const present = key => ({properties: {[key]: {}}, required: [key]});
const authoredObject = (properties, required = []) => ({...object(properties, required), 'x-rapier-strict': true});
// The editor bridge: a device preference and a device action, each answered by an open editor with a receipt. The value domains
// come from the one preference table (shell/preferences.mjs); the call that sets one states them once, in the words an agent reads.
const preferenceValue = {type: ['string', 'boolean'], maxLength: EDITOR_LIMITS.preferenceChars};
const preferenceNames = Object.keys(PREFERENCE_SCHEMAS);
const preferenceSnapshot = object(PREFERENCE_SCHEMAS, preferenceNames);
const editorView = {type: 'string', enum: ['formatted', 'source', 'notes']};
export const SET_VIEW_SCHEMA = object({view: editorView}, ['view']);
export const SET_PREFERENCES_SCHEMA = {...object({preference: {type: 'string', enum: preferenceNames.filter(name => PREFERENCE_DEFINITIONS[name].agent !== false)}, value: preferenceValue}, ['preference', 'value']),
  oneOf: preferenceNames.filter(name => PREFERENCE_DEFINITIONS[name].agent !== false).map(name => ({properties: {preference: {type: 'string', const: name}, value: PREFERENCE_SCHEMAS[name]}}))};
const editorPassage = {
  text: {...string(EDITOR_LIMITS.textChars, 'Exactly one of text or context_handle.'), minLength: 1},
  context_handle: {...string(128, 'Inspected passage, at most 4,096 characters.'), minLength: 1}};
const passageChoice = {oneOf: [{...present('text'), not: present('context_handle')}, {...present('context_handle'), not: present('text')}]};
export const READ_ALOUD_SCHEMA = {...authoredObject(editorPassage), ...passageChoice};
export const COPY_SCHEMA = {...authoredObject({...editorPassage,
  format: {type: 'string', enum: EDITOR_COPY_FORMATS, description: 'complete requires context_handle and carries embedded resources.'}}), ...passageChoice, allOf: [{if: {properties: {format: {type: 'string', const: 'complete'}}, required: ['format']}, then: present('context_handle')}]};
export const OPEN_FILE_SCHEMA = authoredObject();
export const INSTALL_PLUGIN_SCHEMA = authoredObject({plugin: {type: 'string', enum: EDITOR_PLUGINS,
  description: 'Named built-in only; see guide topic device.'}}, ['plugin']);
// The editor's own report of one request: closed tightly, because the editor's page wrote it.
const receiptStatus = {type: 'string', enum: ['applied', 'waiting', 'done', 'declined', 'unavailable']};
const editorReceipt = object({id: ref, status: receiptStatus,
  preference: {type: 'string', enum: preferenceNames}, action: {type: 'string', enum: EDITOR_ACTIONS}, value: preferenceValue,
  previous: preferenceValue, superseded: {type: 'boolean'}, current: preferenceValue, reason: string(96)}, ['status']);
const kinds = {type: 'string', enum: ['markdown', 'text', 'code']};
const ids = {type: 'array', items: ref, minItems: 1, maxItems: 128, uniqueItems: true};
const cursor = string(128);
const within = string(128, 'Current outline ref.');
const editBatch = object({edits: {type: 'array', minItems: 1, maxItems: 16, items: object({
  context_handle: ref, text: editText, placement: {type: 'string', enum: ['replace', 'before', 'after']}}, ['context_handle', 'text'])},
  label: string(120), note: string(240), turn_id}, ['edits']);
const EXPORT_FORMATS = ['markdown', 'html', 'txt', 'page', 'docx', 'pdf'];
const document = string(64, 'Workspace value from rapier.open; keep private.');
// Results keep their real fields. This envelope does not confuse acceptance, commitment, presentation or delivery.
export const RESULT_SCHEMA = {type: 'object', properties: {outcome: {type: 'string'}, reason: {type: 'string'}}, additionalProperties: true};
const count = {type: 'integer', minimum: 0};
const flag = {type: 'boolean'};
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
  labelWidth: drawingNumber(6, 65536), labelIn: drawingFlag, labelPos: drawingNumber(0, 1),
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
const drawFigures = {type: 'array', maxItems: 128, items: record, description: 'Native kind-tagged figures; automatic layout when coordinates are absent. Paint/Water retain pressure and ticks. See guide topics drawing and paint.'};
const dial = (type, description, extra = {}) => ({type, description, ...extra});
const drawDials = described(object({background: dial(['object', 'null'], 'The canvas background as a recipe carries it, {kind, ...}; send the kind alone to take the person\'s starting values for every number you leave out. null removes it.', {additionalProperties: true}),
  paper: dial(['string', 'null'], 'The canvas colour; null returns it to automatic.', {enum: ['white', 'black', null]}),
  effect: dial(['object', 'null'], 'The copy machine on the whole drawing, {preset} alone is a whole effect. null removes it.', {additionalProperties: true}),
  canvas: described(object({w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['w', 'h']), 'The canvas size in drawing units.'),
  frame: {...object({x: {type: 'number', minimum: -65536, maximum: 65536}, y: {type: 'number', minimum: -65536, maximum: 65536}, w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['x', 'y', 'w', 'h']), type: ['object', 'null'], description: 'The rectangle the picture is saved as; null follows the ink.'},
  light: {type: 'number', description: 'The light direction in radians.'}, smooth: integer(0, 100, 'The pen smoothing.'), nib: integer(2, 24, 'The pen width.')}),
  'The drawing\'s own settings, each replacing the one it names and landing on an open drawing as one Undo step: background, paper, effect, canvas, frame, light, smooth and nib.');
const drawShapesPatch = described(object({set: drawDials, add: {type: 'array', maxItems: 128, items: record, description: 'Figures or shapes to add.'}, replace: {type: 'array', maxItems: 128, items: record, description: 'Complete replacement shapes, each by its id. Copy the inspected shape and change only the intended fields; id and label alone are not a shape. A kind:paint figure with id and strokes paints into that existing Paint layer. Water uses id, mode:water and actions. Both preserve the inspected material and transform.'}, remove: described({...ids, items: drawingId}, 'The ids to remove.')}), 'Edit the inspected drawing; live human work is preserved.');

const svgValueMap = (names, numeric = false) => ({type: 'object', minProperties: 1, maxProperties: 64,
  propertyNames: names ? {type: 'string', enum: names} : {type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.:-]*$'},
  additionalProperties: {type: numeric ? ['string', 'number', 'null'] : ['string', 'null'], maxLength: 16384}});
const node_edits = {type: 'array', minItems: 1, maxItems: 128, description: 'Value edits on the imported SVG nodes disclosed by document.read. Definitions, gradients, clips, transforms, references and untouched source bytes are retained. Unsafe content is refused by field. null removes an optional attribute or style property.', items: authoredObject({
  id: {type: 'string', maxLength: 1024, pattern: '^svg:0(?:\\.[0-9]+)*$', description: 'The inspected structural node id.'},
  text: string(16384, 'Character data of a leaf text, tspan, textPath, title or desc. Markup remains text.'),
  attributes: described(svgValueMap(null), 'SVG attributes by exact name. Use style for CSS; namespaces, event handlers, scripts and external references are refused.'),
  style: described(svgValueMap(['alignment-baseline', 'baseline-shift', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'direction', 'display', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'image-rendering', 'letter-spacing', 'lighting-color', 'marker-start', 'marker-mid', 'marker-end', 'mask', 'opacity', 'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration', 'text-rendering', 'transform', 'transform-box', 'transform-origin', 'unicode-bidi', 'vector-effect', 'visibility', 'white-space', 'word-spacing', 'writing-mode']), 'Inline CSS properties. Fragment URLs refer to definitions in this SVG.'),
  geometry: described(svgValueMap(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height', 'dx', 'dy', 'd', 'points', 'pathLength', 'transform', 'viewBox', 'preserveAspectRatio', 'rotate', 'textLength', 'lengthAdjust', 'startOffset', 'offset', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'gradientTransform', 'patternTransform'], true), 'Geometry supported by the inspected element. Numbers or SVG value strings; paths, point lists and transforms retain SVG syntax.'),
}, ['id'])};
const drawAlt = {...string(240, 'The caption, as the person reads it (required on create). With recipe_handle it can be edited alone.'), minLength: 1};
const noteReminder = {...object({at: integer(1, 8640000000000000, 'The first occurrence, in Unix milliseconds.'),
  repeat: {type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom']},
  every: integer(1, 2147483647, 'custom: the interval.'), unit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']},
  snoozeMinutes: integer(1, 2147483647, 'The snooze interval in minutes.')}, ['at']), type: ['object', 'null'],
  description: 'An app reminder, or null to remove it. The receipt names the app; the device manages delivery.'};
const noteFields = {pinned: flag, colour: {type: 'string', enum: ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown']},
  section: string(48, 'A custom section name, created if needed; empty clears the assignment. Skills stays the person\'s choice.'),
  tags: {type: 'array', items: string(128), maxItems: 64, description: 'Replaces the note\'s front-matter tags; an empty list clears them.'},
  archived: flag, trashed: flag, reminder: noteReminder};
// Effects describe maximum consequences; authority remains enforced at the owner.
const EFFECT_CLASSES = Object.freeze({read: 'read', view: 'write', write: 'write', create: 'write', durable: 'sensitive-write', destructive: 'sensitive-write'});
const inputGuides = new Map();
// Prose is available by operation in the focused guide; executable constraints stay on every direct tool.
function conciseInput(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const value = {...schema};
  delete value.description;
  if (value.required?.length === 0) delete value.required;
  // Property names are data: a field literally named description must never disappear.
  for (const key of ['properties', '$defs']) if (schema[key]) value[key] = Object.fromEntries(Object.entries(schema[key]).map(([name, child]) => [name, conciseInput(child)]));
  for (const key of ['oneOf', 'anyOf', 'allOf']) if (schema[key]) value[key] = schema[key].map(conciseInput);
  for (const key of ['items', 'additionalProperties', 'propertyNames', 'not', 'if', 'then', 'else']) if (schema[key] && typeof schema[key] === 'object') value[key] = conciseInput(schema[key]);
  return value;
}
const tool = (name, title, description, effect, inputSchema = object()) => {
  if (!Object.hasOwn(EFFECT_CLASSES, effect)) throw new Error('Undeclared tool effect');
  inputGuides.set(name, inputSchema);
  return Object.freeze({name, title, description, effect, class: EFFECT_CLASSES[effect], inputSchema: conciseInput(inputSchema), outputSchema: RESULT_SCHEMA});
};
const agentName = string(64, 'Attribution only, never authority.');
const documentTool = (name, title, description, effect, inputSchema = object()) =>
  tool(name, title, description, effect, agentInputSchema({...inputSchema, properties: {...inputSchema.properties, agent: agentName, operation_id: operationId}}));
const tag = value => ({type: 'string', const: value});
const target = (kind, properties = {}, required = []) => object({kind: tag(kind), ...properties}, ['kind', ...required]);
const actTarget = {oneOf: [target('act', {act_id}, ['act_id']), target('turn', {turn_id}, ['turn_id'])]};
const range = {start: integer(0, MAX_TEXT_BYTES), end: integer(0, MAX_TEXT_BYTES)};
const locator = {ref, context_handle: ref, ...range};
const readTarget = {oneOf: [target('source', locator), target('drawing', {...locator, objectId: drawingId}), target('svg', locator),
  {...target('comparison', {context_handle: ref, change_id: ref}), oneOf: [{...present('context_handle'), not: present('change_id')}, {...present('change_id'), not: present('context_handle')}]}, target('return', {return_id: ref, start: range.start}, ['return_id'])]};
const noteRef = {...string(160, 'Owner-issued NoteRef from notes.find; not a document capability.'), minLength: 1};
const foreground = object({binding: string(256), generation: integer(0, Number.MAX_SAFE_INTEGER)}, ['binding', 'generation']);

export const TOOLS = Object.freeze([
  documentTool('editor.set_view', 'Set the editor view', 'Request formatted, source or Notes view. Later human navigation wins; inspect the presentation receipt.', 'view', SET_VIEW_SCHEMA),
  documentTool('editor.set_preferences', 'Set a device preference', 'Change one permitted device preference. Returns previous/current values and supersession; human-only controls are excluded.', 'view', SET_PREFERENCES_SCHEMA),
  documentTool('editor.read_aloud', 'Read a passage aloud', 'Start supported device speech; inspect its actual completion or activation requirement.', 'view', READ_ALOUD_SCHEMA),
  documentTool('editor.copy', 'Copy a passage', 'Replace the device clipboard when supported; complete excerpts require an inspected handle.', 'write', COPY_SCHEMA),
  documentTool('editor.open_file', 'Choose a device file', 'Ask the person to select a local file. A done receipt confirms the picker request, not import or save.', 'destructive', OPEN_FILE_SCHEMA),
  documentTool('editor.install_plugin', 'Install a built-in plugin', 'Install one supported built-in plugin from verified resources.', 'create', INSTALL_PLUGIN_SCHEMA),
  documentTool('document.inspect_visual', 'Inspect rendered pixels', 'Read a revision-bound PNG from an actual settled editor, or an unavailable/stale result. Grants no edit authority.', 'read', object({expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection']}}, ['expectedRevision'])),
  documentTool('comments.read', 'Read anchored discussions', 'Read threads, exact messages, status and anchor currentness.', 'read', object({status: {type: 'string', enum: ['open', 'resolved', 'all']}, thread_id: ref, cursor})),
  documentTool('comments.write', 'Discuss inspected work', 'Create, reply to, resolve or reopen an anchored discussion. Changes document data; sends no external message.', 'write', {...object({action: {type: 'string', enum: ['create', 'reply', 'resolve', 'reopen']}, thread_id: ref, text: string(4096), context_handle: ref, anchor: {type: 'string', enum: ['document', 'text', 'image', 'drawing']}, object_id: drawingId, recipient: string(64), turn_id, label: string(120)}, ['action']),
    oneOf: [{properties: {action: {type: 'string', const: 'create'}, text: {}}, required: ['text'], not: present('thread_id')}, {properties: {action: {type: 'string', const: 'reply'}, thread_id: {}, text: {}}, required: ['thread_id', 'text'], not: {anyOf: ['context_handle', 'anchor', 'object_id'].map(present)}}, {properties: {action: {type: 'string', enum: ['resolve', 'reopen']}, thread_id: {}}, required: ['thread_id'], not: {anyOf: ['text', 'recipient', 'context_handle', 'anchor', 'object_id'].map(present)}}]}),
  documentTool('document.observe', 'Observe current work', 'Immediate human-first state: identity, foreground work, changes and pending receipts. Optional facets have bounded coverage; omitted data has a read route.', 'read', object({since: cursor, facets: {type: 'array', items: {type: 'string', enum: ['changes', 'receipts', 'capabilities', 'structure', 'drawing', 'comments', 'comparison', 'history', 'returns', 'brief', 'images', 'layout', 'paint']}, uniqueItems: true}, budget_bytes: {...integer(2048, 12288), default: 6144}})),
  documentTool('document.outline', 'Map document structure', 'Bounded headings or code declarations with temporary read refs. Refs locate content; they do not authorize edits.', 'read', object({within, cursor, limit: pageSize(1, 32, 'Items per page.')})),
  documentTool('document.read', 'Read exact content', 'Inspect source, native drawing, imported SVG, comparison or returned text. Only fully disclosed content grants its typed authority; follow continuations.', 'read', {...object({target: readTarget, cursor, limit: pageSize(256, 4096, 'UTF-16 units per page.'),
    paintSample: authoredObject({objectId: drawingId, point: {type: 'array', minItems: 2, maxItems: 2, items: {type: 'number', minimum: -1000000, maximum: 1000000}}}, ['objectId', 'point'])}),
    oneOf: [{...present('target'), not: present('cursor')}, {...present('cursor'), not: present('target')}]}),
  documentTool('document.find', 'Find source or differences', 'Search an explicit source or comparison scope. Exact disclosed source matches may already carry edit handles; previews do not.', 'read', object({query: string(512), scope: {type: 'string', enum: ['source', 'comparison']}, case_sensitive: flag, within, cursor, limit: pageSize(1, 16, 'Matches per page.'), kind: {type: 'string', enum: [...FIND_KINDS.code, ...FIND_KINDS.markdown]}}, ['query', 'scope'])),
  documentTool('document.edit', 'Edit inspected text', 'Apply inspected edits immediately and atomically as one act. Returned insertion handles exclude unchanged edges.', 'write', editBatch),
  documentTool('document.undo', 'Undo an act', 'Reverse a specific act or turn through retained history while preserving later work.', 'write', object({target: actTarget}, ['target'])),
  documentTool('comparison.present', 'Present a comparison', 'Show an alternative or retained act/turn, or close the comparison. Presentation leaves source unchanged.', 'write', {...object({action: {type: 'string', enum: ['open', 'show', 'close']}, text, name: string(256), target: actTarget, compare_id: ref}, ['action']),
    oneOf: [{properties: {action: {type: 'string', const: 'open'}, text: {}}, required: ['text'], not: {anyOf: ['target', 'compare_id'].map(present)}}, {properties: {action: {type: 'string', const: 'show'}, target: {}}, required: ['target'], not: {anyOf: ['text', 'name', 'compare_id'].map(present)}}, {properties: {action: {type: 'string', const: 'close'}}, not: {anyOf: ['text', 'name', 'target'].map(present)}}]}),
  documentTool('document.replace', 'Replace the working document', 'Broad replacement guarded by current identity and revision. Keeps document identity and history; returns its act. Use edit for passage changes.', 'destructive', object({text, filename: string(MAX_FILENAME_CHARS), docKind: kinds, expected_document_id: string(256), expected_revision: integer(0, Number.MAX_SAFE_INTEGER), turn_id, label: string(120)}, ['text', 'expected_document_id', 'expected_revision'])),
  documentTool('editor.reveal', 'Reveal inspected work', 'Request a quiet reveal of an inspected passage, drawing or comparison difference. Inspect actual or pending presentation.', 'view', object({context_handle: ref}, ['context_handle'])),
  documentTool('editor.point', 'Point to inspected work', 'Temporary shared pointer, possibly requesting reveal. Later human navigation wins; receipt says shown/deferred/expired.', 'view', object({target: {oneOf: [target('source', {context_handle: ref}, ['context_handle']), target('act', {act_id}, ['act_id']), target('comparison', {change_id: ref}, ['change_id'])]}, words: {...string(160), minLength: 1, pattern: '\\S'}, lifetime: {...integer(1, 30), default: 6}}, ['target', 'words'])),
  documentTool('document.create_return', 'Create a return channel', 'Create one expiring one-use channel for an independently edited page. Does not export, overwrite source or grant ongoing access.', 'create'),
  documentTool('document.wait_for_user', 'Wait for the person', 'One bounded wait for message, selection or retained return. Not an ongoing subscription or a wake after this turn.', 'view', object({mode: {type: 'string', enum: ['selection', 'message']}, after_return_id: ref, timeout_ms: {...integer(1000, 120000), default: 20000}})),
  documentTool('document.save', 'Save to the bound destination', 'Save the current document and report the actual destination and verified revision. Hosted storage is not a device or attachment save.', 'durable', object({expected_revision: integer(0, Number.MAX_SAFE_INTEGER)})),
  documentTool('document.export', 'Export an independent file', 'Create Markdown, offline editor HTML, text, rendered page, Word or PDF. Word/PDF need an editor. MCP returns resource_link.uri for download or optional resources/read retrieval.', 'create', {...object({format: {type: 'string', enum: EXPORT_FORMATS}, compare_id: {...ref, minLength: 1, description: 'HTML only: retain this current comparison as a display baseline.'}}, ['format']),
    oneOf: [{properties: {format: {type: 'string', const: 'html'}}}, {properties: {format: {type: 'string', enum: EXPORT_FORMATS.filter(value => value !== 'html')}}, not: present('compare_id')}]}),
  documentTool('document.draw', 'Create or edit native drawing', 'One native vector/paint act. Create needs alt: omit context_handle to append, or inspect a nonempty block to insert after it. shapes patches require an existing drawing read. Water uses paint figures with mode water and path-point geometry, not figure x/y/w/h. See drawing/paint guides. Accepted material work is not committed or presented.', 'write', object({target: {oneOf: [target('create', {context_handle: ref}), target('edit', {recipe_handle: ref}, ['recipe_handle'])]},
    presentation: object({open: flag, replay: flag}), recipe: described(record, 'Complete inspected recipe; exclusive with figures/shapes. Retain paint raster ids.'), figures: drawFigures,
    direction: {type: 'string', enum: ['down', 'across', 'up', 'back']}, shapes: drawShapesPatch, operations: drawingOperations, alt: drawAlt, label: string(120), turn_id}, ['target'])),
  documentTool('svg.edit', 'Edit imported SVG', 'Change inspected foreign-tree nodes while preserving untouched bytes, definitions and safe references. Requires the complete SVG read handle.', 'write', object({svg_handle: ref, node_edits, alt: drawAlt, label: string(120), turn_id}, ['svg_handle', 'node_edits'])),
  documentTool('notes.find', 'Find notes', 'Search the configured Notes store and return owner-issued NoteRefs, custody and completeness. Locked/unavailable is not an empty library.', 'read', object({query: string(2048, 'Words, phrases, tag:, in:, is:, has:, colour:, before:, after:.'), cursor, limit: pageSize(1, 64, 'Notes per page.')})),
  documentTool('notes.read', 'Read a note version', 'Read exact version-consistent note text. Only a complete current read establishes an update base; historical reads do not.', 'read', object({note_ref: noteRef, version: integer(1, Number.MAX_SAFE_INTEGER), cursor, start: range.start, limit: pageSize(256, 12288, 'UTF-16 units per page.')}, ['note_ref'])),
  documentTool('notes.open', 'Open the original note', 'Open an original note in its local editor with foreground guards. Preserves identity/history/custody; never grants document access or enrolls a store.', 'view', object({note_ref: noteRef, expected_foreground: foreground}, ['note_ref', 'expected_foreground'])),
  documentTool('notes.write', 'Create or update a note', 'Create or directly update a note. Existing targets require a complete current read; conflicts leave the note unchanged.', 'write', object({target: {oneOf: [target('create'), target('note', {note_ref: noteRef}, ['note_ref'])]}, text, title: string(200), turn_id, label: string(120)}, ['target', 'text'])),
  documentTool('notes.set', 'Set note controls', 'Change allowed note metadata with exact previous values. Archive/Trash are reversible; Skills and permanent deletion remain human-only. Reminders are device-owned.', 'write', object({note_ref: noteRef, ...noteFields, turn_id, label: string(120)}, ['note_ref'])),
  documentTool('notes.history', 'List retained note versions', 'List retained version metadata with completeness. Use notes.read to inspect bytes; listing does not restore them.', 'read', object({note_ref: noteRef, cursor, limit: pageSize(1, 64, 'Versions per page.')}, ['note_ref'])),
  documentTool('notes.sync', 'Sync configured Notes', 'Run the existing Notes connection. Report partial/skipped/conflict facts; never sign in or enroll implicitly.', 'write', object({action: {type: 'string', const: 'now'}}, ['action'])),
]);

// The editor key: supplied through the private tool-result metadata, never the public result or resource HTML; the host keeps it out of model context. Editor-only operations require it.
const editorKey = string(512, 'The editor key from private tool-result _meta.rapier, held by the host and editor alone.');
const revision = integer(0, Number.MAX_SAFE_INTEGER);
const canonicalSplice = object({pos: integer(0, MAX_TEXT_BYTES), removed: text, inserted: text}, ['pos', 'removed', 'inserted']);
const metadataPair = value => object({before: value, after: value}, ['before', 'after']);
const authoredPlacement = object({basis: {...rows(string(256)), uniqueItems: true}, source: {type: 'string', pattern: '^[a-f0-9]{64}$'},
  splices: {...rows(canonicalSplice), maxItems: 64}}, ['basis', 'source', 'splices']);
const canonicalAct = object({authored: authoredPlacement, id: string(256), baseRevision: revision, revision,
  author: object({kind: {type: 'string', enum: ['human', 'agent', 'system']}, id: string(160), name: string(120)}, ['kind', 'id']),
  operation: string(96), createdAt: {...revision, type: ['integer', 'null']}, label: {type: ['string', 'null'], maxLength: 120},
  affectedBlockIds: rows(revision), turnId: string(160),
  sourceTransactionId: {type: ['string', 'null'], maxLength: 256}, sourceTransactionIds: {...rows(string(256)), maxItems: 1024, uniqueItems: true},
  reverts: string(256), reapplies: string(256), splices: {...rows(canonicalSplice), maxItems: 64},
  metadata: {...object({filename: metadataPair(string(512)), docKind: metadataPair(kinds)}), minProperties: 1}},
  ['id', 'baseRevision', 'revision', 'author', 'operation', 'createdAt', 'splices']);
const sourceRange = {...object({start: integer(0, MAX_TEXT_BYTES), end: integer(0, MAX_TEXT_BYTES), objectId: drawingId}, ['start', 'end']), type: ['object', 'null']};
const hostFile = object({name: {...string(256, 'The opened filename, without a path.'), minLength: 1}, resourceUri: {...string(8192, 'Opaque host resource URI. Only the editor reads it through the host bridge.'), minLength: 1}}, ['name', 'resourceUri']);
const visualFact = object({documentId: string(256), revision, scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection']}, drawing: record, outcome: {type: 'string', enum: ['ok', 'refused']}, reason: string(128), sourceRange,
  image: object({mimeType: {const: 'image/png', type: 'string'}, data: string(Math.ceil(VISUAL_LIMITS.imageBytes / 3) * 4), width: integer(1, VISUAL_LIMITS.edge), height: integer(1, VISUAL_LIMITS.edge)}, ['mimeType', 'data', 'width', 'height'])}, ['documentId', 'revision', 'scope', 'outcome']);
const exportFact = object({documentId: string(256), revision, format: {type: 'string', enum: ['docx', 'pdf']},
  outcome: {type: 'string', enum: ['ok', 'refused']}, reason: string(128),
  artifact: object({mimeType: string(128), data: string(Math.ceil(MAX_EXPORT_BYTES / 3) * 4), filename: string(MAX_FILENAME_CHARS),
    pages: integer(1, Number.MAX_SAFE_INTEGER), issues: {...rows(object({code: string(128), severity: string(32), count, message: string(512)}, ['code'])), maxItems: 32}},
  ['mimeType', 'data', 'filename'])}, ['documentId', 'revision', 'format', 'outcome']);
const editorFact = object({kind: {type: 'string', const: 'editor'}, documentId: ref, revision: integer(0, Number.MAX_SAFE_INTEGER),
  operation: {type: 'string', enum: ['editor.set_preferences', 'document.device_action']}, receipt: editorReceipt},
  ['kind', 'documentId', 'revision', 'operation', 'receipt']);
export const HOST_TOOLS = Object.freeze([
  tool('rapier.guide', 'Read a focused guide', 'Read focused contracts and registries; operation returns field help for the bound operation. Use the published tool schema for the host document argument. Never activates hidden tools.', 'read', agentInputSchema(object({topic: {type: 'string', enum: GUIDE_TOPICS}, operation: string(64)}))),
  tool('rapier.open', 'Open a shared document', 'Create from text or an authorized host file, or resume by document value. Returns initial observation and editor_url; opening is not proof of editor presentation.', 'create', agentInputSchema({...object({document, file: hostFile, text, filename: string(MAX_FILENAME_CHARS), docKind: kinds,
    createToken: {...string(128, 'Creation retry identity; anonymous calls require a secret of at least 22 characters.'), minLength: 1, pattern: '^[A-Za-z0-9_-]+$'}}),
    oneOf: [{...present('document'), not: {anyOf: ['file', 'text', 'filename', 'docKind', 'createToken'].map(present)}},
      {...present('file'), not: {anyOf: ['document', 'text', 'filename', 'docKind'].map(present)}},
      {not: {anyOf: ['document', 'file'].map(present)}}]})),
  {...tool('document.sync', 'Refresh the editor', "Returns the editor's workspace snapshot when refreshing state, or unchanged while afterRevision and afterVersion still hold.", 'read', object({document, editorKey, afterRevision: integer(0, Number.MAX_SAFE_INTEGER), afterVersion: integer(0, Number.MAX_SAFE_INTEGER)}, ['document', 'editorKey'])), visibility: ['app']},
  {...tool('document.commit', 'Save the person’s edits', "Commits the editor's source edits from its acknowledged revision, rebasing over concurrent changes while preserving both authors' insertions.", 'write', object({document, editorKey, expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), text,
    splices: described({...rows(canonicalSplice), maxItems: 65536}, 'Exact sequential edits from the acknowledged source to text.'),
    acts: described({...rows(canonicalAct), minItems: 1, maxItems: 1024}, 'Canonical local acts after the acknowledged checkpoint, preserving original identity and attribution. The per-request bound does not trim retained history.'),
    filename: string(512), docKind: kinds, turn_id, label: string(120), commitId: string(128), hydration_id: string(128)}, ['document', 'editorKey', 'expectedRevision', 'text', 'commitId'])), visibility: ['app']},
  {...tool('document.connect_agents', 'Reconnect agents', 'Shares a disconnected connected workspace again through its authenticated editor.', 'destructive', object({document, editorKey, expectedRevision: revision, expectedVersion: revision, operation_id: operationId}, ['document', 'editorKey', 'expectedRevision', 'expectedVersion', 'operation_id'])), visibility: ['app']},
  {...tool('document.human_context', 'Update the person’s context', "Updates the editor's selection, focus, settled drawing, view, device preferences and editing lease for one document revision.", 'view', object({document, editorKey, expectedRevision: revision, contextId: ref, sequence: revision, visible: flag, editing: flag, view: editorView, selection: sourceRange, focus: sourceRange, navigationSequence: revision, drawingReceipts: {type: 'array', items: record}, drawing: {type: ['object', 'null'], additionalProperties: true}, editor: object({preferences: preferenceSnapshot}, ['preferences'])}, ['document', 'editorKey', 'expectedRevision', 'contextId', 'sequence', 'visible', 'editing'])), visibility: ['app']},
  {...tool('document.visual_ack', 'Return a visual observation', "Supplies the editor's rendered observation for an exact pending visual request.", 'view', object({document, editorKey, expectedRevision: revision, visualId: ref, fact: visualFact}, ['document', 'editorKey', 'expectedRevision', 'visualId', 'fact'])), visibility: ['app']},
  {...tool('document.export_ack', 'Return an exported file', "Supplies the open editor's Word or PDF file for an exact pending export request.", 'view', object({document, editorKey, expectedRevision: revision, exportId: ref, fact: exportFact}, ['document', 'editorKey', 'expectedRevision', 'exportId', 'fact'])), visibility: ['app']},
  {...tool('document.material_ack', 'Return prepared material', "Supplies private Water pixels or a material sample for the exact pending request; the kernel retains source-edit authority.", 'view', object({document, editorKey, expectedRevision: revision, materialId: ref,
    fact: object({kind: {type: 'string', const: 'material'}, documentId: string(256), revision, job: {...string(64), pattern: '^[a-f0-9]{64}$'}, outcome: {type: 'string', enum: ['ok', 'refused']}, value: record, reason: string(128)}, ['kind', 'documentId', 'revision', 'job', 'outcome'])}, ['document', 'editorKey', 'expectedRevision', 'materialId', 'fact'])), visibility: ['app']},
  {...tool('document.editor_ack', 'Return an editor receipt', "Records the editor's receipt for one exact preference or device request, including the person's later choice of a preference.", 'view', object({document, editorKey, expectedRevision: revision, editorId: ref, fact: editorFact}, ['document', 'editorKey', 'expectedRevision', 'editorId', 'fact'])), visibility: ['app']},
  {...tool('document.view_ack', 'Acknowledge editor presentation', "Records whether the editor presented or refused a requested passage or difference, and when a shown pointer ends.", 'view', object({document, editorKey, expectedRevision: revision, viewId: ref, status: {type: 'string', enum: ['presented', 'refused', 'expired']}, reason: string(160)}, ['document', 'editorKey', 'expectedRevision', 'viewId', 'status'])), visibility: ['app']},
  {...tool('document.rotate_capability', 'Disconnect agents', "Revokes existing agent access to the workspace when the person disconnects agents, preserving its content, history and collaboration controls. The replacement document value returns sealed to the editor, which shares it again when the person chooses; every paired browser but the one asking is unpaired.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
  tool('editor.pair', 'Pair a browser', 'Submit the person-provided browser code. Owner approval and target-browser ALLOW remain human decisions; see the device guide.', 'destructive', object({document, code: {...string(4, 'The four letters the page shows.'), pattern: '^[A-Za-z]{4}$'}}, ['document', 'code'])),
  {...tool('document.pair_status', 'Show the pairing code', "Returns the page's pairing state. A connected workspace first requires approval in its owner's connected browser, then the target page collects the person's allow or cancel decision; polling grants no session.", 'view', object({document, decision: {type: 'string', enum: ['allow', 'cancel']}}, ['document'])), visibility: ['app']},
  {...tool('document.delete', 'Delete this workspace', "Permanently deletes the workspace and its history when the person chooses Delete in the editor.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
]);

export const getTool = name => TOOLS.find(entry => entry.name === name) || HOST_TOOLS.find(entry => entry.name === name);
// MCP calls carry the document authority explicitly; page-bound calls already have it.
function mcpInputSchema(name, schema) {
  return TOOLS.some(entry => entry.name === name) ? {...schema,
    properties: {document, ...schema.properties}, required: ['document', ...(schema.required || [])]} : schema;
}
export function inputGuide(name, {mcp = false} = {}) {
  const descriptor = getTool(name), schema = inputGuides.get(name);
  return descriptor && !descriptor.visibility ? structuredClone(mcp ? mcpInputSchema(name, schema) : schema) : null;
}
// Page and embed adapters expose the public guide beside the document kernel's tools.
export const PAGE_TOOLS = Object.freeze([...TOOLS, getTool('rapier.guide')]);

export function annotations(effect, host = 'mcp', name = '') {
  if (!Object.hasOwn(EFFECT_CLASSES, effect)) throw new Error('Undeclared tool effect');
  if (host === 'webmcp') return {readOnlyHint: effect === 'read', untrustedContentHint: true, consequentialHint: ['durable', 'destructive'].includes(effect)};
  return {readOnlyHint: effect === 'read', destructiveHint: ['write', 'durable', 'destructive'].includes(effect), idempotentHint: effect === 'read', openWorldHint: false};
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
  // Document schemas are already projected. Projecting twice would reopen their explicitly closed fields.
  return [...TOOLS.map(entry => ({...entry, inputSchema: conciseInput(mcpInputSchema(entry.name, entry.inputSchema))})), ...HOST_TOOLS].map(entry => {
    const {effect, class: toolClass, visibility, ...descriptor} = entry;
    // The local server verifies its transport bearer before dispatch; it has no connector OAuth flow. /mcp is called
    // without one by the hosts that list it; /muse requires the connection.
    const security = auth === 'server-bearer' ? {} : auth === 'anonymous' ? {securitySchemes: [{type: 'noauth'}]} : {securitySchemes: [{type: 'oauth2', scopes: effect === 'read' ? ['rapier:read'] : ['rapier:read', 'rapier:write']}]};
    // UI access matches the standard visibility (model + app by default). The editor still proves its authority with its key.
    // Completion says a reply arrived, never that a refused edit was applied or an unverified save succeeded.
    const base = {...descriptor, ...(entry.name === 'rapier.open' ? {icons: ICONS} : {}), annotations: {title: entry.title, ...annotations(effect, 'mcp', entry.name)}, ...security, _meta: {
      ...security,
      'website.rapier/tool-class': toolClass,
      ...(visibility ? {ui: {visibility}} : {}), 'openai/widgetAccessible': (visibility || ['model', 'app']).includes('app'),
      ...(entry.name === 'rapier.open' || visibility ? {'openai/toolInvocation/invoking': entry.name === 'rapier.open' ? 'Opening Rapier.' : 'Working in Rapier.',
        'openai/toolInvocation/invoked': 'Rapier has replied.'} : {}),
    }};
    if (entry.name !== 'rapier.open' || !uiResource) return base;
    return {...base, _meta: {...base._meta, ui: {...base._meta?.ui, resourceUri: uiResource, visibility: ['model', 'app']}, 'openai/outputTemplate': uiResource,
      'openai/ui': {entrypoints: [{type: 'global'}, {type: 'thread'}, {type: 'file', extensions: ['.md', '.markdown', '.txt']}]}}};
  });
}

export { validateInput };
