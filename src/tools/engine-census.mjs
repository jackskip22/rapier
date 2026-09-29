// Static ownership census; check-engine-ownership.mjs applies the engine ratchet to this data.
// Owners use the nearest named function, identified by lexical location rather than spelling.
// Anonymous callbacks inherit that reporting owner, but their local bindings are never shared roots.
//   node tools/engine-census.mjs             table + dist/engine-census.json
//   node tools/engine-census.mjs --owners 25  largest exclusive engine owners
import {readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import acorn from '../agent/vendor/acorn.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Same authored directories as tools/html-sinks.mjs -- vendor trees are the libraries' own.
const SCAN_DIRS = ['editor', 'draw', 'layout', 'images', 'interchange', 'agent', 'shell', 'security'];
const SCAN_FILES = ['tools/runtime-loader.js'];
const OWNER_DETAIL_FILE = 'editor/engine.js';
// These exact Acorn comment tokens stand for named, existing module owners in the projection.
// They own only their own marker bytes, never surrounding engine code or arbitrary comments.
const ENGINE_MODULE_SLOTS = Object.freeze({
	RAPIER_SOURCE_STORE_MODULE: 'editor/source-store.js',
	RAPIER_LEXER_MODULE: 'editor/lexer.js',
	RAPIER_COLOUR_MATH_MODULE: 'editor/colour-math.mjs',
	RAPIER_CODE_TOKENS_MODULE: 'editor/code-tokens.mjs',
	RAPIER_PLAIN_PASTE_MODULE: 'editor/plain-paste.mjs',
	RAPIER_SOURCE_FACTS_MODULE: 'editor/source-facts.mjs',
	RAPIER_SEGMENT_MATCHES_MODULE: 'editor/segment-matches.mjs',
	RAPIER_BODY_SEGMENT_SPANS_MODULE: 'editor/segment-matches.mjs',
	RAPIER_INLINE_SOURCE_MODULE: 'editor/inline-source.mjs',
	RAPIER_JOURNAL_LIMITS_MODULE: 'editor/journal-records.mjs',
	RAPIER_JOURNAL_SPLICES_MODULE: 'editor/journal-records.mjs',
	RAPIER_JOURNAL_RECORDS_MODULE: 'editor/journal-records.mjs',
	RAPIER_UNDO_CHAIN_MODULE: 'editor/undo-chain.mjs',
	RAPIER_RECOVERY_POLICY_MODULE: 'editor/recovery-policy.mjs',
	RAPIER_RENDERED_EDITS_MODULE: 'editor/rendered-edits.mjs',
	RAPIER_EXCERPT_SOURCE_MODULE: 'editor/excerpt-source.mjs',
	RAPIER_VISIBLE_SOURCE_MODULE: 'editor/visible-source.mjs',
	RAPIER_SOURCE_FACT_INDEX_MODULE: 'editor/source-facts.mjs',
	RAPIER_DOCUMENT_CHECKS_MODULE: 'editor/document-checks.mjs',
	RAPIER_SOURCE_TOKEN_FACTS_MODULE: 'editor/source-facts.mjs',
	RAPIER_SOURCE_FINALIZE_BLOCKS_MODULE: 'editor/source-facts.mjs',
});

function* sourceFiles() {
	for (const dir of SCAN_DIRS) {
		const stack = [join(ROOT, dir)];
		while (stack.length) {
			const current = stack.pop();
			for (const name of readdirSync(current).sort()) {
				const path = join(current, name);
				if (statSync(path).isDirectory()) { if (name !== 'vendor' && name !== 'node_modules') stack.push(path); continue; }
				if (/\.(?:js|mjs)$/.test(name)) yield path;
			}
		}
	}
	for (const file of SCAN_FILES) yield join(ROOT, file);
}

// ---- named-function attribution; same shape as the sink census, lexical identities added ----
const propertyName = node => node.computed ? literalString(node.property) : node.property.name;
const isHtmlMime = node => /^text\/html$/i.test(literalString(node) || '');

function ownerName(ancestors) {
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const node = ancestors[index];
		if (FN_TYPES.has(node.type) && functionSelfName(node, ancestors[index - 1])) return functionOwnerId(node, ancestors[index - 1]);
	}
	return '(top level)';
}
// Same rule, applied directly to a function node + its immediate parent, to name *that* function
// (rather than find the function enclosing some other node) -- used to size owners in bytes.
function functionSelfName(node, parent) {
	if (node.id?.name) return node.id.name;
	if (!parent) return null;
	if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
	if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type)) return parent.computed ? literalString(parent.key) : parent.key.name || String(parent.key.value);
	if (parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier') return parent.left.name;
	if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression') return propertyName(parent.left);
	return null;
}

function functionOwnerId(node, parent) {
	return `${functionSelfName(node, parent)}@${node.loc.start.line}:${node.loc.start.column}`;
}

