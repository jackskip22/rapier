// The HTML sink law: every markup sink in shipped code is named in security/html-sinks.json with owner, kind and why its input is safe.
// sanitizeRapierHtml alone turns document text into markup. node tools/html-sinks.mjs [--check]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import acorn from '../agent/vendor/acorn.mjs';
import {checkBottomSurfaces} from './check-bottom-surfaces.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SINK_KINDS = Object.freeze(['sanitized-document', 'static-template', 'probe', 'untrusted-parse', 'empty']);
const SINK_PROPERTIES = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const SINK_CALLS = new Set(['insertAdjacentHTML', 'write', 'writeln', 'createContextualFragment']);
// Every authored directory that ships inside rapier.html or the apps page; vendor trees are the
// libraries' own (their sinks are DOMPurify's, markdown-it's, and are not Rapier's to name).
const SCAN_DIRS = ['editor', 'draw', 'layout', 'images', 'interchange', 'agent', 'shell', 'security', 'notes'];
const SCAN_FILES = ["tools/runtime-loader.js", "kit/render.mjs", "kit/render-markdown.mjs", "kit/render-sanitize.mjs", "kit/render-print.mjs", "kit/render-styles.mjs"];

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

const propertyName = node => node.computed ? (node.property.type === 'Literal' ? String(node.property.value) : null) : node.property.name;
const isHtmlMime = node => node && node.type === 'Literal' && /^text\/html$/i.test(String(node.value));

// The owner is the nearest enclosing *named* function: a declaration, a named expression, or an
// anonymous function that a declarator, property, method or assignment names. Callbacks inside
// take their enclosing owner's name, so one owner answers for everything it does.
function ownerName(ancestors) {
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const node = ancestors[index];
		if (!/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) continue;
		if (node.id?.name) return node.id.name;
		const parent = ancestors[index - 1];
		if (!parent) continue;
		if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
		if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && !parent.computed) return parent.key.name || String(parent.key.value);
		if (parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier') return parent.left.name;
		if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression' && !parent.left.computed) return parent.left.property.name;
	}
	return '(top level)';
}

export function scanSource(source, sourceType) {
	const sinks = [];
	const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType, locations: true});
	const walk = (node, ancestors) => {
		if (!node || typeof node.type !== 'string') return;
		const here = [...ancestors, node];
		if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && SINK_PROPERTIES.has(propertyName(node.left))) {
			sinks.push({line: node.loc.start.line, sink: propertyName(node.left), owner: ownerName(ancestors)});
		}
		if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
			const name = propertyName(node.callee);
			if (SINK_CALLS.has(name) && (name !== 'write' && name !== 'writeln' || node.callee.object.type === 'Identifier' && node.callee.object.name === 'document')) sinks.push({line: node.loc.start.line, sink: name, owner: ownerName(ancestors)});
			if (name === 'parseFromString' && isHtmlMime(node.arguments[1])) sinks.push({line: node.loc.start.line, sink: 'parseFromString', owner: ownerName(ancestors)});
		}
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'type') continue;
			const value = node[key];
			if (Array.isArray(value)) { for (const item of value) if (item && typeof item.type === 'string') walk(item, here); }
			else if (value && typeof value.type === 'string') walk(value, here);
		}
	};
	walk(ast, []);
	return sinks;
}

export function scanHtmlSinks() {
	const out = {};
	for (const path of sourceFiles()) {
		const file = relative(ROOT, path).split('\\').join('/');
		const sinks = scanSource(readFileSync(path, 'utf8'), /\.mjs$/.test(path) ? 'module' : 'script');
		if (!sinks.length) continue;
		out[file] = {};
		for (const sink of sinks) out[file][sink.owner] = (out[file][sink.owner] || 0) + 1;
	}
	return out;
}

export function checkHtmlSinks(inventoryPath = join(ROOT, 'security', 'html-sinks.json')) {
	const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')).sinks;
	const found = scanHtmlSinks();
	const problems = checkBottomSurfaces().problems.map(problem => 'bottom surfaces: ' + problem);
	for (const [file, owners] of Object.entries(found)) {
		for (const [owner, count] of Object.entries(owners)) {
			const entry = inventory[file]?.[owner];
			if (!entry) { problems.push(`${file} ${owner}: ${count} HTML sink(s) not named in security/html-sinks.json`); continue; }
			if (entry.count !== count) problems.push(`${file} ${owner}: ${count} HTML sink(s), inventory says ${entry.count}`);
			if (!SINK_KINDS.includes(entry.kind)) problems.push(`${file} ${owner}: kind '${entry.kind}' is not decided (${SINK_KINDS.join(', ')})`);
			if (typeof entry.reason !== 'string' || entry.reason.length < 20) problems.push(`${file} ${owner}: no reason`);
		}
	}
	for (const [file, owners] of Object.entries(inventory)) {
		for (const owner of Object.keys(owners)) if (!found[file]?.[owner]) problems.push(`${file} ${owner}: named in security/html-sinks.json but no longer a sink`);
	}
	const total = Object.values(found).reduce((sum, owners) => sum + Object.values(owners).reduce((a, b) => a + b, 0), 0);
	return {problems, total, files: Object.keys(found).length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.includes('--check')) {
		const {problems, total, files} = checkHtmlSinks();
		if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
		console.log(`html sinks: ${total} named across ${files} files, every one owned`);
	} else console.log(JSON.stringify(scanHtmlSinks(), null, 2));
}
