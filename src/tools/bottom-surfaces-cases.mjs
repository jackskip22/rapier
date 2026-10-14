export function checkSurfaceCases(inventory, cases) {
	const problems = [];
	if (cases?.version !== 1 || !Array.isArray(cases.cases) || !Array.isArray(cases.liveCases)) return ['invalid bottom-surface cases'];
	if (JSON.stringify(cases.viewports) !== JSON.stringify([{width: 360, height: 780}, {width: 390, height: 844}]) || JSON.stringify(cases.themes) !== JSON.stringify(['light', 'dark'])) problems.push('the two phone viewports and both themes are required');
	const seen = new Set();
	for (const row of cases.cases) {
		const surface = inventory.surfaces.find(entry => entry.id === row.id);
		if (seen.has(row.id)) problems.push(row.id + ': duplicate browser case');
		seen.add(row.id);
		if (!surface) { problems.push(row.id + ': case has no inventory surface'); continue; }
		if (row.selector !== surface.selector || JSON.stringify(row.rule) !== JSON.stringify({file: surface.file, ...surface.rule})) problems.push(row.id + ': browser case has stale positioning evidence');
		if (Boolean(row.component) === Boolean(row.inactive)) problems.push(row.id + ': decide a component case or an inactive source condition');
		if (row.inactive && (!row.inactive.condition || !row.inactive.reason)) problems.push(row.id + ': inactivity needs evidence');
		if (row.component && !['surface', 'paste-pseudo', 'format-toolbar', 'wrap-row', 'existing-toast', 'restore-panel', 'dialog', 'control'].includes(row.component.kind)) problems.push(row.id + ': unknown component driver');
	}
	for (const surface of inventory.surfaces) if (!seen.has(surface.id)) problems.push(surface.id + ': no browser case');
	for (const row of cases.liveCases) {
		if (!['format', 'wrap', 'settings', 'command', 'notes', 'notes-sheet', 'draw'].includes(row.open)) problems.push(row.id + ': unknown live opener');
		for (const id of row.surfaces) if (!inventory.surfaces.some(entry => entry.id === id)) problems.push(row.id + ': unknown live surface ' + id);
	}
	return problems;
}