// Lexical bindings are shared by the census and satellite gate. Declarations are collected before
// references resolve, so a later local declaration still shadows an outer binding. This is syntax
// analysis, not execution or interprocedural alias inference.
function lexicalBindings(ast) {
	const scopes = new WeakMap(), parents = new WeakMap(), declarations = new WeakSet();
	const bindings = [], nodes = [], root = {kind: 'program', parent: null, bindings: new Map(), top: true, path: 'module', wrappers: 0};
	const makeScope = (kind, parent, top = false) => ({kind, parent, bindings: new Map(), top,
		path: top ? `${parent.path}/iife${++parent.wrappers}` : `${parent.path}/${kind}`, wrappers: 0});
	function declare(pattern, scope, kind, init = null, path = []) {
		if (!pattern) return;
		if (pattern.type === 'Identifier') {
			declarations.add(pattern);
			let binding = scope.bindings.get(pattern.name);
			if (!binding) {
				binding = {name: pattern.name, kind, scope, line: pattern.loc.start.line, init, path, writes: []};
				scope.bindings.set(pattern.name, binding); bindings.push(binding);
			}
			return;
		}
		if (pattern.type === 'AssignmentPattern') return declare(pattern.left, scope, kind, init, path);
		if (pattern.type === 'RestElement') return declare(pattern.argument, scope, kind, null);
		if (pattern.type === 'ObjectPattern') for (const field of pattern.properties) {
			if (field.type === 'RestElement') declare(field.argument, scope, kind, null);
			else declare(field.value, scope, kind, init, [...path, field.computed ? literalString(field.key) : field.key.name ?? String(field.key.value)]);
		}
		if (pattern.type === 'ArrayPattern') pattern.elements.forEach((value, i) => declare(value, scope, kind, init, [...path, String(i)]));
	}
	function visit(node, parent, scope) {
		if (!node?.type) return;
		parents.set(node, parent); nodes.push(node);
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') declare(node.id, scope, node.type === 'FunctionDeclaration' ? 'function' : 'class');
		if (FN_TYPES.has(node.type)) {
			const wrapper = !node.id && parent?.type === 'CallExpression' && parent.callee === node && scope.top;
			scope = makeScope('function', scope, wrapper);
			if (node.type === 'FunctionExpression' && node.id) declare(node.id, scope, 'function');
			for (const parameter of node.params) declare(parameter, scope, 'parameter');
		} else if (node.type === 'BlockStatement' && !FN_TYPES.has(parent?.type) ||
			['ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement', 'CatchClause', 'ClassExpression', 'StaticBlock'].includes(node.type)) {
			scope = makeScope(node.type === 'CatchClause' ? 'catch' : 'block', scope);
			if (node.type === 'CatchClause') declare(node.param, scope, 'parameter');
			if (node.type === 'ClassExpression') declare(node.id, scope, 'class');
		}
		scopes.set(node, scope);
		if (node.type === 'VariableDeclaration') {
			let target = scope;
			if (node.kind === 'var') while (target.parent && !['function', 'program'].includes(target.kind)) target = target.parent;
			for (const row of node.declarations) declare(row.id, target, node.kind, row.init);
		}
		if (node.type === 'ImportDeclaration') for (const item of node.specifiers) declare(item.local, scope, 'import');
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) { for (const child of value) if (child?.type) visit(child, node, scope); }
			else if (value?.type) visit(value, node, scope);
		}
	}
	visit(ast, null, root);
	const bindingAt = (name, node) => {
		for (let scope = scopes.get(node); scope; scope = scope.parent) if (scope.bindings.has(name)) return scope.bindings.get(name);
		return null;
	};
	for (const node of nodes) if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier')
		bindingAt(node.left.name, node)?.writes.push(node.right);
	const isReference = node => {
		if (node.type !== 'Identifier' || declarations.has(node)) return false;
		const parent = parents.get(node);
		if ((parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
			(['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type) && parent.key === node && !parent.computed && (!parent.shorthand || parent.value !== node)) ||
			(['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent?.type) && parent.label === node) ||
			(parent?.type === 'ExportSpecifier' && parent.exported === node && parent.local !== node) ||
			(parent?.type?.startsWith('Import') && parent.type !== 'ImportExpression')) return false;
		return true;
	};
	return {ast, nodes, scopes, parents, bindings, bindingAt, isReference};
}

// ---- the HTML sink law's lists, copied (not imported) ----
const SINK_PROPERTIES = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const SINK_CALLS = new Set(['insertAdjacentHTML', 'write', 'writeln', 'createContextualFragment']);

const DOM_QUERY_METHODS = new Set(['querySelector', 'querySelectorAll', 'getElementById']);
const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem']);
const STORAGE_OBJECTS = new Set(['localStorage', 'sessionStorage']);
const TIMER_CALLS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']);
const NETWORK_NEW = new Set(['XMLHttpRequest', 'WebSocket', 'EventSource']);
const WORKER_NEW = new Set(['Worker', 'SharedWorker']);
const PICKER_METHODS = new Set(['showSaveFilePicker', 'showOpenFilePicker']);
const MUTATOR_METHODS = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const OBJECT_MUTATORS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf', 'deleteProperty', 'set']);
const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function literalString(node) {
	const scalar = value => {
		if (!value) return undefined;
		if (value.type === 'Literal' && ['string', 'number'].includes(typeof value.value)) return value.value;
		if (value.type === 'TemplateLiteral' && !value.expressions.length) return value.quasis[0].value.cooked;
		if (value.type === 'BinaryExpression' && value.operator === '+') {
			const left = scalar(value.left), right = scalar(value.right);
			if (left !== undefined && right !== undefined) return left + right;
		}
		return undefined;
	};
	const value = scalar(node);
	return value === undefined ? null : String(value);
}

// One walk over a file's AST. Emits `hits` (one entry per thing found, tagged with its owner) plus
// lexical root candidates and function extents used for shared state and exclusive byte sizes.
function scanFile(source, sourceType, file = OWNER_DETAIL_FILE, {root = ROOT} = {}) {
	const comments = [];
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType, locations: true, allowReturnOutsideFunction: true, onComment: comments});
	const lexical = lexicalBindings(ast);
	const hits = [];
	const letVarNames = new Map(); // lexical root id -> declaration
	const objectRootCandidates = new Map(); // const/function/class id -> declaration; only observed mutations qualify
	const extents = []; // {name, start, end, startLine, endLine} for byte/line sizing of named functions

	const push = (category, kind, key, owner, line) => hits.push({category, kind, key, owner, line});
	const rootId = binding => `${binding.name}@${binding.scope.path}`;
	for (const binding of lexical.bindings) if (binding.scope.top) {
		const info = {name: binding.name, kind: binding.kind, line: binding.line, binding};
		if (binding.kind === 'let' || binding.kind === 'var') letVarNames.set(rootId(binding), info);
		else if (binding.kind === 'const' || binding.kind === 'function' || binding.kind === 'class') objectRootCandidates.set(rootId(binding), info);
	}
	const rootOf = (expression, seen = new Set()) => {
		let current = expression;
		while (current?.type === 'MemberExpression' || current?.type === 'ChainExpression') current = current.object || current.expression;
		if (current?.type !== 'Identifier') return null;
		const binding = lexical.bindingAt(current.name, current);
		if (!binding || seen.has(binding)) return null;
		seen.add(binding);
		// A const alias cannot be rebound. Resolve its object/member initializer to the first owner;
		// let aliases are intentionally not inferred, because their assignment order is not modeled.
		if (binding.kind === 'const' && !binding.writes.length && ['Identifier', 'MemberExpression'].includes(binding.init?.type)) {
			const aliased = rootOf(binding.init, seen);
			if (aliased) return aliased;
		}
		return binding.scope.top && (letVarNames.has(rootId(binding)) || objectRootCandidates.has(rootId(binding))) ? binding : null;
	};
	const recordMutation = (target, owner, line, direct = false) => {
		const binding = direct ? lexical.bindingAt(target.name, target) : rootOf(target);
		if (!binding) return;
		const id = rootId(binding);
		if (direct ? letVarNames.has(id) : letVarNames.has(id) || objectRootCandidates.has(id)) push('stateMutation', id, id, owner, line);
	};


	const globalName = (node, seen = new Set()) => {
		if (node?.type === 'Identifier') {
			const binding = lexical.bindingAt(node.name, node);
			if (!binding) return node.name;
			if (binding.kind === 'const' && !binding.path.length && !binding.writes.length && !seen.has(binding))
				return globalName(binding.init, new Set([...seen, binding]));
		}
		if (node?.type === 'MemberExpression' && ['globalThis', 'window', 'self'].includes(globalName(node.object, seen))) return propertyName(node);
		return null;
	};

	const walk = (node, ancestors) => {
		if (!node || typeof node.type !== 'string') return;
		const here = [...ancestors, node];
		const parent = ancestors[ancestors.length - 1];
		const owner = () => ownerName(ancestors);

		if (FN_TYPES.has(node.type)) {
			const name = functionSelfName(node, parent);
			if (name) extents.push({name, id: functionOwnerId(node, parent), start: node.start, end: node.end, startLine: node.loc.start.line, endLine: node.loc.end.line});
		}

		if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression' || node.type === 'UnaryExpression' && node.operator === 'delete') {
			const target = node.type === 'AssignmentExpression' ? node.left : node.argument;
			if (target.type === 'Identifier') recordMutation(target, owner(), node.loc.start.line, true);
			else if (target.type === 'MemberExpression') recordMutation(target, owner(), node.loc.start.line);
			else if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern') {
				const visitTarget = item => {
					if (!item) return;
					if (item.type === 'Identifier') recordMutation(item, owner(), node.loc.start.line, true);
					else if (item.type === 'MemberExpression') recordMutation(item, owner(), node.loc.start.line);
					else if (item.type === 'AssignmentPattern') visitTarget(item.left);
					else if (item.type === 'RestElement') visitTarget(item.argument);
					else if (item.type === 'ObjectPattern') for (const field of item.properties) visitTarget(field.value || field.argument);
					else if (item.type === 'ArrayPattern') for (const value of item.elements) visitTarget(value);
				};
				visitTarget(target);
			}
		}

		if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && SINK_PROPERTIES.has(propertyName(node.left))) {
			push('domSink', propertyName(node.left), propertyName(node.left), owner(), node.loc.start.line);
		}

		if (node.type === 'CallExpression') {
			const callee = node.callee;
			if (callee.type === 'MemberExpression') {
				const name = propertyName(callee);
				if (MUTATOR_METHODS.has(name)) recordMutation(callee.object, owner(), node.loc.start.line);
				if (callee.object.type === 'Identifier' && ['Object', 'Reflect'].includes(callee.object.name) &&
					!lexical.bindingAt(callee.object.name, callee.object) && OBJECT_MUTATORS.has(name) && node.arguments[0])
					recordMutation(node.arguments[0], owner(), node.loc.start.line);
				if (SINK_CALLS.has(name) && (name !== 'write' && name !== 'writeln' || callee.object.type === 'Identifier' && callee.object.name === 'document')) push('domSink', name, name, owner(), node.loc.start.line);
				if (name === 'parseFromString' && isHtmlMime(node.arguments[1])) push('domSink', 'parseFromString', 'parseFromString', owner(), node.loc.start.line);

				if (DOM_QUERY_METHODS.has(name)) {
					const sel = literalString(node.arguments[0]);
					if (sel !== null) push('domReach', name, sel, owner(), node.loc.start.line);
				}

				if (STORAGE_OBJECTS.has(globalName(callee.object)) && STORAGE_METHODS.has(name)) {
					const key = literalString(node.arguments[0]);
					if (key !== null) push('storage', `${globalName(callee.object)}.${name}`, key, owner(), node.loc.start.line);
				}
				if (globalName(callee.object) === 'indexedDB' && name === 'open') {
					const key = literalString(node.arguments[0]);
					if (key !== null) push('storage', 'indexedDB.open', key, owner(), node.loc.start.line);
				}

				if (!callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'navigator' && name === 'sendBeacon') push('network', 'navigator.sendBeacon', 'navigator.sendBeacon', owner(), node.loc.start.line);
				if (!callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'scheduler' && (name === 'yield' || name === 'postTask')) push('timer', `scheduler.${name}`, `scheduler.${name}`, owner(), node.loc.start.line);

				if (name === 'addEventListener' && !callee.computed) {
					const target = source.slice(callee.object.start, callee.object.end).replace(/\s+/g, ' ');
					const event = literalString(node.arguments[0]) ?? '(dynamic)';
					push('listener', target, `${target}:${event}`, owner(), node.loc.start.line);
				}

				if (!callee.computed && name === 'postMessage' && callee.object.type === 'MemberExpression' && !callee.object.computed
					&& callee.object.property.name === 'parent' && callee.object.object.type === 'Identifier' && callee.object.object.name === 'window') {
					push('bridge', 'window.parent.postMessage', 'window.parent.postMessage', owner(), node.loc.start.line);
				}
				if (!callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'window' && PICKER_METHODS.has(name)) {
					push('bridge', name, name, owner(), node.loc.start.line);
				}
			} else if (callee.type === 'Identifier') {
				if (callee.name === 'fetch') push('network', 'fetch', 'fetch', owner(), node.loc.start.line);
				if (callee.name === 'importScripts') push('worker', 'importScripts', 'importScripts', owner(), node.loc.start.line);
				if (TIMER_CALLS.has(callee.name)) push('timer', callee.name, callee.name, owner(), node.loc.start.line);
				if (PICKER_METHODS.has(callee.name)) push('bridge', callee.name, callee.name, owner(), node.loc.start.line);
			}
		}

		if (node.type === 'NewExpression' && node.callee.type === 'Identifier') {
			if (NETWORK_NEW.has(node.callee.name)) push('network', node.callee.name, node.callee.name, owner(), node.loc.start.line);
			if (WORKER_NEW.has(node.callee.name)) push('worker', node.callee.name, node.callee.name, owner(), node.loc.start.line);
		}

		if (node.type === 'MemberExpression' && globalName(node.object) === 'RapierStorage' && propertyName(node) !== null)
			push('storage', 'RapierStorage', propertyName(node), owner(), node.loc.start.line);
		if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
			if (node.object.type === 'Identifier' && node.object.name === 'RapierPlatform') push('bridge', 'RapierPlatform', `RapierPlatform.${node.property.name}`, owner(), node.loc.start.line);
			if (node.object.type === 'Identifier' && node.object.name === 'globalThis' && /^Rapier[A-Z]/.test(node.property.name)) push('bridge', 'globalThis.Rapier*', `globalThis.${node.property.name}`, owner(), node.loc.start.line);
			if (node.object.type === 'MemberExpression' && !node.object.computed && node.object.property.name === 'clipboard'
				&& node.object.object.type === 'Identifier' && node.object.object.name === 'navigator') {
				push('bridge', 'navigator.clipboard', `navigator.clipboard.${node.property.name}`, owner(), node.loc.start.line);
			}
		}

		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'type') continue;
			const value = node[key];
			if (Array.isArray(value)) { for (const item of value) if (item && typeof item.type === 'string') walk(item, here); }
			else if (value && typeof value.type === 'string') walk(value, here);
		}
	};
	walk(ast, []);
	const moduleProblems = [];
	if (file === OWNER_DETAIL_FILE) for (const [slot, module] of Object.entries(ENGINE_MODULE_SLOTS)) {
		const markers = comments.filter(row => row.type === 'Block' && source.slice(row.start, row.end) === `/* ${slot} */`);
		if (!markers.length) continue;
		if (markers.length !== 1) { moduleProblems.push(`Duplicate module slot ${slot}`); continue; }
		if (!existsSync(join(root, module))) { moduleProblems.push(`Module slot ${slot} has no ${module}`); continue; }
		const marker = markers[0], name = `module:${module}`;
		extents.push({name, id: name, start: marker.start, end: marker.end, startLine: marker.loc.start.line, endLine: marker.loc.end.line, module});
	}
	return {hits, letVarNames, objectRootCandidates, extents, lexical, moduleProblems, comments};
}

