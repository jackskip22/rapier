// SPDX-License-Identifier: AGPL-3.0-only
// The reader's module graph: the editor's ES modules, bundled as closures like the full build's `modules[path]` registry, each cut to
// the exports something still reads. Consumers are cut first and their unused imports dropped, so a dependency keeps only what the
// kept code reaches (the full build cuts one level; the reader has no other reader of these modules to serve).
import {readFile} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import acorn from '../agent/vendor/acorn.mjs';
import {shakeModule} from './tree-shake.mjs';
import {lexicalBindings} from './engine-census.mjs';

const parse = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
const patternNames = pattern => pattern.type === 'Identifier' ? [pattern.name]
	: pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => patternNames(row.value || row.argument))
	: pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(patternNames)
	: pattern.type === 'AssignmentPattern' ? patternNames(pattern.left)
	: pattern.type === 'RestElement' ? patternNames(pattern.argument) : [];

// An import specifier whose local name nothing reads goes; an import left with none goes whole (a module with an effect stays
// imported by the caller's graph, never by its names).
function pruneImports(source) {
	const ast = parse(source), lexical = lexicalBindings(ast), read = new Set();
	for (const node of lexical.nodes) if (lexical.isReference(node)) {
		const binding = lexical.bindingAt(node.name, node);
		if (binding && binding.kind === 'import') read.add(binding);
	}
	const edits = [];
	for (const statement of ast.body) if (statement.type === 'ImportDeclaration') {
		const stay = statement.specifiers.filter(row => [...read].some(binding => binding.name === row.local.name));
		if (stay.length === statement.specifiers.length) continue;
		edits.push([statement.start, statement.end, stay.length
			? 'import {' + stay.map(row => source.slice(row.start, row.end)).join(', ') + '} from ' + source.slice(statement.source.start, statement.source.end) + ';' : '']);
	}
	for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end);
	return source;
}

// The names a text reads from a published module: destructured (`const {a, b: c} = globalThis.G`), named (`globalThis.G.a`, `G.a`), or
// named through a local alias (`const spec = globalThis.G; spec.a`). Any other use (the whole object passed on, a computed key, an alias
// used as a value) reads everything, answered with null. An alias is followed by its name alone, wherever the text writes it, so a second
// variable of the same name can only add names, never hide one.
export function readNames(text, global) {
	const ast = acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'script'}), names = new Set(), aliases = new Set();
	let all = false;
	const isGlobal = node => node?.type === 'Identifier' && node.name === global ||
		node?.type === 'MemberExpression' && !node.computed && node.property.name === global && ['globalThis', 'window', 'self'].includes(node.object.name);
	const walk = (node, parent, each) => {
		if (!node || typeof node.type !== 'string') return;
		each(node, parent);
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc') continue;
			if (Array.isArray(value)) value.forEach(child => walk(child, node, each));
			else if (value && typeof value === 'object') walk(value, node, each);
		}
	};
	walk(ast, null, (node, parent) => {
		if (!isGlobal(node)) return;
		if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed) names.add(parent.property.name);
		else if (parent?.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'ObjectPattern' &&
			parent.id.properties.every(row => row.type === 'Property' && !row.computed)) parent.id.properties.forEach(row => names.add(row.key.name ?? row.key.value));
		else if (parent?.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier') aliases.add(parent.id.name);
		else if (parent?.type === 'MemberExpression' && parent.object === node) all = true;
		else if (parent?.type === 'MemberExpression' && (parent.property === node || parent.object.name === 'globalThis')) { /* the walk meets the outer node next */ }
		else all = true;
	});
	if (aliases.size) walk(ast, null, (node, parent) => {
		if (node.type !== 'Identifier' || !aliases.has(node.name)) return;
		if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
		if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed) names.add(parent.property.name);
		else if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
		else if (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return;
		// A presence test reads no name.
		else if (parent?.type === 'UnaryExpression' && ['!', 'typeof'].includes(parent.operator) || parent?.type === 'LogicalExpression' && parent.operator === '&&' && parent.left === node ||
			(parent?.type === 'ConditionalExpression' || parent?.type === 'IfStatement') && parent.test === node) return;
		else all = true;
	});
	return all ? null : names;
}

