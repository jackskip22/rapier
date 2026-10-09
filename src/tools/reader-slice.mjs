// SPDX-License-Identifier: AGPL-3.0-only
// Linking for the reader build. The editor's code is written for one big scope; the reader needs a few of its parts. This file
// reads declarations as units (a function, a class, one declarator of a variable declaration), draws an edge from each unit to
// the units whose names it reads (scope-correct: tools/engine-census.mjs lexicalBindings), and keeps what the roots reach.
// Nothing is copied: the text of a kept unit is the editor's own text at this build, so the reader follows the editor.
import acorn from '../agent/vendor/acorn.mjs';
import {lexicalBindings} from './engine-census.mjs';

const patternNames = pattern => pattern.type === 'Identifier' ? [pattern.name]
	: pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => patternNames(row.value || row.argument))
	: pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(patternNames)
	: pattern.type === 'AssignmentPattern' ? patternNames(pattern.left)
	: pattern.type === 'RestElement' ? patternNames(pattern.argument) : [];

// The units of a list of statements whose names live in `scope`. A statement that declares nothing (an effect) is a unit with
// no name: it is kept only when `keepEffects` says so.
function collectUnits(statements, source, lexical, scope) {
	const units = [], byName = new Map(), byNode = new Map();
	const add = (node, statement, names) => {
		const unit = {node, statement, names, edges: new Set(), reads: new Set(), start: node.start, end: node.end, text: source.slice(node.start, node.end)};
		units.push(unit); byNode.set(node, unit);
		for (const name of names) byName.set(name, unit);
	};
	for (const statement of statements) {
		if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') add(statement, statement, [statement.id.name]);
		else if (statement.type === 'VariableDeclaration') for (const row of statement.declarations) add(row, statement, patternNames(row.id));
		else if (statement.type !== 'EmptyStatement') add(statement, statement, []);
	}
	const free = new Map();
	for (const node of lexical.nodes) {
		if (!lexical.isReference(node)) continue;
		const binding = lexical.bindingAt(node.name, node);
		let at = node, owner = null;
		while (at && !owner) { owner = byNode.get(at) || null; at = lexical.parents.get(at); }
		if (!owner) continue;
		if (binding && binding.scope === scope) { owner.edges.add(byName.get(node.name)); owner.reads.add(node.name); }
		else if (!binding) {
			if (!free.has(node.name)) free.set(node.name, new Set());
			free.get(node.name).add(owner);
		}
	}
	for (const unit of units) unit.edges.delete(undefined);
	return {units, byName, free};
}

// A script whose top-level statements are the units: `iife` when they sit inside one wrapping function (the editor's engine),
// `program` otherwise.
export function scriptUnits(source, {iife = false, file = ''} = {}) {
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script', locations: true});
	const lexical = lexicalBindings(ast);
	let statements = ast.body, scope = null;
	if (iife) {
		const call = ast.body.flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations.map(row => row.init) : [statement.expression])
			.find(node => node?.type === 'CallExpression' && node.callee.type === 'FunctionExpression');
		if (!call) throw new Error(file + ': no wrapping function to read');
		statements = call.callee.body.body; scope = lexical.scopes.get(call.callee);
	} else scope = lexical.scopes.get(ast);
	if (!scope) {
		// Program level: the root scope is the one the first top-level node sits in.
		scope = lexical.scopes.get(ast.body.find(node => lexical.scopes.get(node)));
		while (scope.parent) scope = scope.parent;
	}
	return {file, source, ...collectUnits(statements, source, lexical, scope)};
}

const reach = (roots, skip = () => false) => {
	const seen = new Set();
	const visit = unit => { if (!unit || seen.has(unit) || skip(unit)) return; seen.add(unit); for (const next of unit.edges) visit(next); };
	roots.forEach(visit);
	return seen;
};

// The text of kept units, a variable statement rebuilt from its kept declarators.
function emit(kept, rewrite = () => null) {
	const parts = [], done = new Set();
	for (const unit of kept) {
		const statement = unit.statement;
		if (statement.type !== 'VariableDeclaration') { parts.push(rewrite(unit) ?? unit.text); continue; }
		if (done.has(statement)) continue;
		done.add(statement);
		const rows = kept.filter(other => other.statement === statement);
		parts.push(statement.kind + ' ' + rows.map(row => rewrite(row) ?? row.text).join(', ') + ';');
	}
	return parts.join('\n');
}