// Exclusive byte/line sizing: named function extents nest cleanly (JS scoping never partially
// overlaps), so a stack sweep gives each extent's own size with nested named functions' sizes
// subtracted -- consistent with hits inside a nested named function being attributed to that
// nested function, not to everything enclosing it.
function exclusiveSizes(extents, spanOf) {
	const sorted = extents.map((e, i) => ({...e, _i: i})).sort((a, b) => a.start - b.start || b.end - a.end);
	const out = new Array(sorted.length).fill(0);
	const stack = [];
	const close = entry => {
		const size = spanOf(entry.ext) - entry.childTotal;
		out[entry.ext._i] = size;
		if (stack.length) stack[stack.length - 1].childTotal += spanOf(entry.ext);
	};
	for (const ext of sorted) {
		while (stack.length && stack[stack.length - 1].ext.end <= ext.start) close(stack.pop());
		stack.push({ext, childTotal: 0});
	}
	while (stack.length) close(stack.pop());
	return sorted.map(ext => ({name: ext.id, bytes: out[ext._i]}));
}

const CATEGORY_ORDER = ['stateMutation', 'domSink', 'domReach', 'storage', 'network', 'timer', 'worker', 'listener', 'bridge'];
function emptyCounts() { return Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0])); }

function censusSource(source, file = OWNER_DETAIL_FILE, sourceType = file.endsWith('.mjs') ? 'module' : 'script', {root = ROOT} = {}) {
	const bytes = Buffer.byteLength(source, 'utf8');
	const lines = source.split('\n').length;
	const {hits, letVarNames, objectRootCandidates, extents, moduleProblems, comments} = scanFile(source, sourceType, file, {root});

	const byCategory = {};
	for (const c of CATEGORY_ORDER) byCategory[c] = {total: 0, byKey: new Map(), byOwner: new Map()};
	for (const h of hits) {
		const bucket = byCategory[h.category];
		bucket.total++;
		const keyId = `${h.kind}::${h.key}`;
		bucket.byKey.set(keyId, (bucket.byKey.get(keyId) || 0) + 1);
		bucket.byOwner.set(h.owner, (bucket.byOwner.get(h.owner) || 0) + 1);
	}

	const rootMutations = byCategory.stateMutation.byKey; // key is "root::root" since kind===key for stateMutation
	const objectRoots = [...objectRootCandidates.entries()].map(([id, info]) => ({
		id, name: info.name, line: info.line, mutationCount: rootMutations.get(`${id}::${id}`) || 0,
	}));
	const topLevelDecls = [...letVarNames.entries()].map(([id, info]) => ({id, name: info.name, kind: info.kind, line: info.line}));

	// Per-owner byte/line sizes (only meaningful where extents exist -- i.e. named functions).
	// Acorn's offsets count UTF-16 code units. Owners, like whole files, are sized in UTF-8 bytes.
	const byteSizes = exclusiveSizes(extents, e => Buffer.byteLength(source.slice(e.start, e.end), 'utf8'));
	// Each physical line belongs once: to the innermost owner at its first non-whitespace
	// character (a blank line uses its start). Unlike inclusive-span subtraction this is additive.
	const anchors = [];
	let lineStart = 0;
	for (const line of source.split('\n')) {
		const first = line.search(/\S/);
		anchors.push(lineStart + Math.max(0, first)); lineStart += line.length + 1;
	}
	const before = offset => {
		let lo = 0, hi = anchors.length;
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (anchors[mid] < offset) lo = mid + 1; else hi = mid; }
		return lo;
	};
	const lineSizes = exclusiveSizes(extents, e => before(e.end) - before(e.start));
	const ownerBytes = new Map(), ownerLines = new Map();
	for (const s of byteSizes) ownerBytes.set(s.name, (ownerBytes.get(s.name) || 0) + s.bytes);
	for (const s of lineSizes) ownerLines.set(s.name, (ownerLines.get(s.name) || 0) + s.bytes);
	const namedBytes = [...ownerBytes.values()].reduce((a, b) => a + b, 0);
	const namedLines = [...ownerLines.values()].reduce((a, b) => a + b, 0);

	let owners = null;
	if (file === OWNER_DETAIL_FILE) {
		owners = new Map();
		const labels = new Map(extents.map(row => [row.id, row]));
		const ensure = name => { if (!owners.has(name)) owners.set(name, {name: labels.get(name)?.name || name, line: labels.get(name)?.startLine || 1, bytes: ownerBytes.get(name) || 0, lines: ownerLines.get(name) || 0, counts: emptyCounts()}); return owners.get(name); };
		for (const name of ownerBytes.keys()) ensure(name);
		for (const h of hits) ensure(h.owner).counts[h.category]++;
		// Top-level comments are prose about owners, and the blank lines and line ends between
		// declarations are layout, not unowned code: a paragraph explaining a seam or a blank line
		// under it must never move the ownership ratchet (R76, lanes P and S tripped it). Both are
		// counted beside the remainder, never inside it; a comment inside a function stays that owner's.
		const mask = new Uint8Array(source.length + 1);
		for (const e of extents) mask.fill(1, e.start, e.end);
		for (const c of comments) if (!mask[c.start]) mask.fill(2, c.start, c.end);
		let topLevelCommentBytes = 0, topLevelBlankBytes = 0, offset = 0;
		for (const character of source) {
			if (mask[offset] === 2) topLevelCommentBytes += Buffer.byteLength(character);
			else if (mask[offset] === 0 && /\s/.test(character)) topLevelBlankBytes += character.length;
			offset += character.length;
		}
		ensure('(top level)').bytes = bytes - namedBytes - topLevelCommentBytes - topLevelBlankBytes;
		ensure('(top level)').lines = lines - namedLines;
		ensure('(top level)').commentBytes = topLevelCommentBytes;
		ensure('(top level)').blankBytes = topLevelBlankBytes;
	}

	return {
		file, bytes, lines, moduleProblems,
		state: {
			topLevelDecls, topLevelDeclCount: topLevelDecls.length,
			objectRoots, objectRootCandidateCount: objectRoots.length,
			mutatedObjectRootCount: objectRoots.filter(r => r.mutationCount > 0).length,
			totalMutationCount: byCategory.stateMutation.total,
			mutableRoots: [...topLevelDecls, ...objectRoots.filter(row => row.mutationCount > 0)],
			mutableRootCount: topLevelDecls.length + objectRoots.filter(row => row.mutationCount > 0).length,
		},
		domSinks: {total: byCategory.domSink.total, byKind: keyCounts(byCategory.domSink)},
		domReach: {total: byCategory.domReach.total, bySelector: keyCounts(byCategory.domReach)},
		storage: {total: byCategory.storage.total, byKey: keyCounts(byCategory.storage),
			distinctKeys: [...new Set(hits.filter(row => row.category === 'storage').map(row => `${row.kind.split('.')[0]}:${row.key}`))].sort()},
		network: {total: byCategory.network.total, byKind: keyCounts(byCategory.network)},
		timers: {total: byCategory.timer.total, byKind: keyCounts(byCategory.timer)},
		workers: {total: byCategory.worker.total, byKind: keyCounts(byCategory.worker)},
		listeners: {total: byCategory.listener.total, byRoot: keyCounts(byCategory.listener)},
		bridge: {total: byCategory.bridge.total, byKind: keyCounts(byCategory.bridge)},
		owners: owners ? Object.fromEntries([...owners.entries()].sort((a, b) => a[0].localeCompare(b[0]))) : undefined,
		_rawHits: hits, // used to build the cross-file storage/listener/bridge indexes; stripped before writing
	};
}
function censusFile(absPath) {
	return censusSource(readFileSync(absPath, 'utf8'), relative(ROOT, absPath).split('\\').join('/'));
}
function keyCounts(bucket) {
	const out = {};
	for (const [keyId, count] of bucket.byKey) { const key = keyId.slice(keyId.indexOf('::') + 2); out[key] = (out[key] || 0) + count; }
	return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function buildCensus() {
	const files = [...sourceFiles()].map(censusFile);

	const storageKeys = [];
	const listenerRoots = [];
	const bridgeCalls = [];
	for (const f of files) {
		const tally = (category, mapOut) => {
			const seen = new Map();
			for (const h of f._rawHits) if (h.category === category) {
				const id = `${h.kind}\u0000${h.key}\u0000${h.owner}`;
				seen.set(id, (seen.get(id) || 0) + 1);
			}
			for (const [id, count] of seen) { const [kind, key, owner] = id.split('\u0000'); mapOut.push({file: f.file, kind, key, owner, count}); }
		};
		tally('storage', storageKeys);
		tally('listener', listenerRoots);
		tally('bridge', bridgeCalls);
	}
	for (const f of files) delete f._rawHits;

	storageKeys.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.key.localeCompare(b.key));
	listenerRoots.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
	bridgeCalls.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.key.localeCompare(b.key));

	const totals = emptyCounts();
	let totalBytes = 0, totalLines = 0;
	for (const f of files) {
		totalBytes += f.bytes; totalLines += f.lines;
		totals.stateMutation += f.state.totalMutationCount;
		totals.domSink += f.domSinks.total;
		totals.domReach += f.domReach.total;
		totals.storage += f.storage.total;
		totals.network += f.network.total;
		totals.timer += f.timers.total;
		totals.worker += f.workers.total;
		totals.listener += f.listeners.total;
		totals.bridge += f.bridge.total;
	}

	return {
		scanDirs: SCAN_DIRS, scanFiles: SCAN_FILES,
		fileCount: files.length, totalBytes, totalLines,
		totals,
		files,
		storageKeys, listenerRoots, bridgeCalls,
	};
}

