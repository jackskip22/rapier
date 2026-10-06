// SPDX-License-Identifier: AGPL-3.0-only

function _rapierProjectArtifactLayout(...args) { return _rapierRenderModule('render')._rapierProjectArtifactLayout(...args); }

// One group's retained factories as the module lines an exported page's script begins with (the build publishes each
// group's paths in dependency order beside the factories).
function _rapierArtifactFactoryModules(...args) { return _rapierRenderModule('render')._rapierArtifactFactoryModules(...args); }

// The ink in an exported page: the page's own script draws every mark again from its words' boxes whenever the page
// lays out again and before it prints (layout/ink-draw.mjs watchInk), under the same nonce as the reflow script.
// Only a page carrying a mark earns it; the policy stays script-src 'none' otherwise.
function _rapierArtifactInkScript(...args) { return _rapierRenderModule('render')._rapierArtifactInkScript(...args); }

function _rapierArtifactLayoutScript(...args) { return _rapierRenderModule('render')._rapierArtifactLayoutScript(...args); }