// entries: {GlobalName: 'path/to/module.mjs'} (the editor's published modules the reader keeps), used: Map<GlobalName, Set|null>
// (what the final script reads from each; null reads all). Returns the registry text and the per-module sizes.
export async function bundleModules({root, entries, used, drop = () => false}) {
	const modules = new Map(), order = [];
	const load = async path => {
		if (modules.has(path)) return modules.get(path);
		const source = await readFile(resolve(root, path), 'utf8'), tree = parse(source);
		const row = {path, source, imports: []};
		modules.set(path, row);
		for (const node of tree.body) if (node.type === 'ImportDeclaration') {
			const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
			row.imports.push(dependency);
			await load(dependency);
		}
		order.push(path);
		return row;
	};
	for (const path of Object.values(entries)) await load(path);
	const globalsOf = new Map(Object.entries(entries).map(([name, path]) => [path, name]));
	const requested = new Map();
	const request = (path, names) => { if (!requested.has(path)) requested.set(path, new Set()); if (names === null) requested.get(path).all = true; else for (const name of names) requested.get(path).add(name); };
	for (const [name, path] of Object.entries(entries)) { const read = used.get(name); if (read === undefined) throw new Error('Reader modules: nothing says what ' + name + ' is read for'); request(path, read); }
	// Consumers first: a module's imports are asked only once it has been cut.
	const exportsOf = source => {
		const ast = parse(source), out = [];
		for (const node of ast.body) if (node.type === 'ExportNamedDeclaration') {
			if (node.declaration) out.push(...(node.declaration.type === 'VariableDeclaration' ? node.declaration.declarations.flatMap(row => patternNames(row.id)) : [node.declaration.id.name]));
			else out.push(...node.specifiers.map(row => row.exported.name));
		}
		return out;
	};
	const cut = new Map();
	for (const path of [...order].reverse()) {
		const row = modules.get(path), ask = requested.get(path) || new Set();
		let source = row.source;
		if (!ask.all) {
			const names = exportsOf(source), dropped = names.filter(name => !ask.has(name));
			if (dropped.length) source = shakeModule(source, dropped).source;
		}
		source = pruneImports(source);
		cut.set(path, source);
		for (const node of parse(source).body) if (node.type === 'ImportDeclaration') {
			const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
			request(dependency, node.specifiers.map(item => item.imported?.name ?? 'default'));
		}
	}
	// Assemble each as a closure, in dependency order.
	const text = [], sizes = {}, blocks = {};
	for (const path of order) {
		const source = cut.get(path), tree = parse(source), changes = [], exported = [];
		for (const node of tree.body) {
			if (node.type === 'ImportDeclaration') {
				const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
				changes.push({start: node.start, end: node.end, text: node.specifiers.length ? 'const {' + node.specifiers.map(item => item.imported.name + ':' + item.local.name).join(',') + '} = modules[' + JSON.stringify(dependency) + '];' : ''});
			} else if (node.type === 'ExportNamedDeclaration') {
				if (node.source) throw new Error('Reader modules: ' + path + ' re-exports from another module; read it from its owner');
				if (node.declaration) {
					const names = node.declaration.type === 'VariableDeclaration' ? node.declaration.declarations.flatMap(item => patternNames(item.id)) : [node.declaration.id.name];
					exported.push(...names.map(name => name + ':' + name));
					changes.push({start: node.start, end: node.declaration.start, text: ''});
				} else {
					exported.push(...node.specifiers.map(item => item.exported.name + ':' + item.local.name));
					changes.push({start: node.start, end: node.end, text: ''});
				}
			} else if (node.type === 'ExportDefaultDeclaration') throw new Error('Reader modules: ' + path + ' has a default export');
		}
		let out = source;
		for (const change of changes.sort((a, b) => b.start - a.start)) out = out.slice(0, change.start) + change.text + out.slice(change.end);
		const block = 'modules[' + JSON.stringify(path) + '] = (() => {\n' + out + '\nreturn {' + exported.join(',') + '};\n})();';
		text.push(block);
		sizes[path] = block.length;
		blocks[path] = block;
	}
	const publish = [...globalsOf].map(([path, name]) => 'globalThis.' + name + ' = Object.freeze(modules[' + JSON.stringify(path) + ']);');
	return {text: 'const modules = {};\n' + text.join('\n') + '\n' + publish.join('\n'), sizes, blocks, order};
}