function fmt(n) { return n.toLocaleString('en-US'); }

function printTable(census) {
	const cols = ['file', 'bytes', 'lines', 'state', 'domSink', 'domReach', 'storage', 'network', 'timer', 'worker', 'listener', 'bridge'];
	const rows = census.files.map(f => [
		f.file, f.bytes, f.lines, f.state.totalMutationCount, f.domSinks.total, f.domReach.total,
		f.storage.total, f.network.total, f.timers.total, f.workers.total, f.listeners.total, f.bridge.total,
	]);
	const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
	const line = r => r.map((v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join('  ');
	console.log(line(cols));
	console.log(widths.map(w => '-'.repeat(w)).join('  '));
	for (const r of rows) console.log(line(r));
	const total = ['TOTAL', census.totalBytes, census.totalLines, census.totals.stateMutation, census.totals.domSink, census.totals.domReach, census.totals.storage, census.totals.network, census.totals.timer, census.totals.worker, census.totals.listener, census.totals.bridge];
	console.log(widths.map(w => '='.repeat(w)).join('  '));
	console.log(line(total));
	console.log(`\n${census.fileCount} files, ${fmt(census.totalBytes)} bytes, ${fmt(census.totalLines)} lines scanned across ${SCAN_DIRS.join(', ')} and ${SCAN_FILES.join(', ')}.`);
}

function printOwners(census, n) {
	const engine = census.files.find(f => f.file === OWNER_DETAIL_FILE);
	if (!engine || !engine.owners) { console.error(`${OWNER_DETAIL_FILE} not found in census`); process.exit(1); }
	const owners = Object.entries(engine.owners).filter(([name]) => name !== '(top level)').sort((a, b) => b[1].bytes - a[1].bytes || a[0].localeCompare(b[0]));
	const top = owners.slice(0, n);
	const cols = ['owner', 'bytes', 'lines', 'state', 'domSink', 'domReach', 'storage', 'timer'];
	const rows = top.map(([name, o]) => [name, o.bytes, o.lines, o.counts.stateMutation, o.counts.domSink, o.counts.domReach, o.counts.storage, o.counts.timer]);
	const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
	const line = r => r.map((v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join('  ');
	console.log(`${OWNER_DETAIL_FILE}: ${owners.length} named owners, top ${top.length} by bytes`);
	console.log(line(cols));
	console.log(widths.map(w => '-'.repeat(w)).join('  '));
	for (const r of rows) console.log(line(r));
	const topLevel = engine.owners['(top level)'];
	if (topLevel) console.log(`\n(top level, not ranked as an owner): ${fmt(topLevel.bytes)} bytes, ${fmt(topLevel.lines)} lines, state ${topLevel.counts.stateMutation}, domSink ${topLevel.counts.domSink}, domReach ${topLevel.counts.domReach}, storage ${topLevel.counts.storage}, timer ${topLevel.counts.timer}`);
}

function main() {
	const args = process.argv.slice(2);
	const census = buildCensus();

	const distDir = join(ROOT, 'dist');
	mkdirSync(distDir, {recursive: true});
	writeFileSync(join(distDir, 'engine-census.json'), JSON.stringify(census, null, 2) + '\n');

	const ownersIndex = args.indexOf('--owners');
	if (ownersIndex !== -1) {
		const n = Number(args[ownersIndex + 1]) || 25;
		printOwners(census, n);
	} else {
		printTable(census);
	}
}

// --- Profile seam check (docs/build.md, "Build profiles"): a lint, not a proof. "Guarded" = _rapierDrawPresent() / _rapierJxlEncoderPresent()
// or `typeof <name> === 'function'` earlier in the same function, or inside a try/catch. A guard only in a sibling branch is not seen. ---
const DRAW_UI_FILES = ['draw/draw.js', 'draw/paint-tool.js'];
const DRAW_PAINT_ONLY_GLOBALS = ['RapierDrawPaint', 'RapierDrawBrushes'];
// Every authored file that is bundled in *both* build profiles and could plausibly reach into Draw
// or the image codec -- editor/scripts.json's own list, minus the two Draw/Paint UI files above,
// plus editor/engine.js itself (spliced directly, not through scripts.json).
const ALWAYS_BUNDLED_FILES = ['editor/engine.js', 'editor/info.js', 'editor/tables.js', 'layout/actions.js', 'layout/alignment.js',
	'images/browser.js', 'images/interchange.js', 'layout/browser.js', 'layout/interchange.js',
	'interchange/raster.js', 'interchange/pdf-plugin.js', 'interchange/browser.js', 'editor/source-assets.js', 'agent/browser.js'];
const DRAW_PRESENCE_PREDICATE = '_rapierDrawPresent';
const ENCODER_PRESENCE_PREDICATE = '_rapierJxlEncoderPresent';

function topLevelFunctionNames(source) {
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
	const names = new Set();
	for (const node of ast.body) if (node.type === 'FunctionDeclaration' && node.id?.name) names.add(node.id.name);
	return names;
}

// The text of the nearest enclosing function, from its own start up to (not including) `node` --
// only text that runs *before* our call can possibly guard it. Falls back to the whole file's own
// head when the call sits at top level (module init), which none of the checked calls do today.
function enclosingFunctionTextBefore(source, ancestors, node) {
	for (let index = ancestors.length - 1; index >= 0; index--) {
		if (FN_TYPES.has(ancestors[index].type)) return source.slice(ancestors[index].start, node.start);
	}
	return source.slice(0, node.start);
}

export function checkProfileSeams() {
	const drawSymbols = new Set();
	for (const rel of DRAW_UI_FILES) {
		const source = readFileSync(join(ROOT, rel), 'utf8');
		for (const name of topLevelFunctionNames(source)) drawSymbols.add(name);
	}
	const problems = [];
	let scanned = 0;
	for (const rel of ALWAYS_BUNDLED_FILES) {
		const path = join(ROOT, rel);
		const source = readFileSync(path, 'utf8');
		const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: /\.mjs$/.test(rel) ? 'module' : 'script', locations: true});
		const walk = (node, ancestors) => {
			if (!node || typeof node.type !== 'string') return;
			const here = [...ancestors, node];

			if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && drawSymbols.has(node.callee.name)) {
				scanned++;
				const name = node.callee.name;
				const before = enclosingFunctionTextBefore(source, ancestors, node);
				const guardedByPredicate = before.includes(DRAW_PRESENCE_PREDICATE + '(');
				const guardedByTypeof = new RegExp('typeof\\s+' + name + '\\s*(?:===|!==)\\s*[\'"]function[\'"]').test(before);
				const guardedByTry = ancestors.some(a => a.type === 'TryStatement' && a.handler && node.start >= a.block.start && node.end <= a.block.end);
				if (!guardedByPredicate && !guardedByTypeof && !guardedByTry) {
					problems.push(`${rel}:${node.loc.start.line}: unguarded call to Draw-only \`${name}\` -- add a ${DRAW_PRESENCE_PREDICATE}() or typeof guard`);
				}
			}

			// `<x>.codec('encode', ...)` must be preceded by _rapierJxlEncoderPresent() in its function.
			if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed &&
					node.callee.property.type === 'Identifier' && node.callee.property.name === 'codec' &&
					node.arguments[0] && node.arguments[0].type === 'Literal' && node.arguments[0].value === 'encode') {
				scanned++;
				const before = enclosingFunctionTextBefore(source, ancestors, node);
				if (!before.includes(ENCODER_PRESENCE_PREDICATE + '(')) {
					problems.push(`${rel}:${node.loc.start.line}: unguarded JPEG XL encode call -- add a ${ENCODER_PRESENCE_PREDICATE}() guard`);
				}
			}

			for (const key of Object.keys(node)) {
				if (key === 'loc' || key === 'type') continue;
				const value = node[key];
				if (Array.isArray(value)) { for (const item of value) if (item && typeof item.type === 'string') walk(item, here); }
				else if (value && typeof value.type === 'string') walk(value, here);
			}
		};
		walk(ast, []);

		// RapierDrawPaint/Brushes outside the Draw/Paint UI files must read through optional chaining.
		for (const global of DRAW_PAINT_ONLY_GLOBALS) {
			for (const match of source.matchAll(new RegExp('globalThis\\.' + global + '\\b(\\??\\.)?', 'g'))) {
				scanned++;
				if (match[1] !== '?.') problems.push(`${rel}: unguarded reference to globalThis.${global} (Paint-only, absent in the document profile) -- use ?.`);
			}
		}
	}
	return {problems, scanned};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export {buildCensus, censusSource, scanFile, sourceFiles, lexicalBindings, ENGINE_MODULE_SLOTS};
