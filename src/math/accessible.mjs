// SPDX-License-Identifier: MIT
import {renderWithMathML} from './combined.mjs';

// Only a fresh renderer result reaches this composition. No caller-supplied markup.
export function renderAccessible(source, options = {}) {
  const result = renderWithMathML(source, options), semantic = result.semantics;
  const refuse = errors => ({...result, errors, html: '', presentation: 'refused'});
  if (result.errors.length) return refuse(result.errors);
  if (semantic.status === 'refused') return refuse(semantic.errors);
  // Native MathML links stay visible and focusable; their SVG is returned but never
  // inserted beneath aria-hidden. Ordinary formulas keep the exact visual SVG.
  if (semantic.metrics.links) return {...result, html: semantic.mathml, presentation: 'mathml'};
  if (result.svg.length + semantic.mathml.length + 256 > 40 * 1024 * 1024)
    return refuse([{code: 'resource-limit', offset: 0, message: 'The accessible formula exceeds its output budget.'}]);
  return {...result, presentation: 'svg-mathml', html: '<span class="rapier-math-accessible">' +
    '<span aria-hidden="true">' + result.svg + '</span>' +
    '<span class="rapier-math-assistive">' + semantic.mathml + '</span></span>'};
}
