import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import acorn from '../agent/vendor/acorn.mjs';
import parseCSS from './vendor/postcss-parse.cjs';
import {SURFACE_ROLES} from '../layout/occlusion.mjs';
import {checkSurfaceCases} from './bottom-surfaces-cases.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EDGES = new Set(['bottom', 'inset', 'inset-block', 'inset-block-end', 'inset-block-start', 'inset-inline', 'inset-inline-end', 'inset-inline-start']);
const POSITIONING = new Set(['position', 'top', 'right', 'bottom', 'left', ...EDGES, 'transform', 'translate', 'writing-mode']);

function decoded(value) {
	let out = '';
	for (let i = 0; i < value.length; i++) {
		if (value[i] !== '\\') { out += value[i]; continue; }
		i++;
		let hex = '';
		while (hex.length < 6 && i < value.length && '0123456789abcdefABCDEF'.includes(value[i])) hex += value[i++];
		if (hex) {
			const code = parseInt(hex, 16);
			out += String.fromCodePoint(!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code);
			if (i < value.length && ' \n\r\t\f'.includes(value[i])) { if (value[i] === '\r' && value[i + 1] === '\n') i++; }
			else i--;
		} else if (i < value.length) out += value[i];
	}
	return out.trim().toLowerCase();
}

export function scanCSS(source, file = 'fixture.css', origin = 'stylesheet') {
	const tree = parseCSS(source, {from: file}), records = [], seen = new Map();
	tree.walkAtRules(rule => { if (decoded(rule.name) === 'import') throw new Error(file + ': @import escapes the declared local stylesheets'); });
	tree.walkRules(rule => {
		const at = [];
		for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
			if (parent.type === 'rule') throw new Error(file + ': nested selector needs an explicit expansion before inventory');
			if (parent.type === 'atrule') at.unshift({name: decoded(parent.name), params: parent.params.trim()});
		}
		const declarations = [];
		rule.each(node => {
			if (node.type === 'decl' && POSITIONING.has(decoded(node.prop))) declarations.push({property: decoded(node.prop), value: node.value.trim(), important: node.important === true});
		});
		const candidate = declarations.some(d => EDGES.has(d.property) || d.property === 'position' && !['static', 'relative', 'absolute', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(decoded(d.value)));
		if (!candidate) return;
		if (at.some(a => a.name.endsWith('keyframes'))) throw new Error(file + ': positioned keyframes need an explicit surface owner');
		for (const selector of rule.selectors) {
			const key = JSON.stringify([origin, at, selector]);
			const occurrence = (seen.get(key) || 0) + 1; seen.set(key, occurrence);
			records.push({file, selector, rule: {origin, at, occurrence, declarations}, line: rule.source.start.line});
		}
	});
	return records;
}

const property = node => node?.type === 'MemberExpression' ? node.computed ? node.property.type === 'Literal' ? node.property.value : null : node.property.name : null;
const staticString = node => {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
	if (node?.type === 'BinaryExpression' && node.operator === '+') { const a = staticString(node.left), b = staticString(node.right); if (a !== null && b !== null) return a + b; }
	return null;
};

export function scanScriptStyles(source, file = 'layout/browser.js') {
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script', locations: true});
	const nodes = [];
	const walk = node => { if (!node || typeof node.type !== 'string') return; nodes.push(node); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); };
	walk(ast);
	const styles = new Set(), writes = new Map(), records = [];
	for (const node of nodes) {
		if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression' && property(node.init.callee) === 'createElement' && staticString(node.init.arguments[0])?.toLowerCase() === 'style') styles.add(node.id.name);
		if (node.type === 'NewExpression' && node.callee.name === 'CSSStyleSheet') throw new Error(file + ': constructed stylesheet needs a declared static source');
	}
	for (const node of nodes) {
		if (node.type === 'CallExpression' && ['insertRule', 'addRule', 'replaceSync', 'replace'].includes(property(node.callee)) && (property(node.callee) !== 'replace' || styles.has(node.callee.object?.name))) throw new Error(file + ': unscanned stylesheet mutation at ' + node.loc.start.line);
		if (node.type === 'CallExpression' && ['append', 'appendChild', 'insertAdjacentHTML'].includes(property(node.callee)) && styles.has(node.callee.object?.name)) throw new Error(file + ': stylesheet write must use a static textContent assignment');
		if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression' || !styles.has(node.left.object?.name)) continue;
		if (!['textContent', 'innerHTML'].includes(property(node.left))) continue;
		const css = staticString(node.right), binding = node.left.object.name;
		if (css === null || node.operator !== '=') throw new Error(file + ': dynamic stylesheet ' + binding + ' at ' + node.loc.start.line);
		const occurrence = (writes.get(binding) || 0) + 1; writes.set(binding, occurrence);
		records.push(...scanCSS(css, file, 'style:' + binding + ':' + occurrence));
	}
	for (const binding of styles) if (!writes.has(binding)) throw new Error(file + ': style element has no inventoried static write: ' + binding);
	return records;
}