// Link `own` (the reader's fragments, one program) against `pools` (editor sources read as units). A name the reader declares
// itself is never taken from a pool. `forbid` names a pool declaration the reader must not reach (the editor's document state
// and interface): reaching one stops the build and says through which unit.
export function link({own, pools, forbid = []}) {
	const ownAst = acorn.parse(own, {ecmaVersion: 'latest', sourceType: 'script', locations: true});
	const ownLexical = lexicalBindings(ownAst);
	const ownScope = ownLexical.scopes.get(ownAst.body[0]) ? (() => { let s = ownLexical.scopes.get(ownAst.body[0]); while (s.parent) s = s.parent; return s; })() : null;
	const ownNames = new Set(ownScope ? ownScope.bindings.keys() : []);
	const index = new Map();
	pools.forEach((pool, order) => { for (const unit of pool.units) { unit.order = order; unit.pool = pool; for (const name of unit.names) if (!ownNames.has(name) && !index.has(name)) index.set(name, unit); } });
	// What the reader reads and does not declare, and the pool names it reaches.
	const roots = new Set(), wanted = new Map();
	for (const node of ownLexical.nodes) {
		if (!ownLexical.isReference(node) || ownLexical.bindingAt(node.name, node)) continue;
		if (index.has(node.name)) { roots.add(index.get(node.name)); if (!wanted.has(node.name)) wanted.set(node.name, true); }
	}
	// Edges inside a pool to a name the reader declares need nothing; an edge to a name another pool declares is resolved here.
	for (const pool of pools) for (const [name, owners] of pool.free) if (!ownNames.has(name) && index.has(name) && index.get(name).pool !== pool) for (const owner of owners) owner.edges.add(index.get(name));
	// A declaration the reader makes itself stands in for the pool's, whoever in the pool reads it.
	const kept = reach(roots, unit => unit.names.some(name => ownNames.has(name)));
	const forbidden = new Set(forbid);
	for (const unit of kept) for (const name of unit.names) if (forbidden.has(name)) {
		const through = [...kept].filter(other => other.edges.has(unit)).map(other => other.names.join(',') || '(statement)');
		throw new Error('Reader link: ' + name + ' (the editor\'s state or interface) is reached through ' + through.slice(0, 6).join(', ') + '. Declare the name in the reader\'s own code or break the edge.');
	}
	const ordered = [...kept].sort((a, b) => a.order - b.order || a.start - b.start);
	// A destructuring that takes many names from a published module keeps the names something reads.
	const readNames = new Set();
	for (const unit of ordered) for (const name of unit.reads) readNames.add(name);
	for (const node of ownLexical.nodes) if (ownLexical.isReference(node) && !ownLexical.bindingAt(node.name, node)) readNames.add(node.name);
	const unresolved = new Set();
	for (const pool of pools) for (const [name, owners] of pool.free) if (!ownNames.has(name) && !index.has(name) && [...owners].some(owner => kept.has(owner))) unresolved.add(name);
	for (const [name] of ownLexical.nodes.filter(node => ownLexical.isReference(node) && !ownLexical.bindingAt(node.name, node)).map(node => [node.name])) if (!index.has(name)) unresolved.add(name);
	const text = emit(ordered, unit => {
		const id = unit.node.type === 'VariableDeclarator' ? unit.node.id : null;
		if (id?.type !== 'ObjectPattern' || !id.properties.every(row => row.type === 'Property' && !row.computed && row.value.type === 'Identifier' || row.type === 'Property' && !row.computed && row.value.type === 'AssignmentPattern')) return null;
		const name = row => (row.value.type === 'AssignmentPattern' ? row.value.left : row.value).name;
		const stay = id.properties.filter(row => readNames.has(name(row)));
		if (stay.length === id.properties.length) return null;
		return '{' + stay.map(row => unit.pool.source.slice(row.start, row.end)).join(', ') + '}' + unit.pool.source.slice(id.end, unit.end);
	});
	return {text, kept: ordered, unresolved: [...unresolved].sort()};
}

