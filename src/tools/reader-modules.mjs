// SPDX-License-Identifier: AGPL-3.0-only
import {readFile} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import acorn from '../agent/vendor/acorn.mjs';
import {lexicalBindings} from './engine-census.mjs';
const scopes = new WeakMap();
import {shakeModule, pruneImports} from './tree-shake.mjs';

const parse = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
const patternNames = pattern => pattern.type === 'Identifier' ? [pattern.name]
	: pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => patternNames(row.value || row.argument))
	: pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(patternNames)
	: pattern.type === 'AssignmentPattern' ? patternNames(pattern.left)
	: pattern.type === 'RestElement' ? patternNames(pattern.argument) : [];

export function moduleDependency(root, path, node) {
	if (!/^\.{1,2}\//.test(node.source.value) || node.attributes?.length)
		throw new Error('Unsupported module dependency; use a relative source without attributes: ' + path);
	const dependency = relative(root, resolve(root, dirname(path), node.source.value)).replaceAll('\\', '/');
	if (!dependency || dependency === '..' || dependency.startsWith('../'))
		throw new Error('Module dependency escapes the source root: ' + path);
	return dependency;
}

export function checkModuleSyntax(node, path) {
	if (node.type === 'ExportAllDeclaration' || node.type === 'ExportDefaultDeclaration')
		throw new Error('Unsupported module export in ' + path);
	if (node.type === 'ImportDeclaration') for (const row of node.specifiers)
		if (row.type !== 'ImportNamespaceSpecifier' && (row.type !== 'ImportSpecifier' || row.imported.type !== 'Identifier'))
			throw new Error('Unsupported module import in ' + path);
	if (node.type === 'ExportNamedDeclaration') for (const row of node.specifiers)
		if (row.local.type !== 'Identifier' || row.exported.type !== 'Identifier')
			throw new Error('Unsupported module export name in ' + path);
}

export const moduleExportField = (name, value) => (name === '__proto__' ? '["__proto__"]' : name) + ':' + value;
export function moduleExportNames(tree) {
	return tree.body.filter(node => node.type === 'ExportNamedDeclaration').flatMap(node => node.declaration
		? node.declaration.type === 'VariableDeclaration' ? node.declaration.declarations.flatMap(row => patternNames(row.id)) : [node.declaration.id.name]
		: node.specifiers.map(row => row.exported.name));
}

export function moduleImportText(node, dependency) {
	const owner = 'modules[' + JSON.stringify(dependency) + ']', named = node.specifiers.filter(row => row.type === 'ImportSpecifier');
	return (named.length ? 'const {' + named.map(row => row.imported.name + ':' + row.local.name).join(',') + '}=' + owner + ';' : '') +
		node.specifiers.filter(row => row.type === 'ImportNamespaceSpecifier').map(row => 'const ' + row.local.name + '=Object.freeze(' + owner + ');').join('');
}

export function readNames(text, global) {
	const ast = typeof text === 'string' ? acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'script', locations: true}) : text;
	const names = new Set(), aliases = new Set();
	const lexical = () => { if (!scopes.has(ast)) scopes.set(ast, lexicalBindings(ast)); return scopes.get(ast); };
	let all = false;
	const isGlobal = node => node?.type === 'Identifier' && node.name === global ||
		node?.type === 'MemberExpression' && (node.computed ? node.property.value : node.property.name) === global;
	const presence = (node, parent) => parent?.type === 'UnaryExpression' && ['!', 'typeof'].includes(parent.operator) ||
		parent?.type === 'LogicalExpression' && parent.operator === '&&' && parent.left === node ||
		(parent?.type === 'ConditionalExpression' || parent?.type === 'IfStatement') && parent.test === node ||
		parent?.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator);
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
		if (presence(node, parent)) return;
		if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed) names.add(parent.property.name);
		else if (parent?.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'ObjectPattern' &&
			parent.id.properties.every(row => row.type === 'Property' && !row.computed)) parent.id.properties.forEach(row => names.add(row.key.name ?? row.key.value));
		else if (parent?.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier') {
			const binding = lexical().bindingAt(parent.id.name, parent.id);
			if (!binding || binding.kind !== 'const' || binding.writes.length) all = true;
			else aliases.add(binding);
		}
		else if (parent?.type === 'MemberExpression' && parent.object === node) all = true;
		else if (parent?.type === 'MemberExpression' && (parent.property === node || parent.object.name === 'globalThis')) {  }
		else all = true;
	});
	if (aliases.size) walk(ast, null, (node, parent) => {
		if (node.type !== 'Identifier' || !lexical().isReference(node) || !aliases.has(lexical().bindingAt(node.name, node))) return;
		if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
		if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed) names.add(parent.property.name);
		else if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
		else if (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return;
		else if (presence(node, parent)) return;
		else all = true;
	});
	return all ? null : names;
}

