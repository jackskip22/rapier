// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const MODULE_FILES = (() => { try { return JSON.parse('RAPIER_JXL_ANIMATION_FILES'); } catch (_) { return {}; } })();
	globalThis.RapierEmbeddedImages?.provideModuleFiles?.(name => Object.hasOwn(MODULE_FILES, name) ? MODULE_FILES[name] : null);
	_rapierJxlCompletePart = Object.freeze({files: Object.keys(MODULE_FILES)});
})();