// A module whose entry is a factory function (`function create(runtime) {...}`), cut to what `keep` names: the factory's body is
// read as units and the returned object lists only `keep`; the destructuring of the ports lists only the ports the kept units
// read; then the module's own top-level declarations are cut to what the factory reaches. The result is a script fragment that
// declares the factory and what it needs, with no import or export.
export function sliceFactory(source, factoryName, keep, {file = ''} = {}) {
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
	const lexical = lexicalBindings(ast);
	const declaration = ast.body.map(node => node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node)
		.find(node => node.type === 'FunctionDeclaration' && node.id.name === factoryName);
	if (!declaration) throw new Error(file + ': no function ' + factoryName);
	const body = declaration.body.body, last = body.at(-1);
	if (last.type !== 'ReturnStatement' || last.argument.type !== 'ObjectExpression') throw new Error(file + ': ' + factoryName + ' must end by returning an object');
	const scope = lexical.scopes.get(declaration);
	const {units, byName} = collectUnits(body.slice(0, -1), source, lexical, scope);
	const rows = new Map(last.argument.properties.map(row => [row.key.name, row]));
	const returned = new Map([...rows].map(([name, row]) => [name, row.value.type === 'Identifier' ? row.value.name : null]));
	const missing = keep.filter(name => !returned.has(name));
	if (missing.length) throw new Error(file + ': ' + factoryName + ' no longer returns ' + missing.join(', '));
	// A returned value that is an expression (an arrow function) stands as written; what it reads is kept.
	const roots = keep.map(name => returned.get(name) === null ? null : byName.get(returned.get(name))).filter(Boolean);
	for (const name of keep) if (returned.get(name) === null) {
		const value = rows.get(name).value;
		for (const node of lexical.nodes) if (node.start >= value.start && node.end <= value.end && lexical.isReference(node) && lexical.bindingAt(node.name, node)?.scope === scope && byName.has(node.name)) roots.push(byName.get(node.name));
	}
	const kept = reach(roots);
	const byNode = new Map(units.map(unit => [unit.node, unit]));
	const read = new Set();
	for (const node of lexical.nodes) if (lexical.isReference(node)) {
		let at = node, owner = null;
		while (at && !owner) { owner = byNode.get(at) || null; at = lexical.parents.get(at); }
		if (owner && kept.has(owner)) read.add(node.name);
	}
	for (const name of keep) if (returned.get(name) === null) { const value = rows.get(name).value; for (const node of lexical.nodes) if (node.start >= value.start && node.end <= value.end && lexical.isReference(node)) read.add(node.name); }
	const ordered = [...kept].sort((a, b) => a.start - b.start);
	const inner = emit(ordered, unit => {
		if (unit.node.type !== 'VariableDeclarator' || unit.node.id.type !== 'ObjectPattern' || unit.node.init?.name !== 'runtime') return null;
		const props = unit.node.id.properties.filter(row => row.value.type === 'Identifier' && read.has(row.value.name));
		return '{' + props.map(row => source.slice(row.start, row.end)).join(', ') + '} = runtime';
	});
	const results = keep.map(name => returned.get(name) === name ? name : name + ': ' + (returned.get(name) ?? source.slice(rows.get(name).value.start, rows.get(name).value.end)));
	const factory = 'function ' + factoryName + '(runtime) {\n' + inner + '\nreturn {' + results.join(', ') + '};\n}';
	// The module level: what is declared beside the factory, cut to what the factory reaches.
	const outer = [];
	for (const statement of ast.body) {
		const node = statement.type === 'ExportNamedDeclaration' && statement.declaration ? statement.declaration : statement;
		if (statement.type === 'ImportDeclaration') throw new Error(file + ': a module with imports is bundled, not sliced');
		if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) continue;
		outer.push(node);
	}
	const moduleUnits = collectUnits(outer, source, lexical, lexical.scopes.get(ast) || (() => { let s = lexical.scopes.get(outer[0]); while (s.parent) s = s.parent; return s; })());
	const entry = moduleUnits.byName.get(factoryName);
	// Edges of the factory unit come from the sliced body alone.
	entry.edges.clear();
	for (const node of lexical.nodes) if (lexical.isReference(node)) {
		const binding = lexical.bindingAt(node.name, node);
		if (!binding || binding.scope === scope || !moduleUnits.byName.has(node.name)) continue;
		let at = node, owner = null;
		while (at && !owner) { owner = byNode.get(at) || null; at = lexical.parents.get(at); }
		if (owner && kept.has(owner)) entry.edges.add(moduleUnits.byName.get(node.name));
	}
	const keptOuter = [...reach([entry])].sort((a, b) => a.start - b.start);
	return {text: emit(keptOuter, unit => unit === entry ? factory : null), kept: ordered, outer: keptOuter};
}
