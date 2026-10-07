// SPDX-License-Identifier: AGPL-3.0-only
// Device storage and the tool catalogue share these value domains: one table per control the person has.
// `agent: false` marks a control that stays the person's alone; no door lets an agent change it.
export const PREFERENCE_ACCENTS = Object.freeze([
	Object.freeze({ name: 'Teal',   accent: '#12A594', fg: '#000000' }),
	Object.freeze({ name: 'Blue',   accent: '#3291ff', fg: '#000000' }),
	Object.freeze({ name: 'Amber',  accent: '#F38020', fg: '#000000' }),
	Object.freeze({ name: 'Green',  accent: '#45D483', fg: '#000000' }),
	Object.freeze({ name: 'Red',    accent: '#E5484D', fg: '#000000' }),
	Object.freeze({ name: 'Purple', accent: '#8E4EC6', fg: '#ffffff' }),
	Object.freeze({ name: 'Pink',   accent: '#E93D82', fg: '#000000' }),
	Object.freeze({ name: 'Gray',   accent: '#8F8F8F', fg: '#000000' }),
]);
export const PREFERENCE_DEFINITIONS = Object.freeze({
	accent:         Object.freeze({ key: 'rapier:preference:accent', fallback: '#12A594', values: Object.freeze(PREFERENCE_ACCENTS.map(preset => preset.accent)) }),
	theme:          Object.freeze({ key: 'rapier:preference:theme', fallback: 'system', values: Object.freeze(['dark', 'light', 'system']) }),
	fontSize:       Object.freeze({ key: 'rapier:preference:font-size', fallback: 'md', values: Object.freeze(['sm', 'md', 'lg', 'xl']) }),
	checker:        Object.freeze({ key: 'rapier:preference:checker', fallback: true }),
	assets:         Object.freeze({ key: 'rapier:preference:assets', fallback: false, agent: false }),
	lineNums:       Object.freeze({ key: 'rapier:preference:line-numbers', fallback: 'auto', values: Object.freeze(['auto', 'off', 'selected', 'all']) }),
	imageStorage:   Object.freeze({ key: 'rapier:preference:image-storage', fallback: 'jxl', values: Object.freeze(['jxl', 'original']) }),
	inkColour:      Object.freeze({ key: 'rapier:preference:ink-colour', fallback: '#b32034', pattern: '^#[0-9a-fA-F]{6}$' }),
	inkWidth:       Object.freeze({ key: 'rapier:preference:ink-width', fallback: '9', values: Object.freeze(Array.from({ length: 23 }, (_, i) => String(i + 2))) }),
	inkStylus:      Object.freeze({ key: 'rapier:preference:ink-stylus', fallback: 'on', values: Object.freeze(['on', 'off']) }),
	wrap:           Object.freeze({ key: 'rapier:preference:wrap', fallback: true }),
	dim:            Object.freeze({ key: 'rapier:preference:dim', fallback: 'dim', values: Object.freeze(['dim', 'full']) }),
	lineFit:        Object.freeze({ key: 'rapier:preference:line-fit', fallback: 'truncate', values: Object.freeze(['truncate', 'resize']) }),
	readOnly:       Object.freeze({ key: 'rapier:preference:read-only', fallback: false, agent: false }),
	showPlayButton: Object.freeze({ key: 'rapier:preference:show-play-button', fallback: false }),
	highlights:     Object.freeze({ key: 'rapier:preference:highlights', fallback: 'standard', values: Object.freeze(['standard', 'accent']) }),
	highlightColor: Object.freeze({ key: 'rapier:preference:highlight-color', fallback: 'default', values: Object.freeze(['default', 'green', 'red', 'blue', 'yellow', 'purple']) }),
	headings:       Object.freeze({ key: 'rapier:preference:headings', fallback: 'expanded', values: Object.freeze(['off', 'collapsed', 'expanded']) }),
	layout:         Object.freeze({ key: 'rapier:preference:layout', fallback: 'rapier', values: Object.freeze(['rapier', 'plain']) }),
	notesSkills:    Object.freeze({ key: 'rapier:preference:notes-skills', fallback: false, agent: false }),
	notesStart:     Object.freeze({ key: 'rapier:preference:notes-start', fallback: 'editor', values: Object.freeze(['editor', 'notes']) }),
	notesSort:      Object.freeze({ key: 'rapier:preference:notes-sort', fallback: 'custom', values: Object.freeze(['custom', 'created', 'modified']) }),
	notesLayout:    Object.freeze({ key: 'rapier:preference:notes-layout', fallback: 'half', values: Object.freeze(['half', 'full']) }),
	notesColour:    Object.freeze({ key: 'rapier:preference:notes-colour', fallback: 'bar', values: Object.freeze(['bar', 'page']) }),
});
