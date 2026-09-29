// The engine's shared-state ratchet and the satellites' explicit-input boundary.
// This is a source ownership gate, not a runtime sandbox or a whole-program alias analysis.
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import acorn from '../agent/vendor/acorn.mjs';
import {censusSource, lexicalBindings} from './engine-census.mjs';
import {scanSinksAST} from './check-sinks-ast.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMITS = ['mutableRoots', 'domSinks', 'storageKeys', 'remainderBytes'];
const GLOBAL_NAMES = new Set(['globalThis', 'window', 'self']);
const UNKNOWN = Symbol('unknown');

export function measureEngineOwnership(source, {root = ROOT} = {}) {
	const census = censusSource(source, 'editor/engine.js', 'script', {root});
	if (census.moduleProblems.length) throw new Error(census.moduleProblems.join('\n'));
	const roots = census.state.mutableRoots.map(({id, name}) => ({id, name})).sort((a, b) => a.id.localeCompare(b.id));
	const storageKeys = census.storage.distinctKeys;
	return {numbers: {mutableRoots: roots.length, domSinks: scanSinksAST(source, 'script').sinks.length,
		storageKeys: storageKeys.length, remainderBytes: census.owners['(top level)'].bytes}, roots, storageKeys};
}

export function tightenOwnershipRecord(record, measurement) {
	const problems = [];
	if (record?.version !== 1 || !record.limits || !record.engineRoots) throw new Error('Invalid engine ownership record.');
	for (const key of LIMITS) if (!Number.isSafeInteger(record.limits[key]) || record.limits[key] < 0)
		throw new Error(`Invalid ownership limit: ${key}`);
	if (Object.keys(record.engineRoots).length !== record.limits.mutableRoots)
		throw new Error('Ownership root count disagrees with the named root allow-list.');
	for (const [id, entry] of Object.entries(record.engineRoots)) if (!entry?.name || typeof entry.reason !== 'string' || entry.reason.trim().length < 20)
		throw new Error(`Engine root ${id} needs its named ownership rationale.`);
	const unknown = measurement.roots.filter(row => !Object.hasOwn(record.engineRoots, row.id));
	if (unknown.length) problems.push(`New mutable roots: ${unknown.map(row => `${row.name} (${row.id})`).join(', ')}. Name the owning seam before admission.`);
	for (const key of LIMITS) if (measurement.numbers[key] > record.limits[key])
		problems.push(`${key}: ${measurement.numbers[key]} exceeds ${record.limits[key]}`);
	if (problems.length) return {problems, record, changed: false};
	const changed = LIMITS.some(key => measurement.numbers[key] < record.limits[key]);
	if (!changed) return {problems, record, changed: false};
	const next = {...record, limits: {...measurement.numbers}, engineRoots: Object.fromEntries(
		measurement.roots.map(row => [row.id, record.engineRoots[row.id]]))};
	return {problems, record: next, changed: true};
}

