import { validateInput, agentInputSchema } from './validate-input.mjs';
import { VERSION } from '../version.mjs';
import { VISUAL_LIMITS } from './visual.mjs';
import { FIND_KINDS } from './structure-request.mjs';
import {PREFERENCE_DEFINITIONS} from '../shell/preferences.mjs';
import {EDITOR_LIMITS, EDITOR_ACTIONS, EDITOR_PLUGINS, EDITOR_COPY_FORMATS, PREFERENCE_SCHEMAS} from './editor.mjs';

export const MAX_TEXT_BYTES = 64 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
export const MAX_FILENAME_CHARS = 256;
export const UI_RESOURCE = `ui://rapier/editor-${VERSION}.html`;
const string = (maxLength = 256, description) => ({type: 'string', maxLength, ...(description ? {description} : {})});

const text = string(MAX_TEXT_BYTES);
const editText = string(262144);
const ref = string(128);
const act_id = string(256);
const operationId = {...string(128), minLength: 1};
const turn_id = {...string(160), minLength: 1, pattern: '\\S'};
const integer = (minimum, maximum) => ({type: 'integer', minimum, maximum});

const object = (properties = {}, required = []) => ({type: 'object', properties, required, additionalProperties: false});
const present = key => ({properties: {[key]: {}}, required: [key]});
const authoredObject = (properties, required = []) => ({...object(properties, required), 'x-rapier-strict': true});
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
const receiptStatus = {type: 'string', enum: ['applied', 'waiting', 'done', 'declined', 'unavailable']};
const editorReceipt = object({id: ref, status: receiptStatus,
  preference: {type: 'string', enum: preferenceNames}, action: {type: 'string', enum: EDITOR_ACTIONS}, value: preferenceValue,
  previous: preferenceValue, superseded: {type: 'boolean'}, current: preferenceValue, reason: string(96)}, ['status']);
const kinds = {type: 'string', enum: ['markdown', 'text', 'code']};
const ids = {type: 'array', items: ref, minItems: 1, maxItems: 128, uniqueItems: true};
const cursor = string(128);
const within = string(128);
const editBatch = object({edits: {type: 'array', minItems: 1, maxItems: 16, items: object({
  context_handle: ref, text: editText, placement: {type: 'string', enum: ['replace', 'before', 'after']}}, ['context_handle', 'text'])},
  label: string(120), note: string(240), turn_id}, ['edits']);
