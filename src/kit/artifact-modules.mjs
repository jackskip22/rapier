// SPDX-License-Identifier: MIT
export function _rapierArtifactFactoryModules(dependencies, group) {
  const paths = dependencies.groups && dependencies.groups[group] ? dependencies.groups[group] : Object.keys(dependencies.factories);
  return paths.map(path => 'modules[' + JSON.stringify(path) + '] = (' + Function.prototype.toString.call(dependencies.factories[path]) + ')();').join('\n');
}

export function printTypography(root, dependencies) {
  if (!root.querySelector('p[data-md-hyphens="auto"],p[data-md-lines],p[data-md-hanging="on"],p[data-rapier-typography]')) return null;
  const fail = () => Object.assign(new Error('The print document could not initialize its typography.'), {code: 'pdf_typography_unavailable'});
  if (!dependencies?.factories?.['layout/typography.mjs']) throw fail();
  const document = root.ownerDocument, script = document.createElement('script');
  script.textContent = '(() => { const modules = Object.create(null);\n' + _rapierArtifactFactoryModules(dependencies, 'layout') +
    '\ndocument.currentScript.rapierTypography = modules["layout/typography.mjs"].createTypography();\n})();';
  try {
    document.head.append(script);
    if (!script.rapierTypography) throw fail();
    return script.rapierTypography;
  } finally { script.remove(); }
}