export async function bundleModules({root, entries, used, drop = () => false}) {
	const modules = new Map(), order = [], loading = new Set();
	const load = async path => {
		if (loading.has(path)) throw new Error('Reader module cycle: ' + path);
		if (modules.has(path)) return modules.get(path);
		const source = await readFile(resolve(root, path), 'utf8'), tree = parse(source);
		for (const node of tree.body) checkModuleSyntax(node, path);
		const row = {path, source, imports: [], exports: new Set(moduleExportNames(tree))};
		loading.add(path);
		modules.set(path, row);
		for (const node of tree.body) if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) {
			const dependency = moduleDependency(root, path, node);
			row.imports.push(dependency);
			const owner = await load(dependency);
			for (const item of node.specifiers) {
				if (item.type === 'ImportNamespaceSpecifier') continue;
				const name = node.type === 'ImportDeclaration' ? item.imported.name : item.local.name;
				if (!owner.exports.has(name)) throw new Error('Missing named export ' + name + ' in ' + dependency + ' for ' + path);
			}
		}
		loading.delete(path);
		order.push(path);
		return row;
	};
	for (const path of Object.values(entries)) await load(path);
	const globalsOf = new Map(Object.entries(entries).map(([name, path]) => [path, name]));
	const requested = new Map();
	const request = (path, names) => { if (!requested.has(path)) requested.set(path, new Set()); if (names === null) requested.get(path).all = true; else for (const name of names) requested.get(path).add(name); };
	for (const [name, path] of Object.entries(entries)) { const read = used.get(name); if (read === undefined) throw new Error('Reader modules: nothing says what ' + name + ' is read for'); request(path, read); }
	const exportsOf = source => moduleExportNames(parse(source));
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
		for (const node of parse(source).body) if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) {
			const dependency = moduleDependency(root, path, node);
			request(dependency, node.specifiers.some(item => item.type === 'ImportNamespaceSpecifier') ? null
				: node.specifiers.map(item => node.type === 'ImportDeclaration' ? item.imported.name : item.local.name));
		}
	}
	const dependencies = new Map();
	for (const path of order) {
		const list = [];
		for (const node of parse(cut.get(path)).body) if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) {
			list.push(moduleDependency(root, path, node));
		}
		dependencies.set(path, list);
	}
	const reached = new Set();
	const visit = path => {
		if (!path || reached.has(path) || !cut.has(path)) return;
		reached.add(path);
		for (const dependency of dependencies.get(path) || []) visit(dependency);
	};
	for (const path of Object.values(entries)) visit(path);

	const text = [], sizes = {}, blocks = {};
	for (const path of order) {
		if (!reached.has(path)) continue;
		const source = cut.get(path), tree = parse(source), changes = [], exported = [];
		for (const node of tree.body) {
			if (node.type === 'ImportDeclaration') {
				changes.push({start: node.start, end: node.end, text: moduleImportText(node, moduleDependency(root, path, node))});
			} else if (node.type === 'ExportNamedDeclaration') {
				if (node.source) {
					const owner = 'modules[' + JSON.stringify(moduleDependency(root, path, node)) + ']';
					exported.push(...node.specifiers.map(item => moduleExportField(item.exported.name, owner + '.' + item.local.name)));
					changes.push({start: node.start, end: node.end, text: ''});
				} else if (node.declaration) {
					const names = node.declaration.type === 'VariableDeclaration' ? node.declaration.declarations.flatMap(item => patternNames(item.id)) : [node.declaration.id.name];
					exported.push(...names.map(name => moduleExportField(name, name)));
					changes.push({start: node.start, end: node.declaration.start, text: ''});
				} else {
					exported.push(...node.specifiers.map(item => moduleExportField(item.exported.name, item.local.name)));
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