export function scanBottomSurfaces(root = ROOT) {
	const files = [];
	const collect = dir => {
		for (const entry of readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) collect(path);
			else if (entry.name.endsWith('.css')) files.push(path);
		}
	};
	collect(join(root, 'editor/styles'));
	files.push(join(root, 'spec/markdown-style.css'));
	const records = files.flatMap(path => scanCSS(readFileSync(path, 'utf8'), relative(root, path).split('\\').join('/')));
	return [...records, ...scanScriptStyles(readFileSync(join(root, 'layout/browser.js'), 'utf8'))];
}

export const ruleIdentity = entry => JSON.stringify([entry.file, entry.selector, entry.rule]);

export function compareInventory(found, inventory) {
	const problems = [];
	if (inventory?.version !== 1 || !Array.isArray(inventory.surfaces) || !Array.isArray(inventory.localRules)) return ['invalid bottom-surfaces inventory'];
	const expected = new Map(), ids = new Set();
	for (const [kind, entries] of [['surface', inventory.surfaces], ['local', inventory.localRules]]) {
		for (const entry of entries) {
			if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) { problems.push('duplicate or missing inventory id'); continue; }
			ids.add(entry.id);
			if (!entry.file || !entry.selector || !entry.rule || typeof entry.reason !== 'string' || entry.reason.length < 20) problems.push(entry.id + ': file, selector, rule and reason required');
			if (kind === 'surface' && (!SURFACE_ROLES.includes(entry.role) || typeof entry.interactive !== 'boolean')) problems.push(entry.id + ': role and interactivity undecided');
			if (kind === 'local' && !entry.owner) problems.push(entry.id + ': local rule needs its containing owner');
			const key = ruleIdentity(entry);
			if (expected.has(key)) problems.push(entry.id + ': duplicate positioning rule');
			expected.set(key, entry.id);
		}
	}
	const observed = new Set();
	for (const entry of found) {
		const key = ruleIdentity(entry); observed.add(key);
		if (!expected.has(key)) problems.push(entry.file + ':' + entry.line + ' ' + entry.selector + ': undeclared or changed positioning rule');
	}
	for (const [key, id] of expected) if (!observed.has(key)) problems.push(id + ': stale positioning declaration');
	for (const entry of inventory.surfaces) {
		if (entry.role !== 'storey') continue;
		let node = entry; const seen = new Set([entry.id]);
		while (node.role === 'storey') {
			const parent = inventory.surfaces.find(row => row.id === node.on);
			if (!parent || !['bar', 'storey'].includes(parent.role) || seen.has(parent.id)) { problems.push(entry.id + ': missing/cyclic storey support'); break; }
			seen.add(parent.id); node = parent;
		}
	}
	return problems;
}

export function checkBottomSurfaces(root = ROOT) {
	const found = scanBottomSurfaces(root), inventory = JSON.parse(readFileSync(join(root, 'layout/bottom-surfaces.json'), 'utf8'));
	const cases = JSON.parse(readFileSync(join(root, 'tools/witnesses/fixtures/bottom-surfaces-cases.json'), 'utf8'));
	return {problems: [...compareInventory(found, inventory), ...checkSurfaceCases(inventory, cases)], rules: new Set(found.map(({file, rule, line}) => JSON.stringify([file, rule.origin, line]))).size,
		selectors: found.length, surfaces: inventory.surfaces.length, localRules: inventory.localRules.length, files: new Set(found.map(entry => entry.file)).size};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (process.argv.includes('--check')) {
			const result = checkBottomSurfaces();
			if (result.problems.length) { console.error(result.problems.join('\n')); process.exitCode = 1; }
			else console.log('bottom surfaces: ' + JSON.stringify(result));
		} else console.log(JSON.stringify(scanBottomSurfaces(), null, 2));
	} catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
