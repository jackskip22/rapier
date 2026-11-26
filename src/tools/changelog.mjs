// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';

const HEADING = /^## (\d+)\.(\d+)\.(\d+) \((\d{4}-\d{2}-\d{2})\)$/;
const FULL_CHANGELOG = /^\*\*Full Changelog\*\*: https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/compare\/v\d+\.\d+\.\d+\.\.\.v\d+\.\d+\.\d+$/;

export const JXL_HISTORY_BASELINE = Object.freeze({
	repository: 'jackskip22/rapier-jxl', ref: 'v8.5.0', source: 'GitHub Releases', fixture: 'jxl-published-notes.json',
	fixtureSha256: '3179870f07e786e41dca1da5f81e1c3b059501c5d4baacdaa4489287f57fc36b', firstVersion: '8.0.0',
	notes: Object.freeze({
		'8.0.0': 'a05be206c4c444894e94a4042823e6d3278810cbeebb2a12981eaa78c122e34a',
		'8.0.1': '22c7b47ec1c65b551b4e0a79115a5212fd9fdd2e1f1ef00ef378d3c43c48f0d8',
		'8.1.0': 'a7a95a4f46c76f284e6d7a83b91ab0d057a938f03ecb6f7d23523265b7aa9287',
		'8.2.0': '403b91a85a2f618cf2279d9acd39c730dfce87ec8d0be25cc3033fc2f982c4fd',
		'8.3.0': 'fa1e4e7c51e8ade93727317d14a04ffc92628811830e27601bc3c618c9f95379',
		'8.3.1': 'd19e32da5dea8358c5830b6ffbd49609b30feac90cd94b0b4c9a607fbbcaea08',
		'8.3.2': '9fa1b6d6924fd28ae17076e8b41825e825b214e4a18fd7f5989fcc127f461d0c',
		'8.3.3': 'e1d7927738c7af2f24f3da7d11cc0a713fe5f3bd911b238d7905304f15dafc06',
		'8.3.4': '11966165b57e4863786b623f54657773630a69ba99b7559e9dc9cbe6df37fa50',
		'8.3.5': 'eaafdf0fdb3ebd3e58cfd0fc34af3eecdab3525904bdf79281dd2f25a69a5713',
		'8.4.0': 'd2a44374ecd44aac4da410f086754c935d84f1913bbd04449f10d0f7d3ecd962',
		'8.4.1': '5b4df72c55188a1490d4872841d13de67f724d5001ac32bb4ae86dc24225796b',
		'8.5.0': 'c596316031377aebac87f54426f4e422940f843f97f300d72919fd653825129a',
	}),
});

export const JXL_HISTORY_REWRITES = Object.freeze({
	'8.3.0': '928d9b18c9a1526d46fa7e4e8b77f158b33722f9199cfe2a5e387d96c1893ad9',
	'8.3.2': 'd162626c115c8fb00cd1b636e0cd280773d6b062de9042d7ed76a9b9ab16f349',
});

const sha256 = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

export function jxlReleaseVersion(version) {
	return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) && Number(version.split('.')[0]) >= 8;
}

export function jxlPublishedWords(version, notes) {
	const actual = sha256(String(notes ?? '').trim());
	return actual === JXL_HISTORY_BASELINE.notes[version] || actual === JXL_HISTORY_REWRITES[version];
}