export function checkSatelliteSource(source, {file = 'editor/example.mjs', publication = null, root = ROOT} = {}) {
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: file.endsWith('.mjs') ? 'module' : 'script', locations: true});
	const lexical = lexicalBindings(ast), problems = [], seenProblems = new Set();
	const complain = (node, text) => {
		const message = `${file}:${node.loc.start.line}:${node.loc.start.column}: ${text}`;
		if (!seenProblems.has(message)) { seenProblems.add(message); problems.push(message); }
	};
	const constant = (node, seen = new Set()) => {
		if (!node) return UNKNOWN;
		if (node.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof node.value)) return node.value;
		if (node.type === 'TemplateLiteral') {
			let value = node.quasis[0].value.cooked;
			for (let i = 0; i < node.expressions.length; i++) {
				const expression = constant(node.expressions[i], seen);
				if (expression === UNKNOWN) return UNKNOWN;
				value += String(expression) + node.quasis[i + 1].value.cooked;
			}
			return value;
		}
		if (node.type === 'BinaryExpression' && node.operator === '+') {
			const left = constant(node.left, seen), right = constant(node.right, seen);
			return left === UNKNOWN || right === UNKNOWN ? UNKNOWN : left + right;
		}
		if (node.type === 'Identifier') {
			const binding = lexical.bindingAt(node.name, node);
			if (binding?.kind === 'const' && !binding.path.length && !binding.writes.length && !seen.has(binding))
				return constant(binding.init, new Set([...seen, binding]));
		}
		return UNKNOWN;
	};
	const key = node => node.computed ? constant(node.property || node.key) : (node.property || node.key).name ?? (node.property || node.key).value;
	const extend = (origin, property) => property === UNKNOWN || property === null ? origin ? `${origin}.*` : '*' :
		origin === '' && GLOBAL_NAMES.has(String(property)) ? '' : origin ? `${origin}.${property}` : String(property);
	const origins = (node, seen = new Set()) => {
		if (!node) return [];
		if (node.type === 'ChainExpression') return origins(node.expression, seen);
		if (node.type === 'Identifier') {
			const binding = lexical.bindingAt(node.name, node);
			if (!binding) return GLOBAL_NAMES.has(node.name) ? [''] : /^Rapier/.test(node.name) ? [node.name] : [];
			if (seen.has(binding) || ['parameter', 'import', 'function', 'class'].includes(binding.kind)) return [];
			const next = new Set([...seen, binding]);
			return [...new Set([binding.init, ...binding.writes].flatMap(value => origins(value, next)
				.map(origin => binding.path.reduce(extend, origin))))];
		}
		if (node.type === 'MemberExpression') return origins(node.object, seen).map(origin => extend(origin, key(node)));
		if (node.type === 'ConditionalExpression') return [...origins(node.consequent, seen), ...origins(node.alternate, seen)];
		if (node.type === 'LogicalExpression') return [...origins(node.left, seen), ...origins(node.right, seen)];
		if (node.type === 'AssignmentExpression') return origins(node.right, seen);
		if (node.type === 'SequenceExpression') return origins(node.expressions.at(-1), seen);
		return [];
	};
	const hidden = origin => origin === '*' || /^Rapier/.test(origin);
	const inspectPattern = (pattern, from) => {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') return inspectPattern(pattern.left, from);
		if (pattern.type !== 'ObjectPattern') return;
		for (const field of pattern.properties) {
			if (field.type === 'RestElement') { if (from.includes('')) complain(field, 'Implicit global namespace spread; pass the needed value explicitly.'); continue; }
			const next = from.map(origin => extend(origin, key(field)));
			if (next.some(hidden)) complain(field, `Implicit ${next.filter(hidden).join(', ')} read; pass the dependency explicitly.`);
			inspectPattern(field.value, next);
		}
	};
	const namespaceUseIsExplicit = node => {
		let current = node, parent = lexical.parents.get(current);
		while (parent && (parent.type === 'ChainExpression' || parent.type === 'LogicalExpression' ||
			parent.type === 'ConditionalExpression' && parent.test !== current ||
			parent.type === 'SequenceExpression' && parent.expressions.at(-1) === current)) {
			current = parent; parent = lexical.parents.get(current);
		}
		if (parent?.type === 'MemberExpression' && parent.object === current) return true;
		if (parent?.type === 'VariableDeclarator' && parent.init === current) {
			const declaration = lexical.parents.get(parent), container = lexical.parents.get(declaration);
			return container?.type !== 'ExportNamedDeclaration';
		}
		if (parent?.type === 'AssignmentExpression' && parent.right === current &&
			['Identifier', 'ObjectPattern'].includes(parent.left.type)) return true;
		return parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
	};
	for (const node of lexical.nodes) {
		if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ImportExpression' ||
			node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && !lexical.bindingAt('require', node.callee)) {
			const argument = node.source || node.arguments?.[0];
			if (argument) {
				const specifier = constant(argument);
				if (specifier === UNKNOWN) complain(node, 'Unresolved module import; satellite imports must have a static boundary.');
				else if (typeof specifier === 'string' && /^(?:\.|\/|file:)/.test(specifier)) {
					const path = specifier.startsWith('file:') ? fileURLToPath(specifier) : resolve(root, dirname(file), specifier.split(/[?#]/)[0]);
					if (path.replace(/\.m?js$/, '') === resolve(root, 'editor/engine')) complain(node, 'Satellite imports the engine.');
				}
			}
		}
		if (node.type === 'VariableDeclarator') inspectPattern(node.id, origins(node.init));
		if (node.type === 'AssignmentExpression') inspectPattern(node.left, origins(node.right));
		if (node.type !== 'MemberExpression' && !lexical.isReference(node)) continue;
		const resolved = origins(node);
		if (resolved.includes('') && !namespaceUseIsExplicit(node))
			complain(node, 'Implicit global namespace escape; select the needed value or pass it explicitly.');
		const found = resolved.filter(hidden);
		if (!found.length) continue;
		const parent = lexical.parents.get(node);
		// The existing script satellite publishes once; this exempts only that assignment target,
		// never a read of its own global, a nested write, or a compound assignment.
		if (publication && node.type === 'MemberExpression' && parent?.type === 'AssignmentExpression' &&
			parent.left === node && parent.operator === '=' && found.length === 1 && found[0] === publication) continue;
		complain(node, `Implicit ${[...new Set(found)].join(', ')} access; pass the dependency explicitly.`);
	}
	return {problems};
}

export function checkEngineOwnership({root = ROOT, update = true} = {}) {
	const recordPath = resolve(root, 'tools/engine-ownership.json');
	const original = readFileSync(recordPath, 'utf8'), record = JSON.parse(original);
	const measurement = measureEngineOwnership(readFileSync(resolve(root, 'editor/engine.js'), 'utf8'), {root});
	const evaluated = tightenOwnershipRecord(record, measurement);
	// A new ESM satellite is covered on its first day, without an opt-in list that can be omitted.
	const satellites = ['editor/source-store.js', ...['editor/lexer.js'].filter(file => existsSync(resolve(root, file))), ...readdirSync(resolve(root, 'editor'))
		.filter(name => name.endsWith('.mjs')).map(name => `editor/${name}`)].sort();
	const problems = [...evaluated.problems];
	for (const file of satellites) problems.push(...checkSatelliteSource(readFileSync(resolve(root, file), 'utf8'),
		{file, root, publication: file === 'editor/source-store.js' ? 'RapierSourceStore' : file === 'editor/lexer.js' ? 'RapierLexer' : null}).problems);
	// No partial tightening: a failed seam or any raised metric leaves the entire record intact.
	if (problems.length) throw new Error(problems.join('\n'));
	const next = JSON.stringify(evaluated.record, null, 2) + '\n';
	const updated = update && evaluated.changed;
	if (updated) writeFileSync(recordPath, next);
	return {before: record.limits, after: measurement.numbers, roots: measurement.roots.length, satellites, updated};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try { console.log(JSON.stringify({law: 'engine-ownership', ...checkEngineOwnership({update: !process.argv.includes('--check')})})); }
	catch (error) { console.error(error.message); process.exitCode = 1; }
}