const EXPORT_FORMATS = ['markdown', 'html', 'txt', 'page', 'docx', 'pdf'];
const document = string(64);
export const RESULT_SCHEMA = {type: 'object', properties: {outcome: {type: 'string'}, reason: {type: 'string'}}, additionalProperties: true};
const count = {type: 'integer', minimum: 0};
const flag = {type: 'boolean'};
const rows = item => ({type: 'array', items: item});
const drawingId = {...string(64), minLength: 1, pattern: '^[A-Za-z0-9_-]+$'};
const shapeIds = {...ids, items: drawingId};
const drawingNumber = (minimum, maximum) => ({type: ['number', 'null'], minimum, maximum});
const drawingChoice = values => ({type: ['string', 'null'], enum: [...values, null]});
const drawingFlag = {type: ['boolean', 'null']};
const drawingEffect = {type: ['object', 'null'], additionalProperties: true};
const drawingLook = {
  effect: drawingEffect,
  brush: {...string(24), type: ['string', 'null']},
  style: {...string(16), type: ['string', 'null']},
  ink: {type: ['string', 'null'], maxLength: 16},
  border: {type: ['string', 'null'], maxLength: 16},
  dash: drawingChoice(['dashed', 'dotted']),
  nib: {type: ['integer', 'null'], minimum: 2, maximum: 24},
  smooth: {type: ['integer', 'null'], minimum: 0, maximum: 100},
  textFont: {type: ['string', 'null'], maxLength: 64},
  textSize: drawingNumber(6, 512), textBold: drawingFlag, textItalic: drawingFlag, textUnderline: drawingFlag,
  lineHeight: drawingNumber(1, 2.5), letterSpacing: drawingNumber(-.2, .6), wordSpacing: drawingNumber(-.2, 1),
  textCase: drawingChoice(['upper', 'lower', 'small']), textKern: drawingFlag,
  textFigures: drawingChoice(['oldstyle', 'lining', 'tabular']), textWrap: drawingChoice(['balance']),
  labelWidth: drawingNumber(6, 65536), labelIn: drawingFlag, labelPos: drawingNumber(0, 1),
  labelAlign: drawingChoice(['start', 'middle', 'end']), labelVAlign: drawingChoice(['top', 'middle', 'bottom']),
  step: {type: ['integer', 'null'], minimum: 1, maximum: 99},
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
const drawingOperations = {type: 'array', maxItems: 64, items: authoredObject({
  type: {type: 'string', enum: ['create', 'move', 'resize', 'rotate', 'set_look', 'set_label', 'set_step', 'connect', 'properties', 'group', 'ungroup', 'lock', 'unlock', 'unlockAll', 'delete', 'front', 'back', 'forward', 'backward', 'duplicate', 'align', 'distribute', 'flip', 'clean', 'unclean']},
  ...drawingLook, label: {type: 'string', maxLength: 4096},
  ids: {...shapeIds, minItems: 0}, group: drawingId,
  figures: {type: 'array', minItems: 1, maxItems: 128, items: {type: 'object', additionalProperties: true}},
  direction: {type: 'string', enum: ['down', 'across', 'up', 'back']},
  dx: {type: 'number', minimum: -65536, maximum: 65536}, dy: {type: 'number', minimum: -65536, maximum: 65536},
  width: {type: 'number', exclusiveMinimum: 0, maximum: 65536}, height: {type: 'number', exclusiveMinimum: 0, maximum: 65536},
  anchor: authoredObject({x: {type: 'number', enum: [0, .5, 1]}, y: {type: 'number', enum: [0, .5, 1]}}, ['x', 'y']), local: {type: 'boolean'},
  angle: {type: 'number', minimum: -65536, maximum: 65536}, pivot: drawingPoint,
  start: drawingAnchor, end: drawingAnchor,
  properties: drawingProperties,
  newIds: {...ids, items: drawingId},
  alignment: {type: 'string', enum: ['left', 'center', 'right', 'top', 'middle', 'bottom']}, axis: {type: 'string', enum: ['x', 'y']},
}, ['type'])};
const record = {type: 'object', additionalProperties: true};
const drawFigures = {type: 'array', maxItems: 128, items: record};
const dial = (type, extra = {}) => ({type, ...extra});
const drawDials = object({background: dial(['object', 'null'], {additionalProperties: true}),
  paper: dial(['string', 'null'], {enum: ['white', 'black', null]}),
  effect: drawingEffect,
  canvas: object({w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['w', 'h']),
  frame: {...object({x: {type: 'number', minimum: -65536, maximum: 65536}, y: {type: 'number', minimum: -65536, maximum: 65536}, w: {type: 'number', minimum: 1, maximum: 65536}, h: {type: 'number', minimum: 1, maximum: 65536}}, ['x', 'y', 'w', 'h']), type: ['object', 'null']},
  light: {type: 'number'}, smooth: integer(0, 100), nib: integer(2, 24)});
const drawShapesPatch = object({set: drawDials, add: {type: 'array', maxItems: 128, items: record}, replace: {type: 'array', maxItems: 128, items: record}, remove: {...ids, items: drawingId}});

const svgValueMap = (names, numeric = false) => ({type: 'object', minProperties: 1, maxProperties: 64,
  propertyNames: names ? {type: 'string', enum: names} : {type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.:-]*$'},
  additionalProperties: {type: numeric ? ['string', 'number', 'null'] : ['string', 'null'], maxLength: 16384}});
const node_edits = {type: 'array', minItems: 1, maxItems: 128, items: authoredObject({
  id: {type: 'string', maxLength: 1024, pattern: '^svg:0(?:\\.[0-9]+)*$'},
  text: string(16384),
  attributes: svgValueMap(null),
  style: svgValueMap(['alignment-baseline', 'baseline-shift', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'direction', 'display', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'image-rendering', 'letter-spacing', 'lighting-color', 'marker-start', 'marker-mid', 'marker-end', 'mask', 'opacity', 'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration', 'text-rendering', 'transform', 'transform-box', 'transform-origin', 'unicode-bidi', 'vector-effect', 'visibility', 'white-space', 'word-spacing', 'writing-mode']),
  geometry: svgValueMap(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height', 'dx', 'dy', 'd', 'points', 'pathLength', 'transform', 'viewBox', 'preserveAspectRatio', 'rotate', 'textLength', 'lengthAdjust', 'startOffset', 'offset', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'gradientTransform', 'patternTransform'], true),
}, ['id'])};
const drawAlt = {...string(240), minLength: 1};
const noteReminder = {...object({at: integer(1, 8640000000000000),
  repeat: {type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom']},
  every: integer(1, 2147483647), unit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']},
  snoozeMinutes: integer(1, 2147483647)}, ['at']), type: ['object', 'null']};
const noteFields = {pinned: flag, colour: {type: 'string', enum: ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown']},
  section: string(48),
  tags: {type: 'array', items: string(128), maxItems: 64},
  archived: flag, trashed: flag, reminder: noteReminder};
const EFFECT_CLASSES = Object.freeze({read: 'read', view: 'write', write: 'write', create: 'write', durable: 'sensitive-write', destructive: 'sensitive-write'});
function conciseInput(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const value = {...schema};
  delete value.description;
  if (value.required?.length === 0) delete value.required;
  for (const key of ['properties', '$defs']) if (schema[key]) value[key] = Object.fromEntries(Object.entries(schema[key]).map(([name, child]) => [name, conciseInput(child)]));
  for (const key of ['oneOf', 'anyOf', 'allOf']) if (schema[key]) value[key] = schema[key].map(conciseInput);
  for (const key of ['items', 'additionalProperties', 'propertyNames', 'not', 'if', 'then', 'else']) if (schema[key] && typeof schema[key] === 'object') value[key] = conciseInput(schema[key]);
  return value;
}
const tool = (name, title, description, effect, inputSchema = object()) => {
  if (!Object.hasOwn(EFFECT_CLASSES, effect)) throw new Error('Undeclared tool effect');
  return Object.freeze({name, title, description, effect, class: EFFECT_CLASSES[effect], inputSchema: conciseInput(inputSchema),
    outputSchema: RESULT_SCHEMA});
};
const agentName = string(64);
const documentTool = (name, title, description, effect, inputSchema = object()) =>
  tool(name, title, description, effect, agentInputSchema({...inputSchema, properties: {...inputSchema.properties, agent: agentName, operation_id: operationId}}));
const tag = value => ({type: 'string', const: value});
const target = (kind, properties = {}, required = []) => object({kind: tag(kind), ...properties}, ['kind', ...required]);
const actTarget = {oneOf: [target('act', {act_id}, ['act_id']), target('turn', {turn_id}, ['turn_id'])]};
const range = {start: integer(0, MAX_TEXT_BYTES), end: integer(0, MAX_TEXT_BYTES)};
const locator = {ref, context_handle: ref, ...range};
const readTarget = {oneOf: [target('source', locator), target('drawing', {...locator, objectId: drawingId}), target('svg', locator),
  {...target('comparison', {context_handle: ref, change_id: ref}), oneOf: [{...present('context_handle'), not: present('change_id')}, {...present('change_id'), not: present('context_handle')}]}, target('return', {return_id: ref, start: range.start}, ['return_id'])]};
const noteRef = {...string(160), minLength: 1};
const foreground = object({binding: string(256), generation: integer(0, Number.MAX_SAFE_INTEGER)}, ['binding', 'generation']);

export const TOOLS = Object.freeze([
  documentTool('editor.set_view', 'Set the editor view', 'Request formatted, source or Notes view. Later human navigation wins; inspect the presentation receipt.', 'view', SET_VIEW_SCHEMA),
  documentTool('editor.set_preferences', 'Set a device preference', 'Change one permitted device preference. Returns previous/current values and supersession; human-only controls are excluded.', 'write', SET_PREFERENCES_SCHEMA),
  documentTool('editor.read_aloud', 'Read a passage aloud', 'Start supported device speech; inspect its actual completion or activation requirement.', 'view', READ_ALOUD_SCHEMA),
  documentTool('editor.copy', 'Copy a passage', 'Replace the device clipboard when supported; complete excerpts require an inspected handle.', 'write', COPY_SCHEMA),
  documentTool('editor.open_file', 'Choose a device file', 'Ask the person to select a local file. A done receipt confirms the picker request, not import or save.', 'destructive', OPEN_FILE_SCHEMA),
  documentTool('editor.install_plugin', 'Install a built-in plugin', 'Install one supported built-in plugin from verified resources.', 'create', INSTALL_PLUGIN_SCHEMA),
  documentTool('document.inspect_visual', 'Inspect rendered pixels', 'Read a revision-bound PNG from an actual settled editor, or an unavailable/stale result. Grants no edit authority.', 'read', object({expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection']}}, ['expectedRevision'])),
  documentTool('comments.read', 'Read anchored discussions', 'Read threads, exact messages, status and anchor currentness.', 'read', object({status: {type: 'string', enum: ['open', 'resolved', 'all']}, thread_id: ref, cursor})),
  documentTool('comments.write', 'Discuss inspected work', 'Create, reply to, resolve or reopen an anchored discussion. Changes document data; sends no external message.', 'write', {...object({action: {type: 'string', enum: ['create', 'reply', 'resolve', 'reopen']}, thread_id: ref, text: string(4096), context_handle: ref, anchor: {type: 'string', enum: ['document', 'text', 'image', 'drawing']}, object_id: drawingId, recipient: string(64), turn_id, label: string(120)}, ['action']),
    oneOf: [{properties: {action: {type: 'string', const: 'create'}, text: {}}, required: ['text'], not: present('thread_id')}, {properties: {action: {type: 'string', const: 'reply'}, thread_id: {}, text: {}}, required: ['thread_id', 'text'], not: {anyOf: ['context_handle', 'anchor', 'object_id'].map(present)}}, {properties: {action: {type: 'string', enum: ['resolve', 'reopen']}, thread_id: {}}, required: ['thread_id'], not: {anyOf: ['text', 'recipient', 'context_handle', 'anchor', 'object_id'].map(present)}}]}),
  documentTool('document.observe', 'Observe current work', 'Immediate human-first state: identity, foreground work, changes and pending receipts. Optional facets have bounded coverage; omitted data has a read route.', 'read', object({since: cursor, facets: {type: 'array', items: {type: 'string', enum: ['changes', 'receipts', 'capabilities', 'structure', 'drawing', 'comments', 'comparison', 'history', 'returns', 'brief', 'images', 'layout', 'paint']}, uniqueItems: true}, budget_bytes: {...integer(2048, 12288), default: 6144}})),
  documentTool('document.outline', 'Map document structure', 'Bounded headings or code declarations with temporary read refs. Refs locate content; they do not authorize edits.', 'read', object({within, cursor, limit: integer(1, Number.MAX_SAFE_INTEGER)})),
  documentTool('document.read', 'Read exact content', 'Inspect source, native drawing, imported SVG, comparison or returned text. Only fully disclosed content grants its typed authority; follow continuations.', 'read', {...object({target: readTarget, cursor, limit: integer(256, Number.MAX_SAFE_INTEGER),
    paintSample: authoredObject({objectId: drawingId, point: {type: 'array', minItems: 2, maxItems: 2, items: {type: 'number', minimum: -1000000, maximum: 1000000}}}, ['objectId', 'point'])}),
    oneOf: [{...present('target'), not: present('cursor')}, {...present('cursor'), not: present('target')}]}),
  documentTool('document.find', 'Find source or differences', 'Search an explicit source or comparison scope. Exact disclosed source matches may already carry edit handles; previews do not.', 'read', object({query: string(512), scope: {type: 'string', enum: ['source', 'comparison']}, case_sensitive: flag, within, cursor, limit: integer(1, Number.MAX_SAFE_INTEGER), kind: {type: 'string', enum: [...FIND_KINDS.code, ...FIND_KINDS.markdown]}}, ['query', 'scope'])),
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
  documentTool('document.export', 'Export an independent file', 'Create Markdown, offline editor HTML, text, rendered page, Word or PDF. Word/PDF need an editor. MCP returns resource_link.uri for download or optional resources/read retrieval.', 'create', {...object({format: {type: 'string', enum: EXPORT_FORMATS}, compare_id: {...ref, minLength: 1}}, ['format']),
    oneOf: [{properties: {format: {type: 'string', const: 'html'}}}, {properties: {format: {type: 'string', enum: EXPORT_FORMATS.filter(value => value !== 'html')}}, not: present('compare_id')}]}),
  documentTool('document.draw', 'Create or edit native drawing', 'One native vector/paint act. Create needs alt: omit context_handle to append, or inspect a nonempty block to insert after it. shapes patches require an existing drawing read. Water uses paint figures with mode water and path-point geometry, not figure x/y/w/h. See drawing/paint guides. Accepted material work is not committed or presented.', 'write', object({target: {oneOf: [target('create', {context_handle: ref}), target('edit', {recipe_handle: ref}, ['recipe_handle'])]},
    presentation: object({open: flag, replay: flag}), recipe: record, figures: drawFigures,
    direction: {type: 'string', enum: ['down', 'across', 'up', 'back']}, shapes: drawShapesPatch, operations: drawingOperations, alt: drawAlt, label: string(120), turn_id}, ['target'])),
  documentTool('svg.edit', 'Edit imported SVG', 'Change inspected foreign-tree nodes while preserving untouched bytes, definitions and safe references. Requires the complete SVG read handle.', 'write', object({svg_handle: ref, node_edits, alt: drawAlt, label: string(120), turn_id}, ['svg_handle', 'node_edits'])),
  documentTool('notes.find', 'Find notes', 'Search the configured Notes store and return owner-issued NoteRefs, custody and completeness. Locked/unavailable is not an empty library.', 'read', object({query: string(2048), cursor, limit: integer(1, Number.MAX_SAFE_INTEGER)})),
  documentTool('notes.read', 'Read a note version', 'Read exact version-consistent note text and current control fields. Only a whole current read establishes this caller’s private source/controls update base; partial and historical reads do not.', 'read', object({note_ref: noteRef, version: integer(1, Number.MAX_SAFE_INTEGER), cursor, start: range.start, limit: integer(256, Number.MAX_SAFE_INTEGER)}, ['note_ref'])),
  documentTool('notes.open', 'Open the original note', 'Open an original note in its local editor with foreground guards. Preserves identity/history/custody; never grants document access or enrolls a store.', 'view', object({note_ref: noteRef, expected_foreground: foreground}, ['note_ref', 'expected_foreground'])),
  documentTool('notes.write', 'Create or update a note', 'Create or directly update a note. Existing targets require a complete current read; conflicts leave the note unchanged.', 'write', object({target: {oneOf: [target('create'), target('note', {note_ref: noteRef}, ['note_ref'])]}, text, title: string(200), turn_id, label: string(120)}, ['target', 'text'])),
  documentTool('notes.set', 'Set note controls', 'Change allowed note controls after a whole current notes.read. Freshness is checked under the Notes lease. The source revision remains its digest; the retained Notes act owns selective Undo where authorized. Skills and permanent deletion remain human-only. Reminders are device-owned.', 'write', object({note_ref: noteRef, ...noteFields, turn_id, label: string(120)}, ['note_ref'])),
  documentTool('notes.history', 'List retained note versions', 'List retained version metadata with completeness. Use notes.read to inspect bytes; listing does not restore them.', 'read', object({note_ref: noteRef, cursor, limit: integer(1, Number.MAX_SAFE_INTEGER)}, ['note_ref'])),
  documentTool('notes.sync', 'Sync configured Notes', 'Run the existing Notes connection. Report partial/skipped/conflict facts; never sign in or enroll implicitly.', 'write', object({action: {type: 'string', const: 'now'}}, ['action'])),
]);

const editorKey = string(512);
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
const visualFact = object({documentId: string(256), revision, scope: {type: 'string', enum: ['viewport', 'page', 'focus', 'selection']}, drawing: record, outcome: {type: 'string', enum: ['ok', 'refused']}, reason: string(128), sourceRange,
  image: object({mimeType: {const: 'image/png', type: 'string'}, data: string(Math.ceil(VISUAL_LIMITS.imageBytes / 3) * 4), width: integer(1, VISUAL_LIMITS.edge), height: integer(1, VISUAL_LIMITS.edge)}, ['mimeType', 'data', 'width', 'height'])}, ['documentId', 'revision', 'scope', 'outcome']);
const exportFact = object({documentId: string(256), revision, format: {type: 'string', enum: ['docx', 'pdf', 'page']},
  outcome: {type: 'string', enum: ['ok', 'refused']}, reason: string(128),
  artifact: object({mimeType: string(128), data: string(Math.ceil(MAX_EXPORT_BYTES / 3) * 4), filename: string(MAX_FILENAME_CHARS),
    pages: integer(1, Number.MAX_SAFE_INTEGER), issues: {...rows(object({code: string(128), severity: string(32), count, message: string(512)}, ['code'])), maxItems: 32}},
  ['mimeType', 'data', 'filename'])}, ['documentId', 'revision', 'format', 'outcome']);
const editorFact = object({kind: {type: 'string', const: 'editor'}, documentId: ref, revision: integer(0, Number.MAX_SAFE_INTEGER),
  operation: {type: 'string', enum: ['editor.set_preferences', 'document.device_action']}, receipt: editorReceipt},
  ['kind', 'documentId', 'revision', 'operation', 'receipt']);
export const HOST_TOOLS = Object.freeze([
  {...tool('document.sync', 'Refresh the editor', "Resumes prepared authorized material work, then returns the editor's workspace snapshot, or unchanged while afterRevision and afterVersion still hold.", 'write', object({document, editorKey, afterRevision: integer(0, Number.MAX_SAFE_INTEGER), afterVersion: integer(0, Number.MAX_SAFE_INTEGER)}, ['document', 'editorKey'])), visibility: ['app']},
  {...tool('document.commit', 'Save the person’s edits', "Commits the editor's source edits from its acknowledged revision, rebasing over concurrent changes while preserving both authors' insertions.", 'write', object({document, editorKey, expectedRevision: integer(0, Number.MAX_SAFE_INTEGER), text,
    splices: {...rows(canonicalSplice), maxItems: 65536},
    acts: {...rows(canonicalAct), minItems: 1, maxItems: 1024},
    filename: string(512), docKind: kinds, turn_id, label: string(120), commitId: string(128), hydration_id: string(128)}, ['document', 'editorKey', 'expectedRevision', 'text', 'commitId'])), visibility: ['app']},
  {...tool('document.connect_agents', 'Reconnect agents', 'Shares a disconnected connected workspace again through its authenticated editor.', 'destructive', object({document, editorKey, expectedRevision: revision, expectedVersion: revision, operation_id: operationId}, ['document', 'editorKey', 'expectedRevision', 'expectedVersion', 'operation_id'])), visibility: ['app']},
  {...tool('document.human_context', 'Update the person’s context', "Updates the editor's selection, focus, settled drawing, view, device preferences and editing lease for one document revision.", 'write', object({document, editorKey, expectedRevision: revision, contextId: ref, sequence: revision, visible: flag, editing: flag, view: editorView, selection: sourceRange, focus: sourceRange, navigationSequence: revision, drawingReceipts: {type: 'array', items: record}, objects: {type: 'array', maxItems: 64, items: object({start: revision, playing: flag}, ['start', 'playing'])}, drawing: {type: ['object', 'null'], additionalProperties: true}, editor: object({preferences: preferenceSnapshot}, ['preferences'])}, ['document', 'editorKey', 'expectedRevision', 'contextId', 'sequence', 'visible', 'editing'])), visibility: ['app']},
  {...tool('document.visual_ack', 'Return a visual observation', "Supplies the editor's rendered observation for an exact pending visual request.", 'write', object({document, editorKey, expectedRevision: revision, visualId: ref, fact: visualFact}, ['document', 'editorKey', 'expectedRevision', 'visualId', 'fact'])), visibility: ['app']},
  {...tool('document.export_ack', 'Return an exported file', "Supplies the open editor's standalone page, Word or PDF file for an exact pending export request.", 'write', object({document, editorKey, expectedRevision: revision, exportId: ref, fact: exportFact}, ['document', 'editorKey', 'expectedRevision', 'exportId', 'fact'])), visibility: ['app']},
  {...tool('document.material_ack', 'Return prepared material', "Supplies private rendered pixels or a material sample and resumes the authorized operation; prepared drawing or Undo may then commit.", 'write', object({document, editorKey, expectedRevision: revision, materialId: ref,
    fact: object({kind: {type: 'string', const: 'material'}, documentId: string(256), revision, job: {...string(64), pattern: '^[a-f0-9]{64}$'}, outcome: {type: 'string', enum: ['ok', 'refused']}, value: record, reason: string(128)}, ['kind', 'documentId', 'revision', 'job', 'outcome'])}, ['document', 'editorKey', 'expectedRevision', 'materialId', 'fact'])), visibility: ['app']},
  {...tool('document.editor_ack', 'Return an editor receipt', "Records the editor's receipt for one exact preference or device request, including the person's later choice of a preference.", 'write', object({document, editorKey, expectedRevision: revision, editorId: ref, fact: editorFact}, ['document', 'editorKey', 'expectedRevision', 'editorId', 'fact'])), visibility: ['app']},
  {...tool('document.human_message', 'Send the person\'s message', "Carries the words the person typed in the agent row, with the selection or drawing they pointed at and its revision, to the connected agent: a waiting ask returns them, otherwise the agent's next read. Never written into the document.", 'write', object({document, editorKey, text: {...string(2000), minLength: 1}, referent: {type: ['object', 'null'], additionalProperties: true}}, ['document', 'editorKey', 'text'])), visibility: ['app']},
  {...tool('document.view_ack', 'Acknowledge editor presentation', "Records whether the editor presented or refused a requested passage or difference, and when a shown pointer ends.", 'write', object({document, editorKey, expectedRevision: revision, viewId: ref, status: {type: 'string', enum: ['presented', 'refused', 'expired']}, reason: string(160)}, ['document', 'editorKey', 'expectedRevision', 'viewId', 'status'])), visibility: ['app']},
  {...tool('document.rotate_capability', 'Disconnect agents', "Revokes existing agent access to the workspace when the person disconnects agents, preserving its content, history and collaboration controls. The replacement document value returns sealed to the editor, which shares it again when the person chooses; every paired browser but the one asking is unpaired.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
  tool('editor.pair', 'Pair a browser', 'Submit the person-provided browser code. Owner approval and target-browser ALLOW remain human decisions; see the device guide.', 'destructive', object({document, code: {...string(4), pattern: '^[A-Za-z]{4}$'}}, ['document', 'code'])),
  {...tool('document.pair_status', 'Manage browser pairing', "Returns pairing state or collects allow/cancel. Owner approval and the target browser's allow are required before issuing browser access; polling grants no session.", 'destructive', object({document, decision: {type: 'string', enum: ['allow', 'cancel']}}, ['document'])), visibility: ['app']},
  {...tool('document.delete', 'Delete this workspace', "Permanently deletes the workspace and its history when the person chooses Delete in the editor.", 'destructive', object({document, editorKey}, ['document', 'editorKey'])), visibility: ['app']},
]);

export const getTool = name => TOOLS.find(entry => entry.name === name) || HOST_TOOLS.find(entry => entry.name === name);
export const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 6h3v8M5.5 14h6M8.5 9.5C8.5 7.3 10 6 12.3 6h2.2v1.5"/></svg>';
export const ICONS = Object.freeze([{src: 'data:image/svg+xml;base64,' + btoa(MARK), mimeType: 'image/svg+xml', sizes: ['any']}]);

export { validateInput };