function sectionMap(text, findings) {
	const headings = [...text.matchAll(/^## ([^\n]+)$/gm)], sections = new Map();
	for (const [index, heading] of headings.entries()) {
		const item = /^(\d+\.\d+\.\d+)(?: |$)/.exec(heading[1])?.[1];
		if (!item) { findings.push('CHANGELOG.md has an invalid version heading: ' + heading[1]); continue; }
		if (!jxlReleaseVersion(item)) findings.push('CHANGELOG.md retains pre-8.0.0 section ' + item);
		if (sections.has(item)) findings.push('CHANGELOG.md repeats section ' + item);
		sections.set(item, changelogSection(text, item));
	}
	return sections;
}

export function jxlChangelogFindings(text, version, publishedVersions = []) {
	const findings = [];
	if (!jxlReleaseVersion(version)) findings.push('package version must be a release at or above 8.0.0');
	if (typeof text !== 'string') return [...findings, 'no CHANGELOG.md in the source'];
	const sections = sectionMap(text, findings);
	const required = new Set([...Object.keys(JXL_HISTORY_BASELINE.notes), version, ...publishedVersions.filter(jxlReleaseVersion)]);
	for (const item of required) {
		if (!sections.get(item)) { findings.push('CHANGELOG.md has no nonempty "## ' + item + '" section'); continue; }
		if (Object.hasOwn(JXL_HISTORY_BASELINE.notes, item) && !jxlPublishedWords(item, sections.get(item)))
			findings.push('CHANGELOG.md ' + item + ' differs from its published GitHub Release notes (' + JXL_HISTORY_BASELINE.fixture + ')');
	}
	for (const item of sections.keys())
		if (jxlReleaseVersion(item) && !required.has(item)) findings.push('unrecognized 8.x section ' + item + '; add its published notes to the basis first');
	return findings;
}

export function jxlReleaseNotes(source, version, publishedFixture) {
	if (!jxlReleaseVersion(version) || Object.hasOwn(JXL_HISTORY_BASELINE.notes, version))
		throw new Error('release notes need a new, not-yet-published 8.x version, not ' + version);
	if (typeof publishedFixture !== 'string' || sha256(publishedFixture) !== JXL_HISTORY_BASELINE.fixtureSha256)
		throw new Error('published notes fixture does not match its pinned SHA-256');
	const published = JSON.parse(publishedFixture);
	for (const [item, expected] of Object.entries(JXL_HISTORY_BASELINE.notes))
		if (sha256(String(published[item] ?? '')) !== expected) throw new Error('published notes fixture altered: ' + item);
	const findings = jxlChangelogFindings(source, version);
	if (findings.length) throw new Error('rapier-jxl ' + version + ' source changelog: ' + findings.join('; '));
	const heading = source.split('\n').find(line => line.startsWith('## ' + version + ' ') || line === '## ' + version);
	return heading + '\n\n' + changelogSection(source, version) + '\n';
}

export function jxlReleaseWorkflow(template) {
	const findings = jxlWorkflowFindings(template);
	if (findings.length) throw new Error('rapier-jxl workflow: ' + findings.join('; '));
	return template;
}

export function jxlWorkflowFindings(text) {
	if (/CHANGELOG/.test(text)) return ['workflow must not read a CHANGELOG.md: the notes come from the release commit'];
	const notes = text.indexOf('git log -1 --format=%B "$release"');
	if (notes < 0) return ['workflow must read the notes from the release commit\'s message'];
	for (const command of [/\bgh release create\b/g, /\bgit tag\b/g]) {
		const actions = [...text.matchAll(command)];
		if (actions.length !== 1 || actions[0].index < notes)
			return ['workflow must tag and release once, after the notes'];
	}
	return [];
}

export function changelogSection(text, version) {
	const lines = text.split('\n');
	const start = lines.findIndex(line => line.startsWith('## ' + version + ' ') || line === '## ' + version);
	if (start < 0) return null;
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

export function requireChangelogSection(text, label, version) {
	if (typeof text !== 'string') throw new Error(label + ' ' + version + ': no CHANGELOG.md.');
	if (!changelogSection(text, version)) throw new Error(label + ' ' + version + ': CHANGELOG.md has no "## ' + version + '" section.');
}

export function fillChangelogSection(text, version, fill) {
	const headings = [...text.matchAll(/^## ([^\n]+)$/gm)];
	const at = headings.findIndex(match => match[1] === version || match[1].startsWith(version + ' '));
	if (at < 0) throw new Error('CHANGELOG.md has no "## ' + version + '" section.');
	const start = headings[at].index, end = headings[at + 1]?.index ?? text.length;
	const before = text.slice(0, start), after = text.slice(end);
	const placeholder = /__[A-Z][A-Z_0-9]*__/.exec(before + after);
	if (placeholder) throw new Error('CHANGELOG.md historical placeholder ' + placeholder[0] + ': keep the published section before building a new version.');
	return before + fill(text.slice(start, end)) + after;
}

export function changelogShapeHits(text) {
	const hits = [], lines = text.split('\n');
	const hit = (line, match) => hits.push({line, match});
	if (lines[0] !== '# Changelog') hit(1, 'the first line is "# Changelog"');
	let previous = null, bullets = 0, heading = 0, how = 0, howBullets = 0;
	const close = () => {
		if (heading && !bullets) hit(heading, 'a section needs at least one bullet');
		if (how && !howBullets) hit(how, 'a Details part needs at least one bullet');
	};
	lines.forEach((line, index) => {
		const at = index + 1;
		if (!index || line === '') return;
		const person = /\b(we|we're|we've|our|ours|us)\b/i.exec(line.replace(/`[^`]*`/g, ''));
		if (person) hit(at, 'no first person ("' + person[1] + '"): say what the package does');
		const match = HEADING.exec(line);
		if (line.startsWith('## ')) {
			close(); heading = at; bullets = 0; how = 0; howBullets = 0;
			if (!match) { hit(at, 'headings read "## <version> (<YYYY-MM-DD>)"'); return; }
			const version = match.slice(1, 4).map(Number);
			const order = previous && (version[0] - previous[0] || version[1] - previous[1] || version[2] - previous[2]);
			if (order === 0) hit(at, 'a version appears once');
			else if (order > 0) hit(at, 'newest first');
			previous = version;
		} else if (line === '### Details') {
			if (!heading) hit(at, 'a Details part belongs under a version');
			else if (how) hit(at, 'one Details part a version');
			else if (!bullets) hit(at, 'the Details part follows what changed');
			how = at; howBullets = 0;
		} else if (FULL_CHANGELOG.test(line)) {
			if (!heading) hit(at, 'the compare link belongs under a version');
			else if (bullets || how) hit(at, 'the compare link comes first in a version');
			else if (!new RegExp('\\.\\.\\.v' + lines[heading - 1].slice(3).split(' ')[0].replaceAll('.', '\\.') + '$').test(line)) hit(at, 'the compare link ends at this version');
		} else if (line.startsWith('- ') && how) {
			howBullets++;
		} else if (line.startsWith('- ')) {
			bullets++;
			if (!heading) hit(at, 'a bullet belongs under a version');
		} else hit(at, 'only version headings, a "**Full Changelog**:" compare link, "### Details" and "- " bullets');
	});
	close();
	return hits;
}
