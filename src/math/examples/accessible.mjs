// SPDX-License-Identifier: MIT
import {renderAccessible} from '../dist/accessible.mjs';
import {observe} from '../dist/index.mjs';

const form = document.querySelector('#math-example'), source = document.querySelector('#source');
const container = document.querySelector('#equation'), status = document.querySelector('#status');
let stop = () => {};
function update(event) {
  event?.preventDefault();
  stop(); stop = () => {};
  const exactSource = source.value;
  try {
    const result = renderAccessible(exactSource, {displayMode: true});
    document.querySelector('#mathml').textContent = result.semantics.mathml;
    status.textContent = result.semantics.status + (result.semantics.errors.length
      ? ': ' + result.semantics.errors.map(error => error.message).join(' ') : '');
    if (result.errors.length) container.replaceChildren(document.createTextNode(exactSource));
    else {
      // This sink receives only newly generated package output. Authored TeX stays text.
      container.innerHTML = result.html;
      if (result.presentation === 'svg-mathml') stop = observe(container);
    }
  } catch (error) {
    container.replaceChildren(document.createTextNode(exactSource));
    status.textContent = String(error.message);
  }
}
const outer = renderAccessible(String.raw`\frac{12}{\sqrt{x}}`);
const outerElement = document.querySelector('#outer-equation');
if (!outer.errors.length) outerElement.innerHTML = outer.html;
else outerElement.textContent = String.raw`\frac{12}{\sqrt{x}}`;

const linkedSource = String.raw`\href{https://www.w3.org/TR/mathml-core/}{\frac{12}{\sqrt{x}}}`;
const linked = renderAccessible(linkedSource);
document.querySelector('#linked-source').textContent = linkedSource;
if (!linked.errors.length) document.querySelector('#linked-equation').innerHTML = linked.html;
else document.querySelector('#linked-equation').textContent = linkedSource;

form.addEventListener('submit', update);
window.addEventListener('pagehide', () => stop());
window.addEventListener('pageshow', event => { if (event.persisted) update(); });
update();
