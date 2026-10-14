// SPDX-License-Identifier: MIT
import {render, observe} from '../dist/index.mjs';
const container = document.querySelector('#equation');
const source = document.querySelector('#source');
let stop = () => {};
function update() {
  stop();
  try {
    const result = render(source.value, {displayMode: true});
    document.querySelector('#errors').textContent = JSON.stringify(result.errors);
    if (result.errors.length) container.replaceChildren(document.createTextNode(source.value));
    else {
      // Only this renderer's freshly returned SVG reaches the HTML sink.
      container.innerHTML = result.svg;
      stop = observe(container);
    }
  } catch (error) {
    container.replaceChildren(document.createTextNode(source.value));
    document.querySelector('#errors').textContent = error.message;
  }
}
document.querySelector('#render').addEventListener('click', update);
window.addEventListener('pagehide', () => stop());
update();
